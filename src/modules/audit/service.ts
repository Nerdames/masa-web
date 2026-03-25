// src/modules/audit/service.ts
import prisma from "@/core/lib/prisma";
import { CriticalAction } from "@prisma/client";

interface LogOptions {
  personnelId: string;
  action: string | CriticalAction;
  details?: string;
  meta?: Record<string, any> | string;
  branchId?: string | null;
  organizationId?: string;
  approvalRequestId?: string | null;
}

/**
 * Fortress Audit Logger
 * Standardized utility to record system and user actions.
 * Integrates with the Prisma Extension to trigger real-time alerts on critical actions.
 */
export async function logActivity({
  personnelId,
  action,
  details,
  meta,
  branchId,
  organizationId,
  approvalRequestId,
}: LogOptions) {
  try {
    let targetOrgId = organizationId;
    let targetBranchId = branchId;

    // 1. Auto-resolve Organization/Branch context if missing
    if (!targetOrgId) {
      const user = await prisma.authorizedPersonnel.findUnique({
        where: { id: personnelId },
        select: { organizationId: true, branchId: true },
      });

      if (user) {
        targetOrgId = user.organizationId;
        // Only override branchId if it wasn't explicitly passed as null/id
        if (targetBranchId === undefined) {
          targetBranchId = user.branchId;
        }
      }
    }

    if (!targetOrgId) {
      console.warn(`[AUDIT_LOG_SKIPPED]: No organization context found for personnel ${personnelId}`);
      return;
    }

    // 2. Determine if this is a "Critical" action based on the Schema Enum
    const isCritical = Object.values(CriticalAction).includes(action as CriticalAction);

    // 3. Create the log entry
    // NOTE: This will trigger the Prisma Extension in @/core/lib/prisma.ts 
    // if 'critical' is true, which emits the 'security.alert' event.
    return await prisma.activityLog.create({
      data: {
        organizationId: targetOrgId,
        branchId: targetBranchId ?? null,
        personnelId,
        action: action.toString(),
        details: details ?? null,
        critical: isCritical,
        approvalRequestId: approvalRequestId ?? null,
        meta: meta 
          ? (typeof meta === "object" ? JSON.stringify(meta) : meta) 
          : null,
      },
    });
  } catch (error) {
    /**
     * "FAIL-SAFE" PROTOCOL:
     * We log the error to the console but do not throw. 
     * In a production ERP, a failure in the audit trail should not 
     * crash the primary transaction (e.g., making a sale).
     */
    console.error("[FORTRESS_AUDIT_FAILURE]:", error);
  }
}