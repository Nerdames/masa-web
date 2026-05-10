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
  NotificationType 
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import crypto from "crypto";
import { authorize, RESOURCES } from "@/core/lib/permission";

/* -------------------------
  ROUTE SEGMENT CONFIG 
------------------------- */
export const dynamic = "force-dynamic";

/**
 * Interface representing the augmented NextAuth user structure.
 */
interface MasaUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role: Role;
  isOrgOwner: boolean;
  organizationId: string;
  branchId: string | null;
  permissions: string[];
}

/**
 * PATCH /api/inventory/grns/[id]
 * Finalizes a Goods Receipt Note (Approves or Rejects).
 * This endpoint implements the "Point of Truth" for physical inventory entry.
 */
export async function PATCH(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string }> } 
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const user = session.user as MasaUser;
    const orgId = user.organizationId;
    const { id: grnId } = await params;

    const requestId = crypto.randomUUID();
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    // 1. Authorization: Requires APPROVE permission on PROCUREMENT resource
    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.APPROVE,
      resource: RESOURCES.PROCUREMENT,
    });
    
    if (!auth.allowed) {
      return NextResponse.json(
        { error: "ACCESS_DENIED: Managerial approval rights required." }, 
        { status: 403 }
      );
    }

    // 2. Request Validation
    const body = await req.json().catch(() => null);
    if (!body || !["RECEIVED", "REJECTED"].includes(body.status)) {
      return NextResponse.json(
        { error: "Invalid status selection. Status must be RECEIVED or REJECTED." }, 
        { status: 400 }
      );
    }
    const newStatus = body.status as "RECEIVED" | "REJECTED";

    // 3. Atomic Transaction: Ensures Ledger Consistency
    const result = await prisma.$transaction(async (tx) => {
      // 3a. Lock the record and fetch relations
      const grn = await tx.goodsReceiptNote.findUnique({
        where: { id: grnId },
        include: { items: true }
      });

      if (!grn) throw new Error("Goods Receipt Note (GRN) record not found.");
      if (grn.organizationId !== orgId) throw new Error("Security Breach: Organization mismatch.");
      if (grn.status !== GRNStatus.PENDING) {
        throw new Error(`Integrity Error: GRN is already ${grn.status}. Actions are locked.`);
      }

      // 3b. Update Header
      const updatedGrn = await tx.goodsReceiptNote.update({
        where: { id: grnId },
        data: {
          status: newStatus as GRNStatus,
          approvedById: user.id,
          updatedAt: new Date()
        }
      });

      // 4. Case: RECEIVED (Approval & Stock Injection)
      if (newStatus === "RECEIVED") {
        for (const item of grn.items) {
          const qtyAccepted = new Decimal(item.quantityAccepted || 0);
          
          if (qtyAccepted.gt(0)) {
            // Update BranchProduct: Increment physical stock and update latest cost price
            const branchProduct = await tx.branchProduct.update({
              where: { id: item.branchProductId },
              data: {
                stock: { increment: qtyAccepted.toNumber() },
                costPrice: item.unitCost,
                lastRestockedAt: new Date()
              }
            });

            // Forensic Stock Movement Ledger entry
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
                runningBalance: branchProduct.stock, // Current balance after increment
                handledById: user.id,
                approvedAt: new Date(),
                grnId: grn.id
              }
            });

            // Cascade to Purchase Order Item (if linked)
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

        // 5. Cascade to Purchase Order Header (Status Balancing)
        if (grn.purchaseOrderId) {
          const allPoItems = await tx.purchaseOrderItem.findMany({ 
            where: { purchaseOrderId: grn.purchaseOrderId } 
          });
          
          // Math Check: Is the sum of all GRNs meeting the PO requirement?
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
      
      // 6. Case: REJECTED (Revert/Zero-out logic)
      else if (newStatus === "REJECTED") {
        for (const item of grn.items) {
          const totalQtyAttempted = (item.quantityAccepted || 0) + (item.quantityRejected || 0);

          // SOP: If the whole GRN is rejected, move all quantities to the 'Rejected' bucket
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

      // 7. Cryptographic Activity Log
      const lastLog = await tx.activityLog.findFirst({ 
        where: { organizationId: orgId }, 
        orderBy: { createdAt: "desc" }, 
        select: { hash: true } 
      });
      
      const previousHash = lastLog?.hash ?? "0".repeat(64);
      const actionTitle = newStatus === "RECEIVED" ? "APPROVE_GRN" : "REJECT_GRN";
      const timestamp = Date.now();
      
      const hashPayload = JSON.stringify({ 
        previousHash, requestId, actorId: user.id, action: actionTitle, 
        targetId: grn.id, status: newStatus, timestamp 
      });
      const hash = crypto.createHash("sha256").update(hashPayload).digest("hex");

      const log = await tx.activityLog.create({
        data: {
          organizationId: orgId,
          branchId: grn.branchId,
          actorId: user.id,
          actorType: ActorType.USER,
          actorRole: user.role,
          action: actionTitle,
          targetType: "GRN",
          targetId: grn.id,
          severity: newStatus === "RECEIVED" ? Severity.HIGH : Severity.MEDIUM,
          description: `GRN ${grn.grnNumber} finalized as ${newStatus}. Approved by: ${user.name || 'Manager'}.`,
          metadata: { 
            grnNumber: grn.grnNumber, 
            status: newStatus,
            itemsCount: grn.items.length 
          },
          requestId, ipAddress, deviceInfo, previousHash, hash, critical: true,
        },
      });

      // 8. System Notification
      await tx.notification.create({
        data: {
          organizationId: orgId,
          branchId: grn.branchId,
          type: NotificationType.INFO,
          title: `GRN ${newStatus === "RECEIVED" ? "Approved" : "Rejected"}`,
          message: `Receipt ${grn.grnNumber} has been ${newStatus.toLowerCase()} and processed into the system.`,
          activityLogId: log.id,
          recipients: { 
            create: [{ personnelId: grn.receivedById }] 
          },
        },
      });

      return updatedGrn;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 25000 
    });

    return NextResponse.json({ 
      success: true, 
      status: result.status,
      message: `Transaction complete. GRN is now ${result.status}.`
    });

  } catch (err: unknown) {
    console.error("[GRN_PATCH_CRITICAL_FAIL]", err);
    const errorMessage = err instanceof Error ? err.message : "A system error occurred during GRN finalization.";
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}