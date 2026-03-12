import prisma from "@/lib/prisma";
import { ApprovalStatus, CriticalAction, Role, Prisma } from "@prisma/client";

export const ApprovalService = {
  /**
   * Create a new approval request.
   * This is the entry point for all system-wide critical actions.
   */
  async createRequest(
    organizationId: string,
    requesterId: string,
    data: {
      actionType: CriticalAction;
      changes: Prisma.InputJsonValue;
      branchId?: string;
      targetType?: string;
      targetId?: string;
      requiredRole?: Role;
    }
  ) {
    return await prisma.approvalRequest.create({
      data: {
        organizationId,
        requesterId,
        actionType: data.actionType,
        changes: data.changes,
        branchId: data.branchId,
        targetType: data.targetType,
        targetId: data.targetId,
        requiredRole: data.requiredRole || Role.MANAGER,
        status: ApprovalStatus.PENDING,
      },
    });
  },

  /**
   * Process a decision (Approve/Reject).
   * Ensures atomicity between status update and audit logging.
   */
  async processDecision(
    organizationId: string,
    approverId: string,
    requestId: string,
    decision: "APPROVED" | "REJECTED",
    rejectionNote?: string
  ) {
    return await prisma.$transaction(async (tx) => {
      // 1. Update the request status
      const request = await tx.approvalRequest.update({
        where: { id: requestId, organizationId },
        data: {
          status: decision === "APPROVED" ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
          approverId,
          rejectionNote,
          appliedAt: decision === "APPROVED" ? new Date() : null,
        },
      });

      // 2. Log the decision in the global ActivityLog
      await tx.activityLog.create({
        data: {
          organizationId,
          branchId: request.branchId ?? undefined,
          personnelId: approverId,
          action: decision === "APPROVED" ? "APPROVAL_GRANTED" : "APPROVAL_REJECTED",
          critical: true,
          metadata: { 
            requestId, 
            actionType: request.actionType,
            targetId: request.targetId 
          },
        },
      });

      return request;
    });
  },

  /**
   * Fetch requests, optionally filtered by branch or status.
   */
  async getRequests(params: {
    organizationId: string;
    status?: ApprovalStatus;
    branchId?: string;
  }) {
    return await prisma.approvalRequest.findMany({
      where: {
        organizationId: params.organizationId,
        status: params.status,
        branchId: params.branchId,
      },
      include: {
        requester: { select: { name: true, email: true } },
        approver: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },
};