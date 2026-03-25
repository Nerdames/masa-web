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

const MAX_META_BYTES = 32 * 1024; // 32KB safety limit for JSON metadata
const MAX_ACTION_LENGTH = 200;
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 30;
const SYSTEM_HMAC_SECRET = process.env.LOG_SYSTEM_HMAC_SECRET || "";

/**
 * Validates the incoming request body
 */
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
/* RATE LIMITER (In-Memory) */
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

  const mac = crypto
    .createHmac("sha256", SYSTEM_HMAC_SECRET)
    .update(payload)
    .digest("hex");

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
      status: "ACTIVE",
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

    // 1. Rate Limiting Check
    if (!checkRateLimit(`log_post:${ip}`)) {
      return jsonError("Too many requests", 429);
    }

    const rawBody = await req.text();
    let jsonBody: unknown;

    try {
      jsonBody = JSON.parse(rawBody);
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    // 2. Schema Validation
    const result = postBodySchema.safeParse(jsonBody);
    if (!result.success) {
      return jsonError("Invalid payload schema", 400);
    }

    const {
      action,
      organizationId,
      branchId,
      personnelId,
      approvalId,
      meta,
      systemHmac,
    } = result.data;

    // 3. Metadata Size Check
    if (meta) {
      const metaStr = JSON.stringify(meta);
      if (Buffer.byteLength(metaStr, "utf8") > MAX_META_BYTES) {
        return jsonError("Meta payload too large", 413);
      }
    }

    // 4. Verification & Authentication
    const isVerifiedSystem = systemHmac ? verifySystemHmac(rawBody, systemHmac) : false;
    const session = await getServerSession(authOptions);
    const requester = session?.user;

    if (!requester && !isVerifiedSystem) {
      return jsonError("Unauthorized access", 401);
    }

    const targetOrgId = organizationId ?? requester?.organizationId;
    if (!targetOrgId) {
      return jsonError("Organization Context Missing", 400);
    }

    // 5. Authorization Logic
    // Check if the action is defined as a CriticalAction in your schema
    const isCriticalAction = Object.values(CriticalAction).includes(action as CriticalAction);
    const requiredRole = isCriticalAction ? ACTION_REQUIREMENTS[action as CriticalAction] : null;
    const userRole = requester?.role as Role | undefined;

    const requesterMeetsRequirement =
      isVerifiedSystem || 
      (!!requester && (!requiredRole || (userRole && ROLE_WEIGHT[userRole] >= ROLE_WEIGHT[requiredRole])));

    /* ---------------- CASE 1: Requires Approval ---------------- */

    if (isCriticalAction && requester && !requesterMeetsRequirement) {
      const approvalResult = await prisma.$transaction(async (tx) => {
        const approval = await tx.approvalRequest.create({
          data: {
            organizationId: targetOrgId,
            branchId: branchId ?? null,
            requesterId: requester.id,
            actionType: action as CriticalAction,
            changes: (meta as Prisma.InputJsonValue) ?? {},
            status: ApprovalStatus.PENDING,
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
              payload: meta ?? null,
            } as Prisma.InputJsonValue,
            approvalId: approval.id,
          },
        });

        return approval;
      });

      // Async Notification (don't await to keep response fast)
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

      return NextResponse.json(
        { success: true, approvalId: approvalResult.id, status: "PENDING" },
        { status: 202 }
      );
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
            action: `EXECUTE_${action}`,
            critical: true,
            ipAddress: ip,
            deviceInfo: device,
            metadata: { status: "EXECUTED", changes: meta ?? {} } as Prisma.InputJsonValue,
          },
        });

        return opResult;
      });

      // Async Notification
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

    /* ---------------- CASE 3: Standard Logging Fallback ---------------- */

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

    return NextResponse.json({
      success: true,
      id: logEntry.id,
    });

  } catch (err) {
    console.error("[LOG_POST_FATAL]", err);
    return jsonError("Internal server error during processing", 500);
  }
}