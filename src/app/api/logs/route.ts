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
/* CONFIG & PRODUCTION RATE LIMITING */
/* -------------------------------------------------- */
const MAX_META_BYTES = 32 * 1024; 
const SYSTEM_HMAC_SECRET = process.env.LOG_SYSTEM_HMAC_SECRET || "";

// Production-ready stateless rate limiter (Upstash Redis)
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
/* HELPERS */
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

/* ==================================================
    POST /api/logs
================================================== */
export async function POST(req: NextRequest) {
  try {
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent") ?? "unknown";
    const requestId = crypto.randomUUID(); 

    // 1. Stateless Rate Limit Check
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

    // 2. Validate Requester State
    if (requester) {
      const dbRequester = await prisma.authorizedPersonnel.findUnique({
        where: { id: requester.id },
        select: { isLocked: true, disabled: true, deletedAt: true, role: true }
      });
      if (!dbRequester || dbRequester.isLocked || dbRequester.disabled || dbRequester.deletedAt) {
        return NextResponse.json({ message: "Account suspended or inactive" }, { status: 403 });
      }
    }

    const isCriticalAction = Object.values(CriticalAction).includes(action as CriticalAction);
    const requiredRole = isCriticalAction ? ACTION_REQUIREMENTS[action as CriticalAction] : null;
    const userRole = (requester?.role as Role) || Role.CASHIER; // Fallback to lowest role

    const isAuthorized = isVerifiedSystem || (!!requester && (!requiredRole || (ROLE_WEIGHT[userRole] >= ROLE_WEIGHT[requiredRole])));

    return await prisma.$transaction(async (tx) => {
      // 3. Fetch Chain Link with Serializable Lock
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

        // Hierarchical Notification
        await queueHierarchicalNotification(tx, organizationId, "APPROVAL", `Approval requested for ${action}`, userRole, branchId, approval.id, requester.id);
        
        return NextResponse.json({ success: true, approvalId: approval.id, status: "PENDING" }, { status: 202 });
      }

      /* --- CASE 2: Authorized Execution --- */
      if (isCriticalAction && isAuthorized) {
        const opResult = await applyActionDirectly(tx, action, requester?.id ?? "SYSTEM", (meta as any) ?? {}, requester?.id ?? "SYSTEM", organizationId, branchId ?? null);

        const logData = { 
            action: `EXECUTE_${action}`, 
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

      // Notify on Logins specifically
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
    // 1. Fetch potential observers
    const observers = await tx.authorizedPersonnel.findMany({
      where: { 
          organizationId: orgId, 
          role: { in: [Role.ADMIN, Role.MANAGER, Role.AUDITOR] }, 
          disabled: false, 
          id: { not: excludeUserId } 
      },
      select: { id: true, role: true },
    });

    // 2. Apply Visibility Logic: Who is allowed to see this specific actor?
    const validRecipients = observers
      .filter(obs => canSeeAction(obs.role as Role, actorRole))
      .map(obs => obs.id);

    if (validRecipients.length === 0) return;
    
    // 3. Dispatch to internal notification engine
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