import prisma from "@/core/lib/prisma";
import { Severity, ActorType } from "@prisma/client";
import crypto from "crypto";

export async function createAuditLog({
  action,
  entityType,
  entityId,
  organizationId,
  actorId,
  severity = Severity.LOW,
  description,
  changes = {},
}: {
  action: string;
  entityType: string;
  entityId: string;
  organizationId: string;
  actorId: string;
  severity?: Severity;
  description: string;
  changes?: any;
}) {
  const logData = {
    action,
    description,
    organizationId,
    actorId,
    targetId: entityId,
    targetType: entityType,
    requestId: crypto.randomUUID(),
  };

  // Generate Hash for Integrity
  const lastLog = await prisma.activityLog.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: { hash: true },
  });
  
  const previousHash = lastLog?.hash ?? "GENESIS";
  const hash = crypto.createHash("sha256").update(JSON.stringify(logData)).digest("hex");

  return await prisma.activityLog.create({
    data: {
      ...logData,
      actorType: ActorType.USER,
      severity,
      previousHash,
      hash,
      before: changes.from || {},
      after: changes.to || changes, // Handle both single object or from/to
      metadata: {},
    },
  });
}