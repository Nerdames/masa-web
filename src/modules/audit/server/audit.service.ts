/**
 * src/core/lib/audit.ts
 * PRODUCTION-GRADE FORENSIC AUDIT ENGINE (V2.6 - FORTIFIED)
 * Optimized for: Performance, Cryptographic Integrity, and Data Persistence.
 * Fix: Bulletproofed Decimal serialization and object prototype evaluation.
 */

import prisma from "@/infrastructure/prisma/client"; // Singleton engine instance destination
import { 
  Severity, 
  ActorType, 
  Prisma, 
  Role, 
  Resource,
  CriticalAction 
} from "@prisma/client";
import crypto from "crypto";

/* -------------------------------------------------------------------------- */
/* CONSTANTS & TYPES                                                          */
/* -------------------------------------------------------------------------- */

const SENSITIVE_KEYS = ["password", "token", "secret", "access_token", "refresh_token", "pin", "staffcode"];
const DEFAULT_IP = "127.0.0.1";

// Fields that trigger automatic "CRITICAL" escalation
const HIGH_IMPACT_FIELDS = ["sellingPrice", "costPrice", "amount", "status", "deletedAt", "voidedAt"];

export type TransactionClient = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface AuditLogOptions {
  action: string;
  resource: Resource; 
  resourceId: string;
  organizationId: string;
  branchId?: string | null;
  actorId?: string | null;
  actorRole?: Role | null;
  severity?: Severity;
  critical?: boolean;
  description: string;
  changes?: { from?: any; to?: any } | any;
  ipAddress?: string | null;
  deviceInfo?: string | null;
  approvalId?: string | null;
  metadata?: Prisma.JsonObject;
  actionTrigger?: CriticalAction; 
  requestId?: string;
}

/* -------------------------------------------------------------------------- */
/* CORE UTILITIES                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Recursively redacts sensitive keys and ensures JSON compatibility.
 * Bulletproof check for Prisma.Decimal to prevent "constructor" serialization and [object Function] leaks.
 */
export function scrub(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  // 1. Handle Dates
  if (obj instanceof Date) return obj.toISOString();

  // 2. Handle Prisma Decimals (Crucial Fix for bundle boundary prototype loss)
  // Checks instanceof, constructor name, or duck-typing for standard decimal shapes
  if (
    typeof obj === 'object' && 
    (obj instanceof Prisma.Decimal || 
     obj.constructor?.name === 'Decimal' || 
     typeof obj.toNumber === 'function')
  ) {
    return obj.toString();
  }

  // 3. Handle Arrays
  if (Array.isArray(obj)) {
    return obj.map(item => scrub(item));
  }

  // 4. Handle Objects safely
  if (typeof obj === "object") {
    const scrubbed: Record<string, any> = {};
    // Iterate only own enumerable properties to avoid prototype/constructor leaks
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (SENSITIVE_KEYS.some(s => key.toLowerCase().includes(s))) {
          scrubbed[key] = "[REDACTED]";
        } else {
          scrubbed[key] = scrub(obj[key]);
        }
      }
    }
    return scrubbed;
  }

  return obj;
}

/**
 * Ensures consistent JSON stringification for reliable cryptographic hashing.
 */
export function deterministicStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);

  // Handle primitives wrapped as objects
  if (obj instanceof Date) return JSON.stringify(obj.toISOString());
  if (obj.constructor?.name === 'Decimal' || typeof obj.toNumber === 'function') {
    return JSON.stringify(obj.toString());
  }

  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => `${JSON.stringify(k)}:${deterministicStringify(obj[k])}`).join(",") + "}";
}

/**
 * Validates if a string is a valid member of the CriticalAction enum.
 */
function isValidCriticalAction(value: any): value is CriticalAction {
  return Object.values(CriticalAction).includes(value as CriticalAction);
}

/* -------------------------------------------------------------------------- */
/* PRODUCTION EXPORTS                                                         */
/* -------------------------------------------------------------------------- */

/**
 * CREATE AUDIT LOG
 * Core forensic engine that handles hash-chaining and data persistence.
 */
export async function createAuditLog(
  tx: TransactionClient = prisma,
  options: AuditLogOptions
) {
  const {
    action,
    resource,
    resourceId,
    organizationId,
    branchId,
    actorId,
    actorRole,
    severity = Severity.LOW,
    description,
    changes,
    ipAddress = DEFAULT_IP,
    deviceInfo = "system",
    approvalId,
    actionTrigger,
    metadata: extraMetadata = {},
    requestId = crypto.randomUUID(),
  } = options;

  // 1. FORENSIC CHAINING (Linear Integrity)
  const lastLogs = await tx.$queryRaw<Pick<Prisma.ActivityLogGetPayload<{}>, 'hash'>[]>`
    SELECT hash FROM "ActivityLog" 
    WHERE "organizationId" = ${organizationId} 
    ORDER BY "createdAt" DESC 
    LIMIT 1 
    FOR UPDATE
  `;

  const previousHash = lastLogs.length > 0 ? lastLogs[0].hash : "0".repeat(64);
  const createdAt = new Date();

  // 2. DATA PREPARATION & AUTO-ESCALATION
  const isDiff = changes && typeof changes === 'object' && ('from' in changes || 'to' in changes);
  const before = scrub(isDiff ? changes.from : Prisma.JsonNull);
  const after = scrub(isDiff ? changes.to : (changes || Prisma.JsonNull));

  const changedKeys = after && typeof after === 'object' ? Object.keys(after) : [];
  const hasHighImpact = changedKeys.some(k => HIGH_IMPACT_FIELDS.includes(k));
  const isCritical = options.critical || hasHighImpact || severity === Severity.CRITICAL || severity === Severity.HIGH;

  // 3. CRYPTOGRAPHIC HASHING
  const hashPayload = {
    action,
    organizationId,
    actorId,
    previousHash,
    requestId,
    timestamp: createdAt.getTime(),
    before,
    after,
  };

  const hash = crypto
    .createHash("sha256")
    .update(deterministicStringify(hashPayload))
    .digest("hex");

  // 4. PERSISTENCE
  // Extracted generic query client to preserve transaction context safely across dynamic lookups
  const log = await (tx as any).activityLog.create({
    data: {
      organizationId,
      branchId: branchId ?? undefined,
      actorId,
      actorType: actorId ? ActorType.USER : ActorType.SYSTEM,
      actorRole: actorRole ?? undefined,
      action,
      description,
      severity: isCritical ? Severity.CRITICAL : severity,
      critical: isCritical,
      targetId: resourceId,
      targetType: resource,
      before: before ?? Prisma.JsonNull,
      after: after ?? Prisma.JsonNull,
      requestId,
      ipAddress: ipAddress || DEFAULT_IP,
      deviceInfo: deviceInfo || "system",
      previousHash,
      hash,
      approvalId,
      createdAt,
      metadata: { 
        ...extraMetadata, 
        correlationId: requestId,
        actionTrigger: isValidCriticalAction(actionTrigger) ? actionTrigger : undefined 
      } as Prisma.InputJsonValue,
    },
  });

  return log;
}

export async function verifyAuditIntegrity(organizationId: string) {
  const logs = await prisma.activityLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" }
  });

  for (let i = 1; i < logs.length; i++) {
    const current = logs[i];
    const previous = logs[i - 1];

    if (current.previousHash !== previous.hash) {
      return { 
        valid: false, 
        corruptedAt: current.id, 
        reason: `Hash broken. Expected: ${previous.hash.substring(0,8)}, Got: ${current.previousHash.substring(0,8)}` 
      };
    }
  }

  return { valid: true, count: logs.length };
}