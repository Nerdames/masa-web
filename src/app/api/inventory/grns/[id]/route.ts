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

/**
 * PATCH /api/inventory/grns/[id]
 * Finalizes a Goods Receipt Note (Approves or Rejects)
 * Logic: Audit-Proof Inventory Ledger Integration
 */
export async function PATCH(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string }> } 
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const user = session.user as any;
    const orgId = user.organizationId;
    const { id: grnId } = await params;

    const requestId = crypto.randomUUID();
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    // 1. Authorization Check
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

    // 2. Validate Request Body
    const body = await req.json().catch(() => null);
    if (!body || !["RECEIVED", "REJECTED"].includes(body.status)) {
      return NextResponse.json(
        { error: "Invalid status selection. Must be RECEIVED or REJECTED." }, 
        { status: 400 }
      );
    }
    const newStatus = body.status as "RECEIVED" | "REJECTED";

    // 3. Atomic Transaction Block
    const result = await prisma.$transaction(async (tx) => {
      // Fetch GRN with strict locking
      const grn = await tx.goodsReceiptNote.findUnique({
        where: { id: grnId },
        include: { items: true }
      });

      if (!grn) throw new Error("Goods Receipt Note (GRN) record not found.");
      if (grn.organizationId !== orgId) throw new Error("Security Breach: Organization mismatch detected.");
      if (grn.status !== GRNStatus.PENDING) {
        throw new Error(`Integrity Error: GRN is already ${grn.status}. Actions are locked.`);
      }

      // Update GRN Header status
      const updatedGrn = await tx.goodsReceiptNote.update({
        where: { id: grnId },
        data: {
          status: newStatus as GRNStatus,
          approvedById: user.id,
          // Track when the audit happened
          updatedAt: new Date()
        }
      });

      // 4. Processing Logic for Accepted Goods
      if (newStatus === "RECEIVED") {
        for (const item of grn.items) {
          const qtyAccepted = new Decimal(item.quantityAccepted || 0);
          const qtyRejected = new Decimal(item.quantityRejected || 0);

          // Update Stock only for accepted quantities
          if (qtyAccepted.gt(0)) {
            const branchProduct = await tx.branchProduct.update({
              where: { id: item.branchProductId },
              data: {
                stock: { increment: qtyAccepted.toNumber() },
                costPrice: item.unitCost,
                lastRestockedAt: new Date()
              }
            });

            // Log granular stock movement
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
                reason: `GRN:${grn.grnNumber} (Accepted: ${qtyAccepted}, Rejected: ${qtyRejected})`,
                runningBalance: branchProduct.stock,
                handledById: user.id,
                grnId: grn.id
              }
            });

            // Link to Purchase Order Item to update fulfillment progress
            if (item.poItemId) {
              await tx.purchaseOrderItem.update({
                where: { id: item.poItemId },
                data: { 
                  // Only increment by ACCEPTED quantity. 
                  // Rejected items stay in "Ordered but not Received" state on the PO.
                  quantityReceived: { increment: qtyAccepted.toNumber() } 
                }
              });
            }
          }
        }

        // 5. Purchase Order Fulfillment Calculation
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
              status: isFullyFulfilled ? POStatus.FULFILLED : POStatus.PARTIALLY_RECEIVED 
            }
          });
        }
      } else if (newStatus === "REJECTED") {
        // Processing logic for Rejected Goods
        for (const item of grn.items) {
          const totalQty = (item.quantityAccepted || 0) + (item.quantityRejected || 0);

          // Shift all previously inputted accepted quantity to rejected
          await tx.goodsReceiptItem.update({
            where: { id: item.id },
            data: {
              quantityAccepted: 0,
              quantityRejected: totalQty,
              updatedAt: new Date()
            }
          });
        }
      }

      // 6. Forensic Audit Chain
      const lastLog = await tx.activityLog.findFirst({ 
        where: { organizationId: orgId }, 
        orderBy: { createdAt: "desc" }, 
        select: { hash: true } 
      });
      
      const previousHash = lastLog?.hash ?? "0".repeat(64);
      const actionTitle = newStatus === "RECEIVED" ? "APPROVE_GRN" : "REJECT_GRN";
      const timestamp = Date.now();
      
      // Hash includes the result status to prevent status-tampering in DB
      const hashPayload = JSON.stringify({ 
        previousHash, 
        requestId, 
        actorId: user.id, 
        action: actionTitle, 
        targetId: grn.id, 
        status: newStatus,
        timestamp 
      });
      const hash = crypto.createHash("sha256").update(hashPayload).digest("hex");

      const log = await tx.activityLog.create({
        data: {
          organizationId: orgId,
          branchId: grn.branchId,
          actorId: user.id,
          actorType: ActorType.USER,
          actorRole: user.role as Role,
          action: actionTitle,
          targetType: "GRN",
          targetId: grn.id,
          severity: newStatus === "RECEIVED" ? Severity.HIGH : Severity.MEDIUM,
          description: `GRN ${grn.grnNumber} finalized as ${newStatus}. Manager: ${user.name || 'Admin'}.`,
          metadata: { 
            grnNumber: grn.grnNumber, 
            status: newStatus,
            itemsCount: grn.items.length 
          },
          requestId, 
          ipAddress, 
          deviceInfo, 
          previousHash, 
          hash, 
          critical: true,
        },
      });

      // 7. Automated Notifications
      await tx.notification.create({
        data: {
          organizationId: orgId,
          branchId: grn.branchId,
          type: NotificationType.APPROVAL,
          title: `GRN ${newStatus === "RECEIVED" ? "Approved" : "Rejected"}`,
          message: `The receipt for ${grn.grnNumber} was ${newStatus.toLowerCase()} by management.`,
          activityLogId: log.id,
          recipients: { 
            create: [{ personnelId: grn.receivedById }] 
          },
        },
      });

      return updatedGrn;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 25000 // Extended for heavy inventory calculations
    });

    return NextResponse.json({ 
      success: true, 
      status: result.status,
      message: `Inventory successfully ${result.status === "RECEIVED" ? "updated" : "locked"}.`
    });

  } catch (err: any) {
    console.error("[GRN_FINALIZATION_CRITICAL_FAIL]", err);
    return NextResponse.json(
      { error: err.message || "A system error occurred during inventory finalization." }, 
      { status: 400 }
    );
  }
}