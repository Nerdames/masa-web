import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import crypto from "crypto";
import { z } from "zod";
import { Prisma, Role, CriticalAction, ApprovalStatus } from "@prisma/client";

import {
  ROLE_WEIGHT,
  ACTION_REQUIREMENTS,
} from "@/core/lib/permission";

import { applyActionDirectly } from "@/core/lib/actions";
import { createNotification } from "@/core/lib/notifications";

/* -------------------------------------------------- */
/* CONFIG & TYPES */
/* -------------------------------------------------- */

const MAX_META_BYTES = 32 * 1024; 
const MAX_ACTION_LENGTH = 200;
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 30;
const SYSTEM_HMAC_SECRET = process.env.LOG_SYSTEM_HMAC_SECRET || "";

const postBodySchema = z.object({
  action: z.string().min(1).max(MAX_ACTION_LENGTH),
  organizationId: z.string().optional(),
  branchId: z.string().optional(),
  personnelId: z.string().optional(),
  approvalId: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
  systemHmac: z.string().optional(),
});

/* -------------------------------------------------- */
/* RATE LIMITER */
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
/* HELPERS */
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

async function getNotificationRecipients(organizationId: string) {
  const staff = await prisma.authorizedPersonnel.findMany({
    where: {
      organizationId,
      role: { in: [Role.ADMIN, Role.MANAGER] },
      disabled: false,
      deletedAt: null,
    },
    select: { id: true },
  });
  return staff.map((s) => s.id);
}

/* ==================================================
    POST /api/logs
================================================== */

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const device = req.headers.get("user-agent") ?? "unknown";

    if (!checkRateLimit(`log_post:${ip}`)) return jsonError("Too many requests", 429);

    const rawBody = await req.text();
    let jsonBody: any;
    try {
      jsonBody = JSON.parse(rawBody);
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    const result = postBodySchema.safeParse(jsonBody);
    if (!result.success) return jsonError("Invalid payload schema", 400);

    const { action, organizationId, branchId, personnelId, approvalId, meta, systemHmac } = result.data;

    // 1. Metadata Validation
    if (meta) {
      const metaStr = JSON.stringify(meta);
      if (Buffer.byteLength(metaStr, "utf8") > MAX_META_BYTES) {
        return jsonError("Meta payload too large", 413);
      }
    }

    // 2. Authentication & Verification
    const isVerifiedSystem = systemHmac ? verifySystemHmac(rawBody, systemHmac) : false;
    const session = await getServerSession(authOptions);
    const requester = session?.user;

    if (!requester && !isVerifiedSystem) return jsonError("Unauthorized access", 401);

    // 3. Strict DB Check for Requester (Verify not locked/disabled)
    if (requester) {
      const dbRequester = await prisma.authorizedPersonnel.findUnique({
        where: { id: requester.id },
        select: { isLocked: true, disabled: true, deletedAt: true }
      });
      if (!dbRequester || dbRequester.isLocked || dbRequester.disabled || dbRequester.deletedAt) {
        return jsonError("Account suspended or inactive", 403);
      }
    }

    const targetOrgId = organizationId ?? requester?.organizationId;
    if (!targetOrgId) return jsonError("Organization Context Missing", 400);

    // 4. Authorization Logic
    const isCriticalAction = Object.values(CriticalAction).includes(action as CriticalAction);
    const requiredRole = isCriticalAction ? ACTION_REQUIREMENTS[action as CriticalAction] : null;
    const userRole = requester?.role as Role | undefined;

    const requesterMeetsRequirement =
      isVerifiedSystem || 
      (!!requester && (!requiredRole || (userRole && ROLE_WEIGHT[userRole] >= ROLE_WEIGHT[requiredRole])));

    // Extract target context for better auditing
    const targetId = (meta?.targetId || meta?.productId || meta?.userId) as string | undefined;
    const targetType = (meta?.targetType || action.split('_')[0]) as string | undefined;

    /* ---------------- CASE 1: Requires Approval ---------------- */

    if (isCriticalAction && requester && !requesterMeetsRequirement) {
      const approvalResult = await prisma.$transaction(async (tx) => {
        const approval = await tx.approvalRequest.create({
          data: {
            organizationId: targetOrgId,
            branchId: branchId ?? null,
            requesterId: requester.id,
            actionType: action as CriticalAction,
            requiredRole: requiredRole ?? Role.MANAGER, // Sync with config
            changes: (meta as Prisma.InputJsonValue) ?? {},
            status: ApprovalStatus.PENDING,
            targetId: targetId ?? null,
            targetType: targetType ?? null,
          },
        });

        await tx.activityLog.create({
          data: {
            organizationId: targetOrgId,
            branchId: branchId ?? null,
            personnelId: requester.id,
            action: `REQUEST_APPROVAL_${action}`,
            critical: false,
            ipAddress: ip,
            deviceInfo: device,
            metadata: { 
                approvalId: approval.id, 
                targetId, 
                targetType, 
                payload: meta ?? null 
            } as Prisma.InputJsonValue,
            approvalId: approval.id,
          },
        });
        return approval;
      });

      getNotificationRecipients(targetOrgId).then((recipientIds) => {
        if (recipientIds.length) {
          createNotification({
            title: "Approval Required",
            message: `${requester.name} requested: ${action}`,
            type: "APPROVAL_REQUIRED",
            organizationId: targetOrgId,
            branchId: branchId ?? null,
            approvalId: approvalResult.id,
            recipientIds,
          });
        }
      }).catch(err => console.error("[NOTIFY_ERR]", err));

      return NextResponse.json({ success: true, approvalId: approvalResult.id, status: "PENDING" }, { status: 202 });
    }

    /* ---------------- CASE 2: Authorized Execution ---------------- */

    if (isCriticalAction && requesterMeetsRequirement) {
      const executionResult = await prisma.$transaction(async (tx) => {
        const opResult = await applyActionDirectly(
          tx,
          action,
          personnelId ?? "",
          (meta as Record<string, unknown>) ?? {},
          requester?.id ?? "SYSTEM",
          targetOrgId,
          branchId ?? null
        );

        await tx.activityLog.create({
          data: {
            organizationId: targetOrgId,
            branchId: branchId ?? null,
            personnelId: requester?.id ?? null,
            action: isVerifiedSystem ? `SYSTEM_EXECUTE_${action}` : `EXECUTE_${action}`,
            critical: true,
            ipAddress: ip,
            deviceInfo: device,
            metadata: { 
                status: "EXECUTED", 
                targetId, 
                targetType, 
                changes: meta ?? {} 
            } as Prisma.InputJsonValue,
          },
        });
        return opResult;
      });

      getNotificationRecipients(targetOrgId).then((recipientIds) => {
        if (recipientIds.length) {
          createNotification({
            title: "Action Executed",
            message: `${requester?.name ?? 'System'} performed: ${action}`,
            type: "SYSTEM",
            organizationId: targetOrgId,
            branchId: branchId ?? null,
            recipientIds,
          });
        }
      }).catch(err => console.error("[NOTIFY_ERR]", err));

      return NextResponse.json({ success: true, result: executionResult });
    }

    /* ---------------- CASE 3: Standard Logging ---------------- */

    const logEntry = await prisma.activityLog.create({
      data: {
        action,
        organizationId: targetOrgId,
        branchId: branchId ?? null,
        personnelId: personnelId ?? requester?.id ?? null,
        approvalId: approvalId ?? null,
        critical: false,
        ipAddress: ip,
        deviceInfo: device,
        metadata: (meta as Prisma.InputJsonValue) ?? null,
      },
    });

    return NextResponse.json({ success: true, id: logEntry.id });

  } catch (err) {
    console.error("[LOG_POST_FATAL]", err);
    // Determine if it was a concurrency error
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        return jsonError("Conflict detected: please retry the action", 409);
    }
    return jsonError("Internal server error during processing", 500);
  }
}