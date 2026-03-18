import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import crypto from "crypto";
import { z } from "zod";
import { Prisma, Role } from "@prisma/client";

import {
  ROLE_WEIGHT,
  ACTION_REQUIREMENTS,
} from "@/lib/security";

import { applyActionDirectly } from "@/lib/actions";
import { createNotification } from "@/lib/notifications";

/* -------------------------------------------------- */
/* CONFIG & TYPES */
/* -------------------------------------------------- */

const MAX_META_BYTES = 32 * 1024;
const MAX_ACTION_LENGTH = 200;
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 30;
const SYSTEM_HMAC_SECRET = process.env.LOG_SYSTEM_HMAC_SECRET || "";

/**
 * Validates that the metadata is a serializable JSON object
 */
const JsonSchema = z.record(z.unknown());

const postBodySchema = z.object({
  action: z.string().min(1).max(MAX_ACTION_LENGTH),
  organizationId: z.string().optional(),
  branchId: z.string().optional(),
  personnelId: z.string().optional(),
  approvalId: z.string().optional(),
  meta: JsonSchema.optional(),
  systemHmac: z.string().optional(),
});

type PostBody = z.infer<typeof postBodySchema>;

/* -------------------------------------------------- */
/* RATE LIMITER (In-Memory) */
/* -------------------------------------------------- */

const rateMap = new Map<string, number[]>();

/**
 * Basic in-memory rate limiting. 
 * For multi-instance production, consider Redis/Upstash.
 */
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

/**
 * Fetches relevant admins/managers to notify within an organization
 */
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
    POST /api/log
================================================== */

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const device = req.headers.get("user-agent") ?? "unknown";

    if (!checkRateLimit(`log_post:${ip}`)) {
      return jsonError("Too many requests", 429);
    }

    const raw = await req.text();
    let jsonBody: unknown;

    try {
      jsonBody = JSON.parse(raw);
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

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

    /* ---------------- Validation ---------------- */

    if (meta) {
      const metaStr = JSON.stringify(meta);
      if (Buffer.byteLength(metaStr, "utf8") > MAX_META_BYTES) {
        return jsonError("Meta payload too large", 413);
      }
    }

    if (systemHmac && !verifySystemHmac(raw, systemHmac)) {
      return jsonError("Invalid system HMAC", 401);
    }

    const session = await getServerSession(authOptions);
    const requester = session?.user;

    /* ---------------- Role Authorization ---------------- */

    const requiredRole = ACTION_REQUIREMENTS[action as keyof typeof ACTION_REQUIREMENTS];
    const userRole = requester?.role as Role | undefined;

    const requesterMeetsRequirement =
      !!requester &&
      (!requiredRole || (userRole && ROLE_WEIGHT[userRole] >= ROLE_WEIGHT[requiredRole]));

    const targetOrgId = organizationId ?? requester?.organizationId;

    if (!targetOrgId) {
      return jsonError("Organization Context Missing", 400);
    }

    /* ---------------- CASE 1: Requires Approval ---------------- */

    if (requester && !requesterMeetsRequirement) {
      const approvalResult = await prisma.$transaction(async (tx) => {
        const approval = await tx.approvalRequest.create({
          data: {
            organizationId: targetOrgId,
            branchId: branchId ?? null,
            requesterId: requester.id,
            actionType: action,
            changes: (meta as Prisma.InputJsonValue) ?? {},
            status: "PENDING",
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

      // Background notification
      getNotificationRecipients(targetOrgId).then((recipientIds) => {
        if (recipientIds.length) {
          createNotification({
            title: "Approval Required",
            message: `${requester.name} requested permission for: ${action}`,
            type: "APPROVAL_REQUIRED",
            organizationId: targetOrgId,
            branchId: branchId ?? null,
            approvalId: approvalResult.id,
            recipientIds,
          });
        }
      }).catch(err => console.error("[NOTIFY_APPROVAL_ERR]", err));

      return NextResponse.json(
        {
          success: true,
          approvalId: approvalResult.id,
          status: "PENDING",
        },
        { status: 202 }
      );
    }

    /* ---------------- CASE 2: Authorized Execution ---------------- */

    if (requester && requesterMeetsRequirement) {
      const executionResult = await prisma.$transaction(async (tx) => {
        const opResult = await applyActionDirectly(
          tx,
          action,
          personnelId ?? "",
          (meta as Record<string, unknown>) ?? {},
          requester.id,
          targetOrgId,
          branchId ?? null
        );

        await tx.activityLog.create({
          data: {
            organizationId: targetOrgId,
            branchId: branchId ?? null,
            personnelId: requester.id,
            action: `EXECUTE_${action}`,
            critical: true,
            ipAddress: ip,
            deviceInfo: device,
            metadata: { changes: meta ?? {} } as Prisma.InputJsonValue,
          },
        });

        return opResult;
      });

      // Background notification
      getNotificationRecipients(targetOrgId).then((recipientIds) => {
        if (recipientIds.length) {
          createNotification({
            title: "Action Executed",
            message: `${requester.name} performed: ${action}`,
            type: "SYSTEM",
            organizationId: targetOrgId,
            branchId: branchId ?? null,
            recipientIds,
          });
        }
      }).catch(err => console.error("[NOTIFY_EXEC_ERR]", err));

      return NextResponse.json({ success: true, result: executionResult });
    }

    /* ---------------- CASE 3: Standard Logging Fallback ---------------- */

    const logEntry = await prisma.activityLog.create({
      data: {
        action,
        organizationId: targetOrgId,
        branchId: branchId ?? null,
        personnelId: personnelId ?? null,
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
    return jsonError("Internal server error during log processing", 500);
  }
}