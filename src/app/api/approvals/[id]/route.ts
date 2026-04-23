import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { z } from "zod";
import { 
  ApprovalStatus, 
  Severity, 
  Role, 
  PermissionAction, 
  NotificationType,
  Prisma 
} from "@prisma/client";
import { applyActionDirectly } from "@/core/lib/actions";
import { ROLE_WEIGHT } from "@/core/lib/permission";
import { eventBus } from "@/core/events";
import { createAuditLog } from "../route"; // Assuming forensic helper is in parent route
import crypto from "crypto";

/* -------------------------
  Validation Schema
------------------------- */
const UpdateApprovalSchema = z.object({
  status: z.enum([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED]),
  rejectionNote: z.string().max(1000).optional().nullable(),
  expectedVersion: z.number().int().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { status, rejectionNote, expectedVersion } = UpdateApprovalSchema.parse(body);

    const requestId = crypto.randomUUID();
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch Request & Context
      const request = await tx.approvalRequest.findUnique({
        where: { id: params.id },
      });

      if (!request || request.organizationId !== user.organizationId) {
        throw new Error("Authorization matrix not found.");
      }

      // 2. Idempotency & Expiration Checks
      if (request.status !== ApprovalStatus.PENDING || request.appliedAt) {
        throw new Error("This request has already been processed.");
      }

      if (request.expiresAt && request.expiresAt < new Date()) {
        await tx.approvalRequest.update({ 
          where: { id: request.id }, 
          data: { status: ApprovalStatus.EXPIRED } 
        });
        throw new Error("The authorization window for this request has expired.");
      }

      // 3. Security Guardrail: Self-Approval Prevention
      if (request.requesterId === user.id && !user.isOrgOwner) {
        throw new Error("Security Policy Violation: Users cannot approve their own critical requests.");
      }

      // 4. Authorization & Role Weight Check (ABAC)
      let isAuthorized = user.isOrgOwner;
      if (!isAuthorized) {
        const permission = await tx.permission.findUnique({
          where: {
            organizationId_role_action_resource: {
              organizationId: user.organizationId,
              role: user.role as Role,
              action: PermissionAction.APPROVE,
              resource: request.targetType || "GENERAL",
            },
          },
        });

        const hasWeight = ROLE_WEIGHT[user.role as Role] >= ROLE_WEIGHT[request.requiredRole as Role];
        isAuthorized = !!permission || hasWeight;
      }

      if (!isAuthorized) {
        throw new Error("Access Denied: Your role weight or permissions are insufficient for this resolution.");
      }

      // 5. Point-in-time Target Fetch for Audit & Versioning
      // We use raw SQL for dynamic table resolution based on stored targetType
      const targetData = request.targetId && request.targetType
        ? await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "${request.targetType}" WHERE id = $1`, request.targetId)
        : [];
      const currentTarget = targetData[0] || null;

      // 6. Optimistic Lock Validation
      if (status === ApprovalStatus.APPROVED && expectedVersion !== undefined) {
        if (currentTarget && "version" in currentTarget && currentTarget.version !== expectedVersion) {
          throw new Error("Conflict: The underlying resource has changed. Please refresh and re-evaluate.");
        }
      }

      // 7. Execution of Logic (If Approved)
      let executionResult = null;
      if (status === ApprovalStatus.APPROVED) {
        if (!request.targetId) throw new Error("Missing target vector for execution.");
        
        executionResult = await applyActionDirectly(
          tx,
          request.actionType,
          request.targetId,
          request.changes as any,
          request.requesterId, // Context: Action executes on behalf of requester
          request.organizationId,
          request.branchId
        );
      }

      // 8. Update Request Record
      const updated = await tx.approvalRequest.update({
        where: { id: request.id },
        data: {
          status,
          rejectionNote: status === ApprovalStatus.REJECTED ? rejectionNote : null,
          approverId: user.id,
          appliedAt: status === ApprovalStatus.APPROVED ? new Date() : null,
        },
      });

      // 9. Forensic Forensic Audit Logging
      await createAuditLog(tx, {
        organizationId: user.organizationId,
        branchId: request.branchId,
        actorId: user.id,
        actorRole: user.role,
        action: `AUTHORIZATION_${status}`,
        resourceId: updated.id,
        description: `Protocol ${request.actionType} was ${status.toLowerCase()} by ${user.name}.`,
        requestId, ipAddress, deviceInfo,
        severity: status === ApprovalStatus.APPROVED ? Severity.HIGH : Severity.MEDIUM,
        before: currentTarget ? { status: request.status, target: currentTarget } : null,
        after: { status: updated.status, executionResult },
        metadata: { rejectionNote, targetId: request.targetId, actionType: request.actionType },
      });

      return { request: updated, executionResult };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    // 10. Post-Transaction Notification
    eventBus.emitEvent("approval.resolved", {
      organizationId: result.request.organizationId,
      branchId: result.request.branchId,
      approvalId: result.request.id,
      requesterId: result.request.requesterId,
      status: status,
      actionType: result.request.actionType,
      notificationType: NotificationType.APPROVAL,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[APPROVAL_PATCH_ERROR]", error);
    return NextResponse.json(
      { error: error instanceof z.ZodError ? error.flatten() : error.message || "Internal Server Error" }, 
      { status: 400 }
    );
  }
}