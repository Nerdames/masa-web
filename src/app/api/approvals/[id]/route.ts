import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { z } from "zod";
import { 
  ApprovalStatus, 
  Severity, 
  PermissionAction, 
  Resource,
  CriticalAction,
  Prisma 
} from "@prisma/client";
import { authorize, ROLE_WEIGHT } from "@/core/lib/permission";
import { eventBus } from "@/core/events";
import { createAuditLog } from "@/core/lib/audit";
import crypto from "crypto";

/* -------------------------------------------------------------------------- */
/* VALIDATION & SCHEMAS                                                       */
/* -------------------------------------------------------------------------- */

const UpdateApprovalSchema = z.object({
  status: z.enum([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED]),
  rejectionNote: z.string().max(1000).optional().nullable(),
  expectedVersion: z.number().int().optional(),
});

/* -------------------------------------------------------------------------- */
/* UTILITIES                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * PRODUCTION GUARD: Resolves system action targets to exact Prisma Model Delegates.
 * Prevents raw SQL injection vectors and resolves 42P01 Relation Not Found errors.
 */
const resolvePrismaModel = (targetType: string): string | null => {
  const normalized = targetType.toUpperCase().replace(/[^A-Z_]/g, '');
  const map: Record<string, string> = {
    GRN: "goodsReceiptNote",
    GOODSRECEIPTNOTE: "goodsReceiptNote",
    PO: "purchaseOrder",
    PURCHASEORDER: "purchaseOrder",
    STOCKMOVEMENT: "stockMovement",
    STOCK_MOVEMENT: "stockMovement",
    STOCKTRANSFER: "stockTransfer",
    STOCK_TRANSFER: "stockTransfer",
    STOCKTAKE: "stockTake",
    STOCK_TAKE: "stockTake",
    INVOICE: "invoice",
    EXPENSE: "expense",
    REFUND: "refund",
    PRODUCT: "product",
    BRANCHPRODUCT: "branchProduct",
    BRANCH_PRODUCT: "branchProduct",
    PERSONNEL: "authorizedPersonnel",
    AUTHORIZEDPERSONNEL: "authorizedPersonnel",
    USER: "authorizedPersonnel",
    CUSTOMER: "customer",
    VENDOR: "vendor",
    CATEGORY: "category"
  };
  return map[normalized] || null;
};

/* -------------------------------------------------------------------------- */
/* MAIN HANDLER: PATCH /api/approvals/[id]                                    */
/* -------------------------------------------------------------------------- */

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Session & Identity Verification
    const session = await getServerSession(authOptions);
    const user = session?.user;

    if (!user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized access detected." }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const { status, rejectionNote, expectedVersion } = UpdateApprovalSchema.parse(body);

    const requestId = crypto.randomUUID();
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    // 2. Atomic Transaction Block
    const result = await prisma.$transaction(async (tx) => {
      // A. Lock Request & Validate Context
      const request = await tx.approvalRequest.findUnique({
        where: { id: id }, 
      });

      if (!request || request.organizationId !== user.organizationId) {
        throw new Error("Resolution failed: Authorization record not found or cross-org violation.");
      }

      // B. Idempotency & Safety Guards
      if (request.status !== ApprovalStatus.PENDING || request.appliedAt) {
        throw new Error(`Immutable record: This request has already been ${request.status.toLowerCase()}.`);
      }

      if (request.expiresAt && request.expiresAt < new Date()) {
        await tx.approvalRequest.update({ 
          where: { id: request.id }, 
          data: { status: ApprovalStatus.EXPIRED } 
        });
        throw new Error("Security timeout: The authorization window for this request has expired.");
      }

      // C. Anti-Tamper: Self-Approval Prevention
      if (request.requesterId === user.id && !user.isOrgOwner) {
        throw new Error("Policy Violation: Personnel cannot authorize their own critical requests.");
      }

      // D. Multi-Layered Permission Check
      const resourceType = (request.targetType?.toUpperCase() as Resource) || Resource.SETTINGS;
      const { allowed, reason } = authorize({
        role: user.role,
        isOrgOwner: user.isOrgOwner,
        action: PermissionAction.APPROVE,
        resources: resourceType,
        userPermissions: user.permissions || [], 
        criticalAction: request.actionType as CriticalAction
      });

      // E. Role Weight Escalation Check
      const hasAuthorityWeight = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT[request.requiredRole];
      
      if (!allowed || !hasAuthorityWeight) {
        throw new Error(reason || "Access Denied: Insufficient role authority for this resolution.");
      }

      // F. Safe Model Delegation & Optimistic Locking
      let currentTarget: Record<string, unknown> | null = null;
      let delegate: any = null;

      if (request.targetId && request.targetType) {
        const prismaModel = resolvePrismaModel(request.targetType);
        
        if (!prismaModel || !(tx as Record<string, any>)[prismaModel]) {
          throw new Error(`Integrity Failure: Unknown or unmapped target resource type '${request.targetType}'.`);
        }

        delegate = (tx as Record<string, any>)[prismaModel];
        
        currentTarget = await delegate.findUnique({
          where: { id: request.targetId }
        });

        if (status === ApprovalStatus.APPROVED && expectedVersion !== undefined && currentTarget) {
          if ("version" in currentTarget && currentTarget.version !== expectedVersion) {
            throw new Error("Concurrency Conflict: The resource has been modified. Please re-evaluate.");
          }
        }
      }

      // G. Native ORM Execution with Relational Reconciliation
      let executionResult: Record<string, unknown> | null = null;
      
      if (status === ApprovalStatus.APPROVED && request.targetId && delegate) {
        const rawChanges = (request.changes as Record<string, any>) || {};
        
        if (Object.keys(rawChanges).length > 0) {
          const updateData: Record<string, any> = {};

          // Ghost fields often injected by the UI that break Prisma queries
          const ghostFields = ['totalValue', 'totalCost', 'totalValueNet', 'productName', 'sku'];

          // TRANSFORM RAW CHANGES INTO PRISMA NESTED WRITES
          for (const [key, value] of Object.entries(rawChanges)) {
            if (ghostFields.includes(key)) continue;

            /**
             * RELATION CHECK: Deep relational mapping for overwritten items (GRN, PO, Invoices).
             */
            if (key === 'items' && Array.isArray(value)) {
              updateData[key] = {
                deleteMany: {}, 
                create: value.map(({ id, ...item }: any) => {
                  const formattedItem: Record<string, any> = {};
                  
                  for (const [itemKey, itemVal] of Object.entries(item)) {
                    if (ghostFields.includes(itemKey)) continue;

                    // Intelligent Mapping: Convert scalar IDs (e.g., productId) to Prisma Connects
                    if (itemKey.endsWith('Id') && typeof itemVal === 'string' && itemVal) {
                      const relationName = itemKey.slice(0, -2); // productId -> product
                      formattedItem[relationName] = { connect: { id: itemVal } };
                    } else {
                      formattedItem[itemKey] = itemVal;
                    }
                  }

                  // Fallback: If the UI forgot branchProductId (common in GRNs), auto-connect it 
                  // using Prisma's compound unique constraint to preserve DB integrity.
                  if (!formattedItem.branchProduct && item.productId && request.branchId) {
                    formattedItem.branchProduct = {
                      connect: {
                        branchId_productId: {
                          branchId: request.branchId,
                          productId: item.productId
                        }
                      }
                    };
                  }

                  return formattedItem;
                }) 
              };
            } else {
              updateData[key] = value;
            }
          }
          
          // Natively bump optimistic concurrency version
          if (currentTarget && "version" in currentTarget) {
            updateData.version = { increment: 1 };
          }

          executionResult = await delegate.update({
            where: { id: request.targetId },
            data: updateData
          });
        }
      }

      // H. Update Approval Record Status
      const updatedRequest = await tx.approvalRequest.update({
        where: { id: request.id },
        data: {
          status,
          rejectionNote: status === ApprovalStatus.REJECTED ? rejectionNote : null,
          approverId: user.id,
          appliedAt: status === ApprovalStatus.APPROVED ? new Date() : null,
        },
      });

      // I. Forensic Audit Logging
      await createAuditLog(tx as any, {
        organizationId: user.organizationId,
        branchId: request.branchId,
        actorId: user.id,
        actorRole: user.role,
        action: `AUTHORIZATION_${status}`,
        resource: resourceType,
        resourceId: updatedRequest.id,
        description: `Protocol ${request.actionType} ${status.toLowerCase()} by ${user.name || 'System'}.`,
        severity: status === ApprovalStatus.APPROVED ? Severity.HIGH : Severity.MEDIUM,
        changes: {
          from: currentTarget || { status: ApprovalStatus.PENDING },
          to: executionResult || { status: updatedRequest.status }
        },
        requestId,
        ipAddress,
        deviceInfo,
        metadata: { 
          targetType: request.targetType, 
          targetId: request.targetId,
          actionType: request.actionType 
        },
      });

      return { request: updatedRequest, executionResult };
    }, { 
      // Force serializable isolation to prevent race conditions during high-volume approvals
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable 
    });

    // 3. Decoupled Notifications
    eventBus.emitEvent("approval.resolved", {
      organizationId: result.request.organizationId,
      branchId: result.request.branchId,
      approvalId: result.request.id,
      requesterId: result.request.requesterId,
      approverId: user.id,
      status: status as "APPROVED" | "REJECTED",
      actionType: result.request.actionType,
      title: `Request ${status === ApprovalStatus.APPROVED ? 'Authorized' : 'Declined'}`,
      message: `Your request for ${result.request.actionType.replace(/_/g, " ")} has been ${status.toLowerCase()} by ${user.name || "management"}.`
    });

    return NextResponse.json(result);

  } catch (error: unknown) {
    console.error("[CRITICAL_APPROVAL_ERROR]", error);
    
    let errorMessage = "Internal Protocol Error";
    if (error instanceof z.ZodError) {
      errorMessage = JSON.stringify(error.flatten());
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { error: errorMessage }, 
      { status: 400 }
    );
  }
}