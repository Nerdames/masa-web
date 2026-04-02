import { Prisma, CriticalAction } from "@prisma/client";

export interface ActionPayload {
  lock?: boolean;
  reason?: string;
  branchProductId?: string;
  newPrice?: number | string;
  adjustmentAmount?: number;
  productId?: string;
  quantity?: number;
  destinationBranchId?: string;
  invoiceId?: string;
  newEmail?: string;
  hashedPassword?: string;
  targetId?: string;
  expectedVersion?: number; // Added for Optimistic Locking
  [key: string]: any;
}

/**
 * Executes critical business logic with strict state validation.
 */
export async function applyActionDirectly(
  tx: Prisma.TransactionClient,
  action: CriticalAction,
  targetId: string,
  payload: ActionPayload,
  requesterId: string,
  organizationId: string,
  branchId: string | null
) {
  switch (action) {
    case CriticalAction.USER_LOCK_UNLOCK:
      return await tx.authorizedPersonnel.update({
        where: { id: targetId },
        data: { 
          isLocked: payload.lock ?? true,
          lockReason: payload.reason || "Administrative action",
        },
      });

    case CriticalAction.PRICE_UPDATE:
      return await tx.branchProduct.update({
        // Optimistic Lock: Update only if version matches
        where: { 
          id: payload.branchProductId,
          ...(payload.expectedVersion && { stockVersion: payload.expectedVersion })
        },
        data: { 
          sellingPrice: new Prisma.Decimal(payload.newPrice!),
          stockVersion: { increment: 1 } 
        },
      });

    case CriticalAction.STOCK_ADJUST:
      return await tx.branchProduct.update({
        where: { 
          id: payload.branchProductId,
          ...(payload.expectedVersion && { stockVersion: payload.expectedVersion })
        },
        data: { 
          stock: { increment: payload.adjustmentAmount },
          stockVersion: { increment: 1 }
        },
      });

    case CriticalAction.STOCK_TRANSFER:
      // Atomic Transfer: Decrease source, Increase destination
      const source = await tx.branchProduct.update({
        where: { 
          productId_branchId: { productId: payload.productId!, branchId: branchId! },
          stock: { gte: payload.quantity! } // Prevent negative stock
        },
        data: { stock: { decrement: payload.quantity! } }
      });

      await tx.branchProduct.upsert({
        where: { productId_branchId: { productId: payload.productId!, branchId: payload.destinationBranchId! } },
        create: {
          organizationId,
          branchId: payload.destinationBranchId!,
          productId: payload.productId!,
          stock: payload.quantity!,
          sellingPrice: source.sellingPrice,
        },
        update: { stock: { increment: payload.quantity! } }
      });

      return await tx.stockMovement.create({
        data: {
          organizationId,
          branchId: branchId!,
          productId: payload.productId!,
          quantity: payload.quantity!,
          type: "TRANSFER",
          note: `Transfer to branch ${payload.destinationBranchId}`,
          personnelId: requesterId,
        },
      });

    case CriticalAction.VOID_INVOICE:
      return await tx.invoice.update({
        where: { id: payload.invoiceId, status: { not: "VOIDED" } },
        data: { status: "VOIDED" },
      });

    case CriticalAction.EMAIL_CHANGE:
      return await tx.authorizedPersonnel.update({
        where: { id: targetId },
        data: { email: payload.newEmail },
      });

    default:
      throw new Error(`Execution logic for ${action} not implemented in Engine.`);
  }
}