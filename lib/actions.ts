import { CriticalAction, Prisma } from "@prisma/client";

export type ActionPayload = Record<string, unknown>;

/**
 * Executes high-privilege operations within a Prisma transaction.
 * Strictly typed to avoid 'any' and ensures audit trail creation.
 */
export async function applyActionDirectly(
  tx: Prisma.TransactionClient,
  action: CriticalAction,
  targetId: string,
  changes: ActionPayload,
  actorId: string,
  organizationId: string,
  branchId: string
) {
  let result;

  // 1. Execute the Core Operation
  switch (action) {
    case "USER_LOCK_UNLOCK":
      result = await tx.authorizedPersonnel.update({
        where: { id: targetId },
        data: { 
          isLocked: Boolean(changes.isLocked), 
          lockReason: String(changes.lockReason || "No reason provided") 
        }
      });
      break;

    case "EMAIL_CHANGE":
      result = await tx.authorizedPersonnel.update({
        where: { id: targetId },
        data: { email: String(changes.newEmail) }
      });
      break;

    case "PRICE_UPDATE":
      result = await tx.branchProduct.update({
        where: { id: targetId },
        data: { sellingPrice: Number(changes.newPrice) }
      });
      break;

    case "STOCK_ADJUST":
      const qty = Number(changes.quantity);
      const cost = Number(changes.unitCost);
      result = await tx.stockMovement.create({
        data: {
          branchProductId: targetId,
          quantity: qty,
          type: "ADJUST",
          reason: String(changes.reason || "Manual Adjustment"),
          unitCost: cost,
          totalCost: qty * cost,
          organizationId,
          branchId,
          handledById: actorId
        }
      });
      break;

    case "VOID_INVOICE":
      result = await tx.invoice.update({
        where: { id: targetId },
        data: { status: "VOIDED" }
      });
      break;

    default:
      throw new Error(`Unmapped critical action: ${action}`);
  }

  // 2. Automatic Audit Logging
  await tx.activityLog.create({
    data: {
      organizationId,
      branchId,
      personnelId: actorId,
      action: `EXECUTE_${action}`,
      critical: true,
      metadata: {
        targetId,
        changes: changes as Prisma.InputJsonValue,
        timestamp: new Date().toISOString()
      }
    }
  });

  return result;
}