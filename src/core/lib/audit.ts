import prisma from "@/core/lib/prisma";
import { Severity, ActorType, Prisma, Role } from "@prisma/client";
import crypto from "crypto";

/**
 * Correctly type the transaction client to support Prisma extensions.
 */
export type TransactionClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface AuditLogOptions {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
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
}

/**
 * Production-grade Audit Logging with Cryptographic Integrity Chaining
 */
export async function createAuditLog(
  tx: TransactionClient | typeof prisma = prisma,
  {
    action,
    entityType,
    entityId,
    organizationId,
    branchId,
    actorId,
    actorRole,
    severity = Severity.LOW,
    critical = false,
    description,
    changes = {},
    ipAddress = "127.0.0.1",
    deviceInfo = "system",
    approvalId,
  }: AuditLogOptions
) {
  // 1. Fetch the last log's hash for this organization to maintain the cryptographic chain [cite: 1765-1767]
  const lastLog = await tx.activityLog.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: { hash: true },
  });

  const previousHash = lastLog?.hash ?? null;
  const requestId = crypto.randomUUID();
  const timestamp = Date.now();

  // 2. Prepare the metadata and state tracking [cite: 1757-1759, 1764]
  const before = changes?.from ?? Prisma.JsonNull;
  const after = changes?.to ?? (changes?.from ? Prisma.JsonNull : changes ?? Prisma.JsonNull);

  const metadata: Prisma.JsonObject = {
    ipAddress,
    deviceInfo,
    actorRole,
    approvalId,
  };

  // 3. Generate Cryptographic Hash for Integrity 
  const hashPayload = {
    action,
    organizationId,
    actorId,
    previousHash,
    requestId,
    timestamp,
    metadata,
  };
  
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(hashPayload))
    .digest("hex");

  // 4. Persistence [cite: 1741-1785]
  return await tx.activityLog.create({
    data: {
      organizationId,
      branchId,
      actorId,
      actorType: actorId ? ActorType.USER : ActorType.SYSTEM,
      actorRole,
      action,
      description,
      severity,
      critical,
      targetId: entityId,
      targetType: entityType,
      before,
      after,
      requestId,
      ipAddress,
      deviceInfo,
      previousHash,
      hash,
      approvalId,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}