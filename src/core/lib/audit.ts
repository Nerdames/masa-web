/**
 * src/core/lib/audit.ts
 * PRODUCTION-GRADE FORENSIC AUDIT ENGINE (V2.5 - FORTRESS)
 * * Optimized for: Performance, Cryptographic Integrity, and Event-Driven Architecture.
 */

import prisma from "@/core/lib/prisma";
import { 
  Severity, 
  ActorType, 
  Prisma, 
  Role, 
  Resource,
  NotificationType,
  CriticalAction 
} from "@prisma/client";
import crypto from "crypto";
import { eventBus } from "@/core/events";

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

export function scrub(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (obj instanceof Date) return obj.toISOString();
  
  const scrubbed = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key in scrubbed) {
    if (SENSITIVE_KEYS.some(s => key.toLowerCase().includes(s))) {
      scrubbed[key] = "[REDACTED]";
    } else if (typeof scrubbed[key] === "object") {
      scrubbed[key] = scrub(scrubbed[key]);
    }
  }
  return scrubbed;
}

export function deterministicStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => `${JSON.stringify(k)}:${deterministicStringify(obj[k])}`).join(",") + "}";
}

function getAlertCategory(resource: Resource): NotificationType {
  const mapping: Partial<Record<Resource, NotificationType>> = {
    [Resource.FINANCE]: NotificationType.FINANCIAL,
    [Resource.STOCK]: NotificationType.INVENTORY,
    [Resource.PRODUCT]: NotificationType.INVENTORY,
    [Resource.PERSONNEL]: NotificationType.SECURITY,
    [Resource.AUDIT]: NotificationType.SECURITY,
  };
  return mapping[resource] || NotificationType.SYSTEM;
}

/**
 * Validates if a string is a valid member of the CriticalAction enum.
 * This prevents the engine from crashing if a developer accidentally passes a message string.
 */
function isValidCriticalAction(value: any): value is CriticalAction {
  return Object.values(CriticalAction).includes(value as CriticalAction);
}

/* -------------------------------------------------------------------------- */
/* PRODUCTION EXPORTS                                                         */
/* -------------------------------------------------------------------------- */

/**
 * NOTIFY MANAGEMENT
 * Standardized dispatcher for critical alerts. 
 */
export async function notifyManagement(
  tx: TransactionClient,
  organizationId: string,
  branchId: string | null | undefined,
  log: any,
  actionTrigger?: CriticalAction
) {
  const targets = await (tx as any).authorizedPersonnel.findMany({
    where: {
      organizationId,
      deletedAt: null,
      disabled: false,
      OR: [
        { role: Role.ADMIN }, 
        { role: Role.MANAGER }, 
        { role: Role.AUDITOR }, 
        { isOrgOwner: true }
      ],
    },
    select: { id: true },
  });

  if (targets.length === 0) return;

  // ENSURE: Mandatory fields are present and actionTrigger is valid enum
  const safeTitle = `CRITICAL: ${log.action || 'Audit Event'}`;
  const safeMessage = log.description || `Critical security event on ${log.targetType}`;
  
  // FIX: If actionTrigger is not a valid Enum (e.g. a message string), nullify it for DB safety
  const validatedTrigger = isValidCriticalAction(actionTrigger) ? actionTrigger : undefined;

  await (tx as any).notification.create({
    data: {
      organizationId,
      branchId: branchId ?? undefined,
      type: getAlertCategory(log.targetType as Resource),
      title: safeTitle,
      message: safeMessage,
      activityLogId: log.id, // Mandatory for the FK constraint
      actionTrigger: validatedTrigger,
      recipients: {
        create: targets.map((t: { id: string }) => ({ personnelId: t.id })),
      },
    },
  });
}

/**
 * CREATE AUDIT LOG
 * Production-grade engine with hash-chaining and auto-escalation.
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

  // 2. AUTO-ESCALATION LOGIC
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
      before,
      after,
      requestId,
      ipAddress: ipAddress || DEFAULT_IP,
      deviceInfo: deviceInfo || "system",
      previousHash,
      hash,
      approvalId,
      createdAt,
      metadata: { ...extraMetadata, correlationId: requestId } as Prisma.InputJsonValue,
    },
  });

  // 5. TRANSACTIONAL ESCALATION
  // We pass 'log' object which now contains the valid ID for Foreign Key constraints
  if (isCritical) {
    await notifyManagement(tx, organizationId, branchId, log, actionTrigger);
  }

  // 6. ASYNC EVENT BUS EMISSION
  setImmediate(() => {
    eventBus.emit("audit:log:created", log);
    if (isCritical) {
      // FIX: Payload standardized for the handleSecurityAlert listener
      eventBus.emit("security.alert", {
        organizationId: log.organizationId,
        branchId: log.branchId,
        activityLogId: log.id, // Mandatory for listener to avoid P2003
        actionTrigger: isValidCriticalAction(actionTrigger) ? actionTrigger : undefined,
        notificationType: 'SECURITY',
        title: `CRITICAL: ${log.action}`,
        message: log.description || `Security event on ${log.targetType}`,
        severity: log.severity,
      });
    }
  });

  return log;
}

/**
 * INTEGRITY VERIFIER
 */
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