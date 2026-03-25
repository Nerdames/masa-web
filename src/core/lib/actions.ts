import { Prisma, CriticalAction } from "@prisma/client";

/**
 * --- CRITICAL ACTION EXECUTION ENGINE ---
 * This function executes the actual business logic for a critical action.
 * It is wrapped in a transaction by the caller (API route).
 */
export async function applyActionDirectly(
  tx: Prisma.TransactionClient,
  action: string,
  targetId: string,
  meta: Record<string, any>,
  requesterId: string,
  organizationId: string,
  branchId: string | null
) {
  // Convert string action to Enum for type safety
  const actionEnum = action as CriticalAction;

  switch (actionEnum) {
    case CriticalAction.USER_LOCK_UNLOCK:
      return await tx.authorizedPersonnel.update({
        where: { id: targetId || meta.targetId },
        data: { 
          isLocked: meta.lock ?? true,
          lockReason: meta.reason || "Administrative action"
        },
      });

    case CriticalAction.PRICE_UPDATE:
      return await tx.branchProduct.update({
        where: { id: meta.branchProductId },
        data: { sellingPrice: new Prisma.Decimal(meta.newPrice) },
      });

    case CriticalAction.STOCK_ADJUST:
      return await tx.branchProduct.update({
        where: { id: meta.branchProductId },
        data: { 
          stock: { increment: meta.adjustmentAmount } 
        },
      });

    case CriticalAction.STOCK_TRANSFER:
      // Example logic for stock transfer
      return await tx.stockMovement.create({
        data: {
          organizationId,
          branchId: branchId!,
          productId: meta.productId,
          quantity: meta.quantity,
          type: "TRANSFER",
          note: `Transfer to ${meta.destinationBranchId}`,
          personnelId: requesterId,
        },
      });

    case CriticalAction.VOID_INVOICE:
      return await tx.invoice.update({
        where: { id: meta.invoiceId },
        data: { 
          status: "VOIDED",
        },
      });

    case CriticalAction.EMAIL_CHANGE:
    case CriticalAction.PASSWORD_CHANGE:
      return await tx.authorizedPersonnel.update({
        where: { id: targetId },
        data: { 
          email: meta.newEmail,
          password: meta.hashedPassword // Ensure hashing happens before calling this
        },
      });

    default:
      // Fallback for custom actions not in the CriticalAction enum
      console.warn(`Action ${action} executed without specific logic.`);
      return { status: "logged_only" };
  }
}