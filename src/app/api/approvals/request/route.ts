import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/src/core/lib/auth";
import prisma from "@/src/core/lib/prisma";

import {
  Role,
  ApprovalStatus,
  CriticalAction,
  Prisma,
  AuthorizedPersonnel,
} from "@prisma/client";

import {
  ACTION_REQUIREMENTS,
  ROLE_WEIGHT,
  validateManagementRights,
} from "@/src/core/lib/security";

import { applyActionDirectly, ActionPayload } from "@/lib/actions";

import { createNotification } from "@/src/core/lib/notifications";

import { eventBus } from "@/lib/events/eventBus";
import { EVENTS } from "@/lib/events/events";

/* -------------------------------------------------- */
/* TYPES */
/* -------------------------------------------------- */

interface PostApprovalBody {
  actionType: CriticalAction;
  targetId: string;
  changes: ActionPayload;

  organizationId: string;
  branchId?: string | null;
}

/* -------------------------------------------------- */
/* POST: REQUEST APPROVAL */
/* -------------------------------------------------- */

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const user = session.user;

  try {
    const body = (await req.json()) as PostApprovalBody;

    const {
      actionType,
      targetId,
      changes,
      organizationId,
      branchId,
    } = body;

    if (!actionType || !targetId || !organizationId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const ip =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const device =
      req.headers.get("user-agent") || "unknown";

    /* -------------------------------------------------- */
    /* TRANSACTION */
    /* -------------------------------------------------- */

    return await prisma.$transaction(async (tx) => {
      /* ----------------------------------------------- */
      /* VERIFY ORGANIZATION */
      /* ----------------------------------------------- */

      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });

      if (!org) {
        throw new Error("Organization not found");
      }

      /* ----------------------------------------------- */
      /* VERIFY BRANCH */
      /* ----------------------------------------------- */

      if (branchId) {
        const branch = await tx.branch.findUnique({
          where: { id: branchId },
          select: { id: true, organizationId: true },
        });

        if (!branch) {
          throw new Error("Branch not found");
        }

        if (branch.organizationId !== organizationId) {
          throw new Error(
            "Branch does not belong to organization"
          );
        }
      }

      /* ----------------------------------------------- */
      /* VALIDATE PERSONNEL MODIFICATION */
      /* ----------------------------------------------- */

      if (
        actionType === "USER_LOCK_UNLOCK" ||
        actionType === "EMAIL_CHANGE" ||
        actionType === "PASSWORD_CHANGE"
      ) {
        const targetPersonnel =
          await tx.authorizedPersonnel.findUnique({
            where: { id: targetId },
          });

        if (!targetPersonnel) {
          throw new Error("Target personnel not found");
        }

        const check = validateManagementRights(
          user as unknown as AuthorizedPersonnel,
          targetPersonnel
        );

        if (!check.authorized) {
          throw new Error(check.reason);
        }
      }

      /* ----------------------------------------------- */
      /* ROLE AUTHORITY CHECK */
      /* ----------------------------------------------- */

      const requiredRole =
        ACTION_REQUIREMENTS[actionType] || Role.ADMIN;

      const userWeight =
        ROLE_WEIGHT[user.role as Role] ?? 0;

      const requiredWeight =
        ROLE_WEIGHT[requiredRole] ?? 0;

      const hasDirectAuthority =
        userWeight >= requiredWeight || user.isOrgOwner;

      /* ----------------------------------------------- */
      /* DIRECT EXECUTION */
      /* ----------------------------------------------- */

      if (hasDirectAuthority) {
        const result = await applyActionDirectly(
          tx,
          actionType,
          targetId,
          changes,
          user.id,
          organizationId,
          branchId ?? null
        );

        /* ---------- Activity Log ---------- */

        await tx.activityLog.create({
          data: {
            organizationId,
            branchId: branchId ?? null,
            personnelId: user.id,
            action: `EXECUTE_${actionType}`,
            critical: true,
            ipAddress: ip,
            deviceInfo: device,

            metadata: {
              targetId,
              changes,
              executedBy: user.id,
              timestamp: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });

        return NextResponse.json({
          status: "COMPLETED",
          result,
        });
      }

      /* ----------------------------------------------- */
      /* CREATE APPROVAL REQUEST */
      /* ----------------------------------------------- */

      const request = await tx.approvalRequest.create({
        data: {
          organizationId,
          branchId: branchId ?? null,
          requesterId: user.id,

          actionType,

          targetId,
          targetType: actionType,

          changes: changes as Prisma.InputJsonValue,

          requiredRole,
          status: ApprovalStatus.PENDING,
        },
      });

      /* ---------- Activity Log ---------- */

      await tx.activityLog.create({
        data: {
          organizationId,
          branchId: branchId ?? null,
          personnelId: user.id,
          action: `REQUEST_APPROVAL_${actionType}`,
          critical: false,
          approvalId: request.id,
          ipAddress: ip,
          deviceInfo: device,

          metadata: {
            targetId,
            changes,
            approvalId: request.id,
            timestamp: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      /* ----------------------------------------------- */
      /* EVENT BUS (Preferred Notification System) */
      /* ----------------------------------------------- */

      await eventBus.emit(EVENTS.APPROVAL_REQUESTED, {
        approvalId: request.id,
        organizationId,
        branchId,
        actionType,
        requesterId: user.id,
      });

      /* ----------------------------------------------- */
      /* FALLBACK DIRECT NOTIFICATION */
      /* ----------------------------------------------- */

      try {
        const eligiblePersonnel =
          await tx.authorizedPersonnel.findMany({
            where: {
              organizationId,
              isLocked: false,
              role: {
                in: Object.keys(ROLE_WEIGHT).filter(
                  (r) =>
                    ROLE_WEIGHT[r as Role] >= requiredWeight
                ) as Role[],
              },
            },
            select: { id: true },
          });

        const recipientIds =
          eligiblePersonnel.map((p) => p.id);

        if (recipientIds.length) {
          await createNotification({
            organizationId,
            branchId,
            recipientIds,
            type: "APPROVAL_REQUIRED",
            title: "Approval Needed",
            message: `${user.name} requested ${actionType.replace(
              /_/g,
              " "
            )}`,
            approvalId: request.id,
          });
        }
      } catch (notifyErr) {
        console.error(
          "[APPROVAL_REQUEST_NOTIFICATION]",
          notifyErr
        );
      }

      return NextResponse.json({
        status: "PENDING",
        approvalId: request.id,
      });
    });
  } catch (error: unknown) {
    console.error("[APPROVAL_REQUEST_ERROR]", error);

    const msg =
      error instanceof Error
        ? error.message
        : "Internal Server Error";

    return NextResponse.json(
      { error: msg },
      { status: 400 }
    );
  }
}