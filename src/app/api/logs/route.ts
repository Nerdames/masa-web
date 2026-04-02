import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import crypto from "crypto";
import { z } from "zod";
import { Prisma, Role, CriticalAction, ApprovalStatus, ActorType } from "@prisma/client";

import { ROLE_WEIGHT, ACTION_REQUIREMENTS } from "@/core/lib/permission";
import { applyActionDirectly } from "@/core/lib/actions";
import { createNotification } from "@/core/lib/notifications";

/* -------------------------------------------------- */
/* CONFIG & TYPES */
/* -------------------------------------------------- */
const MAX_META_BYTES = 32 * 1024; // 32KB Limit
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 30;
const SYSTEM_HMAC_SECRET = process.env.LOG_SYSTEM_HMAC_SECRET || "";

// Strict Schema Alignment based on Updated MASA Schema
const logPayloadSchema = z.object({
  action: z.string().min(1).max(200),
  organizationId: z.string().cuid(),
  branchId: z.string().cuid().optional().nullable(),
  targetId: z.string().optional().nullable(),
  targetType: z.string().optional().nullable(),
  before: z.record(z.unknown()).optional().nullable(),
  after: z.record(z.unknown()).optional().nullable(),
  meta: z.record(z.unknown()).optional().nullable(),
  systemHmac: z.string().optional(),
});

/* -------------------------------------------------- */
/* IN-MEMORY RATE LIMITER (Use Redis for distributed) */
/* -------------------------------------------------- */
const rateMap = new Map<string, number[]>();
function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const timestamps = rateMap.get(key) ?? [];
  const filtered = timestamps.filter((t) => now - t <= RATE_LIMIT_WINDOW_MS);
  if (filtered.length >= RATE_LIMIT_MAX) {
    rateMap.set(key, filtered);
    return false;
  }
  filtered.push(now);
  rateMap.set(key, filtered);
  return true;
}

/* -------------------------------------------------- */
/* SECURITY UTILS */
/* -------------------------------------------------- */
function jsonError(message: string, status = 400) {
  return NextResponse.json({ message, success: false }, { status });
}

function verifySystemHmac(payload: string, hmac: string): boolean {
  if (!SYSTEM_HMAC_SECRET) return false;
  const mac = crypto.createHmac("sha256", SYSTEM_HMAC_SECRET).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(hmac));
  } catch {
    return false;
  }
}

// Cryptographic hash for audit chain integrity
function generateHash(data: any): string {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

/* ==================================================
    POST /api/logs
================================================== */
export async function POST(req: NextRequest) {
  try {
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const deviceInfo = req.headers.get("user-agent") ?? "unknown";
    const requestId = crypto.randomUUID(); // Correlation ID

    if (!checkRateLimit(`log_post:${ipAddress}`)) return jsonError("Too many requests", 429);

    const rawBody = await req.text();
    let jsonBody;
    try {
      jsonBody = JSON.parse(rawBody);
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    const parsed = logPayloadSchema.safeParse(jsonBody);
    if (!parsed.success) return jsonError(`Validation failed: ${parsed.error.message}`, 400);

    const { action, organizationId, branchId, targetId, targetType, before, after, meta, systemHmac } = parsed.data;

    if (meta && Buffer.byteLength(JSON.stringify(meta), "utf8") > MAX_META_BYTES) {
      return jsonError("Payload size exceeded", 413);
    }

    const isVerifiedSystem = systemHmac ? verifySystemHmac(rawBody, systemHmac) : false;
    const session = await getServerSession(authOptions);
    const requester = session?.user;

    if (!requester && !isVerifiedSystem) return jsonError("Unauthorized access", 401);

    // Strict Account Verification
    if (requester) {
      const dbRequester = await prisma.authorizedPersonnel.findUnique({
        where: { id: requester.id },
        select: { isLocked: true, disabled: true, deletedAt: true }
      });
      if (!dbRequester || dbRequester.isLocked || dbRequester.disabled || dbRequester.deletedAt) {
        return jsonError("Account suspended or inactive", 403);
      }
    }

    const isCriticalAction = Object.values(CriticalAction).includes(action as CriticalAction);
    const requiredRole = isCriticalAction ? ACTION_REQUIREMENTS[action as CriticalAction] : null;
    const userRole = requester?.role as Role | undefined;

    const isAuthorized = isVerifiedSystem || (!!requester && (!requiredRole || (userRole && ROLE_WEIGHT[userRole] >= ROLE_WEIGHT[requiredRole])));

    return await prisma.$transaction(async (tx) => {
      // 1. Fetch Previous Hash for Chain Integrity (Locking row if possible via raw SQL in production, relying on transaction isolation here)
      const lastLog = await tx.activityLog.findFirst({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        select: { hash: true },
      });
      const previousHash = lastLog?.hash ?? null;

      /* ---------------- CASE 1: Requires Approval ---------------- */
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

        const logData = { action: `REQUEST_${action}`, organizationId, branchId, actorId: requester.id, actorRole: userRole, targetId, targetType, approvalId: approval.id, previousHash, requestId };
        const hash = generateHash(logData);

        await tx.activityLog.create({
          data: {
            ...logData,
            actorType: ActorType.USER,
            critical: false,
            ipAddress,
            deviceInfo,
            before: before ?? Prisma.JsonNull,
            after: after ?? Prisma.JsonNull,
            metadata: meta ?? Prisma.JsonNull,
            hash,
          },
        });

        // Async Notification Dispatch
        queueNotification(organizationId, "APPROVAL_REQUIRED", `Approval requested for ${action}`, branchId, approval.id, requester.id);
        
        return NextResponse.json({ success: true, approvalId: approval.id, status: "PENDING" }, { status: 202 });
      }

      /* ---------------- CASE 2: Authorized Execution ---------------- */
      if (isCriticalAction && isAuthorized) {
        const opResult = await applyActionDirectly(tx, action, requester?.id ?? "SYSTEM", (meta as any) ?? {}, requester?.id ?? "SYSTEM", organizationId, branchId ?? null);

        const logData = { action: `EXECUTE_${action}`, organizationId, branchId, actorId: requester?.id ?? "SYSTEM", actorRole: userRole, targetId, targetType, previousHash, requestId };
        const hash = generateHash(logData);

        await tx.activityLog.create({
          data: {
            ...logData,
            actorType: isVerifiedSystem ? ActorType.SYSTEM : ActorType.USER,
            critical: true,
            ipAddress,
            deviceInfo,
            before: before ?? Prisma.JsonNull,
            after: after ?? Prisma.JsonNull,
            metadata: { ...meta, status: "EXECUTED" } ?? Prisma.JsonNull,
            hash,
          },
        });

        queueNotification(organizationId, "SYSTEM", `Executed critical action: ${action}`, branchId, undefined, requester?.id);

        return NextResponse.json({ success: true, result: opResult });
      }

      /* ---------------- CASE 3: Standard Logging ---------------- */
      const logData = { action, organizationId, branchId, actorId: requester?.id ?? "SYSTEM", actorRole: userRole, targetId, targetType, previousHash, requestId };
      const hash = generateHash(logData);

      const logEntry = await tx.activityLog.create({
        data: {
          ...logData,
          actorType: isVerifiedSystem ? ActorType.SYSTEM : ActorType.USER,
          critical: false,
          ipAddress,
          deviceInfo,
          before: before ?? Prisma.JsonNull,
          after: after ?? Prisma.JsonNull,
          metadata: meta ?? Prisma.JsonNull,
          hash,
        },
      });

      return NextResponse.json({ success: true, id: logEntry.id });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable, // Prevents race conditions on previousHash
      maxWait: 5000,
      timeout: 10000,
    });

  } catch (err) {
    console.error("[LOG_POST_FATAL]", err);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      return jsonError("Transaction conflict: Please retry.", 409);
    }
    return jsonError("Internal server error during audit logging", 500);
  }
}

// Fire-and-forget helper to decouple slow notification logic from fast API response
async function queueNotification(orgId: string, type: string, message: string, branchId?: string | null, approvalId?: string, excludeUserId?: string) {
  try {
    const staff = await prisma.authorizedPersonnel.findMany({
      where: { organizationId: orgId, role: { in: [Role.ADMIN, Role.MANAGER, Role.AUDITOR] }, disabled: false, id: { not: excludeUserId } },
      select: { id: true },
    });
    if (!staff.length) return;
    
    await createNotification({
      title: type === "APPROVAL_REQUIRED" ? "Action Required" : "System Alert",
      message,
      type,
      organizationId: orgId,
      branchId: branchId ?? null,
      approvalId,
      recipientIds: staff.map((s) => s.id),
    });
  } catch (e) {
    console.error("[NOTIFY_QUEUE_ERR]", e);
  }
}