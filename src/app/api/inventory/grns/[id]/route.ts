import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { 
  PermissionAction, 
  Severity, 
  Prisma, 
  GRNStatus, 
  POStatus, 
  StockMovementType, 
  NotificationType,
  Resource
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import crypto from "crypto";
import { authorize } from "@/core/lib/permission";
import { createAuditLog } from "@/core/lib/audit";

/* -------------------------
  ROUTE SEGMENT CONFIG 
------------------------- */
export const dynamic = "force-dynamic";

/* -------------------------
  UTILITIES
------------------------- */
/**
 * Exponential backoff wrapper for high-isolation Prisma transactions 
 * to handle P2034 (Deadlock/Write Conflict) errors gracefully.
 */
async function executeWithRetry<T>(
  operation: () => Promise<T>, 
  maxRetries = 3, 
  baseDelayMs = 150
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      if (error.code === 'P2034' && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Transaction failed after maximum retries due to strict isolation constraints.");
}

/**
 * PATCH /api/inventory/grns/[id]
 * Finalizes a Goods Receipt Note (Approves or Rejects).
 * Implements strict ledger consistency and forensic audit trails.
 */
export async function PATCH(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string }> } 
) {
  const requestId = crypto.randomUUID();
  
  try {
    // 1. Session & Identity Extraction
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const user = session.user;
    const orgId = user.organizationId;
    const { id: grnId } = await params;

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    // 2. Authorization: Centralized RBAC Check
    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.APPROVE,
      resources: Resource.PROCUREMENT, // Fixed: Using Prisma Enum
      userPermissions: user.permissions,
    });
    
    if (!auth.allowed) {
      return NextResponse.json(
        { error: auth.reason || "ACCESS_DENIED: Procurement approval rights required." }, 
        { status: 403 }
      );
    }

    // 3. Request Validation
    const body = await req.json().catch(() => null);
    if (!body || !["RECEIVED", "REJECTED"].includes(body.status)) {
      return NextResponse.json(
        { error: "Invalid status selection. Status must be RECEIVED or REJECTED." }, 
        { status: 400 }
      );
    }
    const newStatus = body.status as "RECEIVED" | "REJECTED";

    // 4. Atomic Transaction: Serializable Isolation for Financial/Stock Integrity
    const result = await executeWithRetry(() => prisma.$transaction(async (tx) => {
      // 4a. Fetch and Lock GRN record
      const grn = await tx.goodsReceiptNote.findUnique({
        where: { id: grnId },
        include: { items: true }
      });

      if (!grn) throw new Error("Goods Receipt Note (GRN) record not found.");
      if (grn.organizationId !== orgId) throw new Error("Security Breach: Organization mismatch.");
      
      // Fortress Constraint: Strict Branch Locking
      if (!user.isOrgOwner && user.branchId && grn.branchId !== user.branchId) {
         throw new Error("Security Violation: Cross-branch approval is strictly prohibited.");
      }

      if (grn.status !== GRNStatus.PENDING) {
        throw new Error(`Integrity Error: GRN is already ${grn.status}. Actions are locked.`);
      }

      const previousStatus = grn.status;

      // 4b. Update Header
      const updatedGrn = await tx.goodsReceiptNote.update({
        where: { id: grnId },
        data: {
          status: newStatus as GRNStatus,
          approvedById: user.id,
          updatedAt: new Date()
        }
      });

      // 5. Logic Branch: RECEIVED (Stock Injection)
      if (newStatus === "RECEIVED") {
        for (const item of grn.items) {
          const qtyAccepted = new Decimal(item.quantityAccepted || 0);
          
          if (qtyAccepted.gt(0)) {
            // Fortress Fix: Read current stock for WAC calculation
            const currentBranchProduct = await tx.branchProduct.findUnique({
              where: { id: item.branchProductId },
              select: { stock: true, costPrice: true }
            });

            if (!currentBranchProduct) throw new Error(`Data Integrity Error: Branch product ${item.branchProductId} missing.`);

            const oldStock = new Decimal(currentBranchProduct.stock || 0);
            const oldCost = currentBranchProduct.costPrice ? new Decimal(currentBranchProduct.costPrice) : new Decimal(0);
            const addedStockInt = Math.floor(qtyAccepted.toNumber()); // Float Fix: Enforce Integer
            const addedStock = new Decimal(addedStockInt);
            const itemCost = new Decimal(item.unitCost);

            // Fortress Fix: Weighted Average Cost (WAC) Logic
            let newCostPrice = itemCost;
            if (oldStock.add(addedStock).gt(0)) {
               const totalOldValue = oldStock.mul(oldCost);
               const totalNewValue = addedStock.mul(itemCost);
               newCostPrice = totalOldValue.add(totalNewValue).dividedBy(oldStock.add(addedStock));
            }

            // Update BranchProduct: Increment physical stock, calculate cost basis, increment version
            const branchProduct = await tx.branchProduct.update({
              where: { id: item.branchProductId },
              data: {
                stock: { increment: addedStockInt },
                stockVersion: { increment: 1 }, // Fortress Fix: Stock Versioning
                costPrice: newCostPrice,
                lastRestockedAt: new Date()
              }
            });

            // Log Stock Movement (Forensic Balance Tracking)
            await tx.stockMovement.create({
              data: {
                organizationId: orgId,
                branchId: grn.branchId,
                branchProductId: branchProduct.id,
                productId: item.productId,
                type: StockMovementType.IN,
                quantity: addedStockInt,
                unitCost: item.unitCost,
                totalCost: addedStock.mul(itemCost),
                reason: `GRN Finalized: ${grn.grnNumber}`,
                runningBalance: branchProduct.stock, // Safe to read post-update balance
                handledById: user.id,
                approvedAt: new Date(),
                grnId: grn.id
              }
            });

            // Update associated Purchase Order Item
            if (item.poItemId) {
              const poItem = await tx.purchaseOrderItem.findUnique({ where: { id: item.poItemId } });
              
              if (poItem) {
                 await tx.purchaseOrderItem.update({
                   where: { id: item.poItemId },
                   data: { 
                     quantityReceived: { increment: addedStockInt } 
                   }
                 });
              }
            }
          }
        }

        // 6. PO Header Sync
        if (grn.purchaseOrderId) {
          const allPoItems = await tx.purchaseOrderItem.findMany({ 
            where: { purchaseOrderId: grn.purchaseOrderId } 
          });
          
          const isFullyFulfilled = allPoItems.every(i => 
            new Decimal(i.quantityReceived).gte(new Decimal(i.quantityOrdered))
          );

          await tx.purchaseOrder.update({
            where: { id: grn.purchaseOrderId },
            data: { 
              status: isFullyFulfilled ? POStatus.FULFILLED : POStatus.PARTIALLY_RECEIVED,
              updatedAt: new Date()
            }
          });
        }
      } 
      
      // 7. Logic Branch: REJECTED
      else if (newStatus === "REJECTED") {
        for (const item of grn.items) {
          const totalQtyAttempted = (item.quantityAccepted || 0) + (item.quantityRejected || 0);
          
          // Reassign all attempted quantities to Rejected. (PO remains untouched since this GRN failed).
          await tx.goodsReceiptItem.update({
            where: { id: item.id },
            data: {
              quantityAccepted: 0,
              quantityRejected: totalQtyAttempted,
              updatedAt: new Date()
            }
          });
        }
      }

      // 8. Forensic Audit Integration
      const auditLog = await createAuditLog(tx, {
        action: newStatus === "RECEIVED" ? "APPROVE_GRN" : "REJECT_GRN",
        resource: Resource.PROCUREMENT,
        resourceId: grn.id,
        organizationId: orgId,
        branchId: grn.branchId,
        actorId: user.id,
        actorRole: user.role,
        severity: newStatus === "RECEIVED" ? Severity.HIGH : Severity.MEDIUM,
        description: `GRN ${grn.grnNumber} finalized as ${newStatus}.`,
        changes: { from: { status: previousStatus }, to: { status: newStatus } },
        ipAddress,
        deviceInfo,
        requestId,
        metadata: { grnNumber: grn.grnNumber, itemCount: grn.items.length }
      });

      // 9. Notification Delivery (Notifies the original receiver)
      await tx.notification.create({
        data: {
          organizationId: orgId,
          branchId: grn.branchId,
          type: NotificationType.INFO,
          title: `GRN ${newStatus === "RECEIVED" ? "Received" : "Rejected"}`, // Fortress Fix: Accurate Title
          message: `Receipt ${grn.grnNumber} has been ${newStatus.toLowerCase()} and inventory ledgers processed.`,
          activityLogId: auditLog.id,
          recipients: { 
            create: [{ personnelId: grn.receivedById }] 
          },
        },
      });

      return updatedGrn;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30000 
    }));

    return NextResponse.json({ 
      success: true, 
      status: result.status,
      message: `GRN ${result.grnNumber} successfully finalized.`
    });

  } catch (err: unknown) {
    console.error(`[GRN_PATCH_FAILURE][ID: ${requestId}]`, err);
    const errorMessage = err instanceof Error ? err.message : "A system error occurred during GRN finalization.";
    return NextResponse.json({ error: errorMessage, requestId }, { status: 400 });
  }
}