import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { 
  PermissionAction, 
  ActorType, 
  Severity, 
  Prisma, 
  GRNStatus, 
  POStatus, 
  Role, 
  StockMovementType, 
  NotificationType,
  Resource
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import crypto from "crypto";
import { authorize, RESOURCES } from "@/core/lib/permission";
import { createAuditLog } from "@/core/lib/audit";

/* -------------------------
  ROUTE SEGMENT CONFIG 
------------------------- */
export const dynamic = "force-dynamic";

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
      resources: RESOURCES.PROCUREMENT,
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
    const result = await prisma.$transaction(async (tx) => {
      // 4a. Fetch and Lock GRN record
      const grn = await tx.goodsReceiptNote.findUnique({
        where: { id: grnId },
        include: { items: true }
      });

      if (!grn) throw new Error("Goods Receipt Note (GRN) record not found.");
      if (grn.organizationId !== orgId) throw new Error("Security Breach: Organization mismatch.");
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
            // Update BranchProduct: Increment physical stock and cost basis
            const branchProduct = await tx.branchProduct.update({
              where: { id: item.branchProductId },
              data: {
                stock: { increment: qtyAccepted.toNumber() },
                costPrice: item.unitCost,
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
                quantity: qtyAccepted.toNumber(),
                unitCost: item.unitCost,
                totalCost: qtyAccepted.mul(new Decimal(item.unitCost)),
                reason: `GRN Approved: ${grn.grnNumber}`,
                runningBalance: branchProduct.stock,
                handledById: user.id,
                approvedAt: new Date(),
                grnId: grn.id
              }
            });

            // Update associated Purchase Order Item if exists
            if (item.poItemId) {
              await tx.purchaseOrderItem.update({
                where: { id: item.poItemId },
                data: { 
                  quantityReceived: { increment: qtyAccepted.toNumber() } 
                }
              });
            }
          }
        }

        // 6. PO Header Sync (Partial vs Full fulfillment)
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
      
      // 7. Logic Branch: REJECTED (Zero-out logic)
      else if (newStatus === "REJECTED") {
        for (const item of grn.items) {
          const totalQtyAttempted = (item.quantityAccepted || 0) + (item.quantityRejected || 0);
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

      // 9. Notification Delivery
      await tx.notification.create({
        data: {
          organizationId: orgId,
          branchId: grn.branchId,
          type: NotificationType.INFO,
          title: `GRN ${newStatus === "RECEIVED" ? "Approved" : "Rejected"}`,
          message: `Receipt ${grn.grnNumber} has been ${newStatus.toLowerCase()} and inventory updated.`,
          activityLogId: auditLog.id,
          recipients: { 
            create: [{ personnelId: grn.receivedById }] 
          },
        },
      });

      return updatedGrn;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30000 // Extended for heavy stock updates
    });

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