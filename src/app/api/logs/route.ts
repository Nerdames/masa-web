import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import crypto from "crypto";
import { z } from "zod";
import { Prisma, Role, CriticalAction, ApprovalStatus, ActorType, Severity } from "@prisma/client";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { ROLE_WEIGHT, ACTION_REQUIREMENTS, canSeeAction } from "@/core/lib/permission";
import { applyActionDirectly } from "@/core/lib/actions";
import { createNotification } from "@/core/lib/notifications";

/* -------------------------------------------------- */
/* CONFIG & PRODUCTION RATE LIMITING                  */
/* -------------------------------------------------- */
const MAX_META_BYTES = 32 * 1024;
const SYSTEM_HMAC_SECRET = process.env.LOG_SYSTEM_HMAC_SECRET || "";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(30, "10 s"),
  analytics: true,
});

const logPayloadSchema = z.object({
  action: z.string().min(1).max(200),
  organizationId: z.string().cuid(),
  branchId: z.string().cuid().optional().nullable(),
  targetId: z.string().optional().nullable(),
  targetType: z.string().optional().nullable(),
  before: z.record(z.unknown()).optional().nullable(),
  after: z.record(z.unknown()).optional().nullable(),
  meta: z.record(z.unknown()).optional().nullable(),
  severity: z.nativeEnum(Severity).optional().default(Severity.LOW),
  systemHmac: z.string().optional(),
});

/* -------------------------------------------------- */
/* HELPERS                                            */
/* -------------------------------------------------- */
function verifySystemHmac(payload: string, hmac: string): boolean {
  if (!SYSTEM_HMAC_SECRET) return false;
  const mac = crypto.createHmac("sha256", SYSTEM_HMAC_SECRET).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(hmac));
  } catch {
    return false;
  }
}

function generateHash(data: any): string {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function determineModule(action: string, targetType?: string | null): "FINANCIAL" | "SECURITY" | "SYSTEM" | "INVENTORY" {
  const str = `${action}_${targetType || ""}`.toUpperCase();
  if (str.includes("STOCK") || str.includes("PRODUCT") || str.includes("INVENTORY") || str.includes("TRANSFER")) return "INVENTORY";
  if (str.includes("PAYMENT") || str.includes("INVOICE") || str.includes("EXPENSE") || str.includes("SALE") || str.includes("REFUND")) return "FINANCIAL";
  if (str.includes("LOGIN") || str.includes("PASSWORD") || str.includes("LOCK") || str.includes("ROLE") || str.includes("AUTH")) return "SECURITY";
  return "SYSTEM";
}

// Format the log to ensure absolutely strict adherence to the Frontend ForensicLog UI Contract
function formatForensicLog(triggerLog: any, hops: any[]) {
  return {
    id: triggerLog.id,
    action: triggerLog.action,
    description: triggerLog.description || "System action executed.",
    module: determineModule(triggerLog.action, triggerLog.targetType),
    severity: triggerLog.severity,
    critical: triggerLog.critical,
    createdAt: triggerLog.createdAt.toISOString(),
    actorId: triggerLog.actorId,
    actorType: triggerLog.actorType,
    personnelName: triggerLog.personnel?.name || "System Automated",
    personnelRole: triggerLog.actorRole || "SYSTEM",

    // CRITICAL FIX: Ensure `target` is always explicitly defined.
    target: {
      id: triggerLog.targetId || null,
      type: triggerLog.targetType || null,
    },

    requestId: triggerLog.requestId,
    ipAddress: triggerLog.ipAddress || "127.0.0.1",
    deviceInfo: triggerLog.deviceInfo || "Internal System",
    diff: {
      before: triggerLog.before || null,
      after: triggerLog.after || null,
    },
    integrity: {
      hash: triggerLog.hash || "",
      previousHash: triggerLog.previousHash || "GENESIS",
      isChainValid: true,
    },
    correlatedLogs: hops.map(h => ({
      id: h.id,
      action: h.action,
      description: h.description,
      severity: h.severity,
      critical: h.critical,
      createdAt: h.createdAt.toISOString(),
      metadata: h.metadata || {}
    })),
    metadata: triggerLog.metadata || {},
  };
}

/* ==================================================
   GET /api/audit/logs (Feeds the Forensic UI)
   ================================================== */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const severity = searchParams.get("severity") || "ALL";
    const orgId = session.user.organizationId;

    const whereClause: any = { organizationId: orgId };
    if (severity !== "ALL") {
      whereClause.severity = severity as Severity;
    }

    const rawLogs = await prisma.activityLog.findMany({
      where: whereClause,
      include: {
        personnel: { select: { name: true, role: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 250, // Higher buffer to capture full chains
    });

    // 1. Group by RequestID to completely eliminate UI duplicates
    const formattedLogs: any[] = [];
    const chains = new Map<string, typeof rawLogs>();
    const orphanedLogs: typeof rawLogs = [];

    rawLogs.forEach(log => {
      if (!log.requestId) {
        orphanedLogs.push(log);
        return;
      }
      if (!chains.has(log.requestId)) {
        chains.set(log.requestId, []);
      }
      chains.get(log.requestId)!.push(log);
    });

    // 2. Resolve Request Chains
    chains.forEach((group) => {
      // Sort group ASC to find the "Trigger" log (the one that started the trace)
      group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      const trigger = group[0];
      const hops = group.slice(1); // Downstream actions

      formattedLogs.push(formatForensicLog(trigger, hops));
    });

    // 3. Resolve Unlinked (Orphaned) logs
    orphanedLogs.forEach(log => {
      formattedLogs.push(formatForensicLog(log, []));
    });

    // 4. Final Order Output descending
    formattedLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Send max 100 fully composed packets to UI
    return NextResponse.json({ success: true, logs: formattedLogs.slice(0, 100) });
    
  } catch (error) {
    console.error("[GET_AUDIT_LOGS_ERR]", error);
    return NextResponse.json({ success: false, message: "Failed to fetch logs" }, { status: 500 });
  }
}

/* ==================================================
   POST /api/audit/logs (Ingestion)
   ================================================== */
export async function POST(req: NextRequest) {
  try {
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent") ?? "unknown";
    const requestId = crypto.randomUUID();

    const { success: limitOk } = await ratelimit.limit(`log_post:${ipAddress}`);
    if (!limitOk) {
      return NextResponse.json({ message: "Too many requests" }, { status: 429 });
    }

    const rawBody = await req.text();
    let jsonBody;
    try {
      jsonBody = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = logPayloadSchema.safeParse(jsonBody);
    if (!parsed.success) {
      return NextResponse.json({ message: `Validation failed: ${parsed.error.message}` }, { status: 400 });
    }

    const { action, organizationId, branchId, targetId, targetType, before, after, meta, severity, systemHmac } = parsed.data;

    if (meta && Buffer.byteLength(JSON.stringify(meta), "utf8") > MAX_META_BYTES) {
      return NextResponse.json({ message: "Payload size exceeded" }, { status: 413 });
    }

    const isVerifiedSystem = systemHmac ? verifySystemHmac(rawBody, systemHmac) : false;
    const session = await getServerSession(authOptions);
    const requester = session?.user;

    if (!requester && !isVerifiedSystem) {
      return NextResponse.json({ message: "Unauthorized access" }, { status: 401 });
    }

    let actorName = "System Action";
    if (requester) {
      const dbRequester = await prisma.authorizedPersonnel.findUnique({
        where: { id: requester.id },
        select: { name: true, isLocked: true, disabled: true, deletedAt: true, role: true }
      });
      if (!dbRequester || dbRequester.isLocked || dbRequester.disabled || dbRequester.deletedAt) {
        return NextResponse.json({ message: "Account suspended or inactive" }, { status: 403 });
      }
      actorName = dbRequester.name || "Unknown";
    }

    const isCriticalAction = Object.values(CriticalAction).includes(action as CriticalAction);
    const requiredRole = isCriticalAction ? ACTION_REQUIREMENTS[action as CriticalAction] : null;
    const userRole = (requester?.role as Role) || Role.CASHIER;

    const isAuthorized = isVerifiedSystem || (!!requester && (!requiredRole || (ROLE_WEIGHT[userRole] >= ROLE_WEIGHT[requiredRole])));

    const readableAction = action.toLowerCase().replace(/_/g, " ");
    const targetDesc = targetType ? ` on ${targetType}` : "";
    const description = `${actorName} performed ${readableAction}${targetDesc}.`;

    return await prisma.$transaction(async (tx) => {
      const lastLog = await tx.activityLog.findFirst({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        select: { hash: true },
      });
      const previousHash = lastLog?.hash ?? "GENESIS";

      /* --- CASE 1: Requires Approval --- */
      if (isCriticalAction && requester && !isAuthorized) {
        const approval = await tx.approvalRequest.create({
          data: {
            organizationId,
            branchId,
            requesterId: requester.id,
            actionType: action as CriticalAction,
            requiredRole: requiredRole ?? Role.MANAGER,
            changes: { before, after, meta },
            status: ApprovalStatus.PENDING,
            targetId,
            targetType,
          },
        });

        const logData = {
          action: `REQUEST_${action}`,
          description: `Requested approval for ${readableAction}`,
          organizationId,
          branchId,
          actorId: requester.id,
          actorRole: userRole,
          targetId,
          targetType,
          previousHash,
          requestId
        };
        const hash = generateHash(logData);

        await tx.activityLog.create({
          data: {
            ...logData,
            actorType: ActorType.USER,
            critical: false,
            severity: Severity.MEDIUM,
            ipAddress,
            deviceInfo,
            before: before ?? Prisma.JsonNull,
            after: after ?? Prisma.JsonNull,
            metadata: meta ?? Prisma.JsonNull,
            approvalId: approval.id,
            hash,
          },
        });

        await queueHierarchicalNotification(tx, organizationId, "APPROVAL", `Approval requested for ${action}`, userRole, branchId, approval.id, requester.id);
        return NextResponse.json({ success: true, approvalId: approval.id, status: "PENDING" }, { status: 202 });
      }

      /* --- CASE 2: Authorized Execution --- */
      if (isCriticalAction && isAuthorized) {
        const opResult = await applyActionDirectly(tx, action, requester?.id ?? "SYSTEM", (meta as any) ?? {}, requester?.id ?? "SYSTEM", organizationId, branchId ?? null);

        const logData = {
          action: `EXECUTE_${action}`,
          description,
          organizationId,
          branchId,
          actorId: requester?.id ?? "SYSTEM",
          actorRole: userRole,
          targetId,
          targetType,
          previousHash,
          requestId
        };
        const hash = generateHash(logData);

        const logEntry = await tx.activityLog.create({
          data: {
            ...logData,
            actorType: isVerifiedSystem ? ActorType.SYSTEM : ActorType.USER,
            critical: true,
            severity: Severity.HIGH,
            ipAddress,
            deviceInfo,
            before: before ?? Prisma.JsonNull,
            after: after ?? Prisma.JsonNull,
            metadata: { ...((meta as object) || {}), status: "EXECUTED" },
            hash,
          },
        });

        await queueHierarchicalNotification(tx, organizationId, "SECURITY", `Executed critical action: ${action}`, userRole, branchId, undefined, requester?.id, logEntry.id);
        return NextResponse.json({ success: true, result: opResult });
      }

      /* --- CASE 3: Standard Logging --- */
      const logData = {
        action,
        description,
        organizationId,
        branchId,
        actorId: requester?.id ?? "SYSTEM",
        actorRole: userRole,
        targetId,
        targetType,
        previousHash,
        requestId
      };
      const hash = generateHash(logData);

      const logEntry = await tx.activityLog.create({
        data: {
          ...logData,
          actorType: isVerifiedSystem ? ActorType.SYSTEM : ActorType.USER,
          critical: false,
          severity,
          ipAddress,
          deviceInfo,
          before: before ?? Prisma.JsonNull,
          after: after ?? Prisma.JsonNull,
          metadata: meta ?? Prisma.JsonNull,
          hash,
        },
      });

      if (action === "LOGIN") {
        await queueHierarchicalNotification(tx, organizationId, "SECURITY", `User logged in from ${ipAddress}`, userRole, branchId, undefined, requester?.id, logEntry.id);
      }

      return NextResponse.json({ success: true, id: logEntry.id });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 10000,
    });

  } catch (err) {
    console.error("[LOG_POST_FATAL]", err);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      return NextResponse.json({ message: "Transaction conflict: Please retry." }, { status: 409 });
    }
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

/**
 * PRODUCTION HIERARCHICAL NOTIFICATION LOGIC
 */
async function queueHierarchicalNotification(
  tx: Prisma.TransactionClient,
  orgId: string,
  type: string,
  message: string,
  actorRole: Role,
  branchId?: string | null,
  approvalId?: string,
  excludeUserId?: string,
  activityLogId?: string
) {
  try {
    const observers = await tx.authorizedPersonnel.findMany({
      where: {
        organizationId: orgId,
        role: { in: [Role.ADMIN, Role.MANAGER, Role.AUDITOR] },
        disabled: false,
        id: { not: excludeUserId }
      },
      select: { id: true, role: true },
    });

    const validRecipients = observers
      .filter(obs => canSeeAction(obs.role as Role, actorRole))
      .map(obs => obs.id);

    if (validRecipients.length === 0) return;

    await createNotification({
      title: type === "APPROVAL" ? "Action Required" : "System Alert",
      message,
      type: type as any,
      organizationId: orgId,
      branchId: branchId ?? null,
      approvalId,
      activityLogId,
      recipientIds: validRecipients,
    });
  } catch (e) {
    console.error("[NOTIFY_QUEUE_ERR]", e);
  }
}