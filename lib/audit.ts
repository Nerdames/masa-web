import prisma from "@/lib/prisma";
import { CriticalAction } from "@prisma/client";

interface LogOptions {
  personnelId: string;
  action: string | CriticalAction;
  meta?: string | object;
  branchId?: string | null;
  organizationId?: string;
  approvalRequestId?: string;
}

/**
 * Global utility to record system and user actions.
 * If organizationId or branchId are missing, it attempts to fetch them from the user profile.
 */
export async function logActivity({
  personnelId,
  action,
  meta,
  branchId,
  organizationId,
  approvalRequestId,
}: LogOptions) {
  try {
    let targetOrgId = organizationId;
    let targetBranchId = branchId;

    // 1. Auto-resolve IDs if not provided
    if (!targetOrgId) {
      const user = await prisma.authorizedPersonnel.findUnique({
        where: { id: personnelId },
        select: { organizationId: true, branchId: true },
      });

      if (user) {
        targetOrgId = user.organizationId;
        targetBranchId = targetBranchId ?? user.branchId;
      }
    }

    if (!targetOrgId) return; // Cannot log without an organization context

    // 2. Create the log entry
    return await prisma.activityLog.create({
      data: {
        organizationId: targetOrgId,
        branchId: targetBranchId ?? null,
        personnelId,
        action: action.toString(),
        approvalRequestId: approvalRequestId ?? null,
        meta: typeof meta === "object" ? JSON.stringify(meta) : meta,
      },
    });
  } catch (error) {
    // We "fail-silent" on logs to prevent an audit error from crashing a main business transaction
    console.error("AUDIT_LOG_FAILURE:", error);
  }
}