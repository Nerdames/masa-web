import { Prisma, CriticalAction } from "@prisma/client";

/**
 * ActionPayload defines the shape of data required for various critical actions.
 * Fortified with expectedVersion for Optimistic Locking.
 */
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
 * Optimized for production with optimistic locking and atomic integrity.
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
        where: { id: targetId, organizationId },
        data: { 
          isLocked: payload.lock ?? true,
          lockReason: payload.reason || "Administrative action",
        },
      });

    case CriticalAction.EMAIL_CHANGE:
      if (!payload.newEmail) throw new Error("New email is required for EMAIL_CHANGE");
      return await tx.authorizedPersonnel.update({
        where: { id: targetId, organizationId },
        data: { email: payload.newEmail },
      });

    case CriticalAction.PASSWORD_CHANGE:
      if (!payload.hashedPassword) throw new Error("Hashed password is required for PASSWORD_CHANGE");
      return await tx.authorizedPersonnel.update({
        where: { id: targetId, organizationId },
        data: { 
          password: payload.hashedPassword,
          requiresPasswordChange: false 
        },
      });

    case CriticalAction.PRICE_UPDATE:
      if (!payload.branchProductId || payload.newPrice === undefined) {
        throw new Error("BranchProductId and newPrice are required for PRICE_UPDATE");
      }
      return await tx.branchProduct.update({
        // Optimistic Lock: Update only if version matches to prevent race conditions
        where: { 
          id: payload.branchProductId,
          organizationId,
          ...(payload.expectedVersion && { stockVersion: payload.expectedVersion })
        },
        data: { 
          sellingPrice: new Prisma.Decimal(payload.newPrice),
          stockVersion: { increment: 1 } 
        },
      });

    case CriticalAction.STOCK_ADJUST:
      if (!payload.branchProductId || payload.adjustmentAmount === undefined) {
        throw new Error("BranchProductId and adjustmentAmount are required for STOCK_ADJUST");
      }
      return await tx.branchProduct.update({
        where: { 
          id: payload.branchProductId,
          organizationId,
          ...(payload.expectedVersion && { stockVersion: payload.expectedVersion })
        },
        data: { 
          stock: { increment: payload.adjustmentAmount },
          stockVersion: { increment: 1 }
        },
      });

    case CriticalAction.STOCK_TRANSFER:
      if (!payload.productId || !payload.quantity || !payload.destinationBranchId || !branchId) {
        throw new Error("Insufficient data for STOCK_TRANSFER");
      }
      // Atomic Transfer: Decrease source stock and ensure it doesn't go below zero
      const source = await tx.branchProduct.update({
        where: { 
          productId_branchId: { productId: payload.productId, branchId: branchId },
          stock: { gte: payload.quantity } 
        },
        data: { stock: { decrement: payload.quantity } }
      });

      // Upsert into destination branch
      await tx.branchProduct.upsert({
        where: { 
          productId_branchId: { 
            productId: payload.productId, 
            branchId: payload.destinationBranchId 
          } 
        },
        create: {
          organizationId,
          branchId: payload.destinationBranchId,
          productId: payload.productId,
          stock: payload.quantity,
          sellingPrice: source.sellingPrice,
        },
        update: { stock: { increment: payload.quantity } }
      });

      // Audit Trail: Create a StockMovement record 
      return await tx.stockMovement.create({
        data: {
          organizationId,
          branchId: branchId,
          branchProductId: source.id,
          productId: payload.productId,
          quantity: payload.quantity,
          type: "TRANSFER",
          note: `Transfer to branch ${payload.destinationBranchId}. ${payload.reason || ""}`,
          handledById: requesterId,
        },
      });

    case CriticalAction.VOID_INVOICE:
      const invoiceId = targetId || payload.invoiceId;
      if (!invoiceId) throw new Error("InvoiceId is required for VOID_INVOICE");
      return await tx.invoice.update({
        where: { 
          id: invoiceId, 
          organizationId,
          status: { not: "VOIDED" } 
        },
        data: { status: "VOIDED" },
      });

    case CriticalAction.EXPENSE_VOIDING:
      return await tx.expense.update({
        where: { 
          id: targetId, 
          organizationId,
          status: { not: "VOIDED" } 
        },
        data: { status: "VOIDED" },
      });

    default:
      throw new Error(`Execution logic for ${action} not implemented in Engine.`);
  }
}