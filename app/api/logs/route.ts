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
/* CONFIG */
/* -------------------------------------------------- */

const MAX_META_BYTES = 32 * 1024;
const MAX_ACTION_LENGTH = 200;

const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 30;

const SYSTEM_HMAC_SECRET = process.env.LOG_SYSTEM_HMAC_SECRET || "";

/* -------------------------------------------------- */
/* RATE LIMITER */
/* -------------------------------------------------- */

const rateMap = new Map<string, number[]>();

function checkRateLimit(key: string) {
  const now = Date.now();
  const arr = rateMap.get(key) ?? [];

  const filtered = arr.filter((t) => now - t <= RATE_LIMIT_WINDOW_MS);

  if (filtered.length >= RATE_LIMIT_MAX) {
    rateMap.set(key, filtered);
    return false;
  }

  filtered.push(now);
  rateMap.set(key, filtered);

  return true;
}

/* -------------------------------------------------- */
/* VALIDATION */
/* -------------------------------------------------- */

const postBodySchema = z.object({
  action: z.string().min(1).max(MAX_ACTION_LENGTH),

  organizationId: z.string().optional(),
  branchId: z.string().optional(),

  personnelId: z.string().optional(),
  approvalId: z.string().optional(),

  meta: z.any().optional(),

  systemHmac: z.string().optional(),
});

/* -------------------------------------------------- */
/* HELPERS */
/* -------------------------------------------------- */

function jsonError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

function verifySystemHmac(payload: string, hmac: string) {
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

/* ==================================================
   POST /api/log
================================================== */

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const device = req.headers.get("user-agent") ?? "unknown";

    if (!checkRateLimit(`log_post:${ip}`)) {
      return jsonError("Too many requests", 429);
    }

    const raw = await req.text();

    let parsedBody: unknown;

    try {
      parsedBody = JSON.parse(raw);
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    const parsed = postBodySchema.safeParse(parsedBody);

    if (!parsed.success) {
      return jsonError("Invalid payload", 400);
    }

    const {
      action,
      organizationId,
      branchId,
      personnelId,
      approvalId,
      meta,
      systemHmac,
    } = parsed.data;

    /* ---------------- Meta Size Validation ---------------- */

    if (meta !== undefined) {
      const metaStr = JSON.stringify(meta);

      if (Buffer.byteLength(metaStr, "utf8") > MAX_META_BYTES) {
        return jsonError("Meta payload too large", 413);
      }
    }

    /* ---------------- System Event Verification ---------------- */

    const isSystemEvent = Boolean(systemHmac);

    if (isSystemEvent && !verifySystemHmac(raw, systemHmac!)) {
      return jsonError("Invalid system HMAC", 401);
    }

    /* ---------------- Get Requester ---------------- */

    const session = await getServerSession(authOptions);

    const requester = session?.user ?? null;

    /* --------------------------------------------------
       Determine required role
    -------------------------------------------------- */

    const requiredRole = ACTION_REQUIREMENTS[action];

    const requesterMeetsRequirement =
      requester &&
      (!requiredRole ||
        ROLE_WEIGHT[requester.role as Role] >= ROLE_WEIGHT[requiredRole]);

    /* --------------------------------------------------
       If requester lacks permission → create approval
    -------------------------------------------------- */

    if (!requesterMeetsRequirement && requester) {
      const approval = await prisma.approvalRequest.create({
        data: {
          organizationId: organizationId ?? requester.organizationId,
          branchId: branchId ?? null,

          requesterId: requester.id,

          actionType: action as any,

          changes: meta ?? {},

          status: "PENDING",
        },
      });

      await prisma.activityLog.create({
        data: {
          organizationId: approval.organizationId,
          branchId: approval.branchId,

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

      /* ---------------- Notifications ---------------- */

      try {
        const approvers = await prisma.authorizedPersonnel.findMany({
          where: {
            organizationId: approval.organizationId,
            OR: [{ role: "ADMIN" }, { role: "MANAGER" }],
          },
          select: { id: true },
        });

        const recipientIds = approvers.map((a) => a.id);

        if (recipientIds.length) {
          await createNotification({
            title: `Approval required`,
            message: `${requester.name} requested ${action}`,
            type: "APPROVAL_REQUIRED",
            organizationId: approval.organizationId,
            branchId: approval.branchId,
            approvalId: approval.id,
            recipientIds,
          });
        }
      } catch (err) {
        console.error("[APPROVAL_NOTIFICATION]", err);
      }

      return NextResponse.json(
        {
          success: true,
          approvalId: approval.id,
          status: "PENDING",
        },
        { status: 202 }
      );
    }

    /* --------------------------------------------------
       Direct execution for authorized requester
    -------------------------------------------------- */

    if (requester && requesterMeetsRequirement) {
      const result = await prisma.$transaction(async (tx) => {
        const operation = await applyActionDirectly(
          tx,
          action as any,
          personnelId ?? "",
          meta ?? {},
          requester.id,
          organizationId ?? requester.organizationId,
          branchId ?? null
        );

        await tx.activityLog.create({
          data: {
            organizationId: organizationId ?? requester.organizationId,
            branchId: branchId ?? null,

            personnelId: requester.id,

            action: `EXECUTE_${action}`,

            critical: true,

            ipAddress: ip,
            deviceInfo: device,

            metadata: {
              changes: meta ?? {},
            } as Prisma.InputJsonValue,
          },
        });

        return operation;
      });

      /* ---------------- Execution Notifications ---------------- */

      try {
        const orgId = organizationId ?? requester.organizationId;

        const admins = await prisma.authorizedPersonnel.findMany({
          where: {
            organizationId: orgId,
            OR: [{ role: "ADMIN" }, { role: "MANAGER" }],
          },
          select: { id: true },
        });

        const recipientIds = admins.map((a) => a.id);

        if (recipientIds.length) {
          await createNotification({
            title: `Action executed`,
            message: `${requester.name} executed ${action}`,
            type: "SYSTEM",
            organizationId: orgId,
            branchId,
            recipientIds,
          });
        }
      } catch (err) {
        console.error("[EXEC_NOTIFICATION]", err);
      }

      return NextResponse.json({ success: true, result });
    }

    /* --------------------------------------------------
       Fallback simple log
    -------------------------------------------------- */

    const created = await prisma.activityLog.create({
      data: {
        action,
        organizationId: organizationId ?? "",
        branchId: branchId ?? null,

        personnelId: personnelId ?? null,

        approvalId: approvalId ?? null,

        critical: false,

        ipAddress: ip,
        deviceInfo: device,

        metadata: meta ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      id: created.id,
    });
  } catch (err) {
    console.error("[LOG_POST]", err);

    return jsonError("Failed to create log entry", 500);
  }
}