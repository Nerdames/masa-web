import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { Role, ApprovalStatus, Prisma, NotificationType, PermissionAction } from "@prisma/client";
import { applyActionDirectly } from "@/core/lib/actions";
import { ROLE_WEIGHT } from "@/core/lib/permission";
import { eventBus } from "@/core/events";

interface Body {
  decision: "APPROVED" | "REJECTED";
  rejectionNote?: string;
  expectedVersion?: number;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = session.user;
    const { decision, rejectionNote, expectedVersion } = (await req.json()) as Body;

    if (!["APPROVED", "REJECTED"].includes(decision)) {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const device = req.headers.get("user-agent") || "unknown";

    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.findUnique({ where: { id: params.id } });

      if (!request || request.organizationId !== user.organizationId) {
        throw new Error("Approval request not found");
      }

      // 1. Idempotency & Expiration
      if (request.status !== ApprovalStatus.PENDING || request.appliedAt) {
        throw new Error("This request has already been processed");
      }

      if (request.expiresAt && new Date() > request.expiresAt) {
        await tx.approvalRequest.update({
          where: { id: request.id },
          data: { status: ApprovalStatus.EXPIRED },
        });
        throw new Error("This approval request has expired");
      }

      // 2. Self-Approval Check
      if (request.requesterId === user.id && !user.isOrgOwner) {
        throw new Error("Security Policy: Self-approval of critical actions is forbidden");
      }

      // 3. Permission & Role Weight Check (ABAC)
      let isAuthorized = user.isOrgOwner;
      if (!isAuthorized) {
        const permission = await tx.permission.findUnique({
          where: {
            organizationId_role_action_resource: {
              organizationId: request.organizationId,
              role: user.role as Role,
              action: PermissionAction.APPROVE,
              resource: request.targetType || "GENERAL", // Validated against table/resource map
            },
          },
        });
        
        const hasWeight = ROLE_WEIGHT[user.role as Role] >= ROLE_WEIGHT[request.requiredRole as Role];
        isAuthorized = !!permission || hasWeight;
      }

      if (!isAuthorized) throw new Error("Insufficient authority to resolve this request");

      // 4. Point-in-time Target Fetch for Audit & Versioning
      // We use the tableName stored in targetType to fetch current state
      const targetData = request.targetId && request.targetType
        ? await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "${request.targetType}" WHERE id = $1`, request.targetId)
        : [];
      
      const currentTarget = targetData[0] || null;

      // 5. Optimistic Lock Validation (Only on Approval)
      if (decision === "APPROVED" && expectedVersion !== undefined) {
        if (currentTarget?.version !== undefined && currentTarget.version !== expectedVersion) {
          throw new Error("The underlying resource was modified after this request was made. Approval denied.");
        }
      }

      // 6. Finalize Status
      const updatedRequest = await tx.approvalRequest.update({
        where: { id: request.id },
        data: {
          status: decision as ApprovalStatus,
          approverId: user.id,
          rejectionNote: decision === "REJECTED" ? rejectionNote : null,
          appliedAt: decision === "APPROVED" ? new Date() : null,
        },
      });

      // 7. Execution
      if (decision === "APPROVED") {
        await applyActionDirectly(
          tx, request.actionType, request.targetId!, request.changes as any,
          user.id, request.organizationId, request.branchId
        );

        await tx.activityLog.create({
          data: {
            organizationId: request.organizationId, branchId: request.branchId, personnelId: user.id,
            action: `APPROVED_${request.actionType}`, critical: true,
            ipAddress: ip, deviceInfo: device,
            metadata: { approvalId: request.id, previousState: currentTarget, revertable: true } as Prisma.InputJsonValue,
          },
        });
      } else {
        await tx.activityLog.create({
          data: {
            organizationId: request.organizationId, branchId: request.branchId, personnelId: user.id,
            action: `REJECTED_${request.actionType}`, critical: false,
            ipAddress: ip, deviceInfo: device,
            metadata: { approvalId: request.id, rejectionNote } as Prisma.InputJsonValue,
          },
        });
      }

      return updatedRequest;
    });

    // 8. Async Notification
    eventBus.emitEvent("approval.resolved", {
      organizationId: result.organizationId,
      branchId: result.branchId,
      approvalId: result.id,
      requesterId: result.requesterId,
      status: decision,
      actionType: result.actionType,
      notificationType: NotificationType.APPROVAL,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[APPROVAL_PATCH_ERROR]:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 400 });
  }
}