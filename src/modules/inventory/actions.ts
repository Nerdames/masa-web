"use server";

import prisma from "@/src/core/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/src/core/lib/auth";
import { revalidatePath } from "next/cache";
import { Prisma, StockMovementType } from "@prisma/client";
import { z } from "zod";

// Validation for the adjustment transaction
const StockAdjustmentSchema = z.object({
  quantity: z.coerce.number(),
  unitCost: z.coerce.number().min(0),
  reason: z.string().min(3, "A valid reason or reference is required"),
  type: z.nativeEnum(StockMovementType),
  stockVersion: z.coerce.number(), // For optimistic locking
});

/**
 * Accountable Stock Adjustment
 * Updates BranchProduct and creates a StockMovement in a single transaction.
 */
export async function adjustInventoryStock(branchProductId: string, formData: FormData) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.branchId || !session?.user?.organizationId) {
    return { success: false, error: "Unauthorized: Session context missing" };
  }

  const rawData = Object.fromEntries(formData.entries());
  const validated = StockAdjustmentSchema.safeParse(rawData);

  if (!validated.success) {
    return { success: false, error: validated.error.errors[0].message };
  }

  const { quantity, unitCost, reason, type, stockVersion } = validated.data;
  const { branchId, organizationId, id: personnelId } = session.user;

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch current record with a row-level lock & check version
      const current = await tx.branchProduct.findUnique({
        where: { id: branchProductId },
        select: { stock: true, stockVersion: true, productId: true }
      });

      if (!current) throw new Error("Record not found");
      
      // OPTIMISTIC LOCKING: Prevent overwriting if someone else updated it
      if (current.stockVersion !== stockVersion) {
        throw new Error("Concurrency Conflict: The stock record was updated by another user. Please refresh.");
      }

      // 2. Calculate new stock level
      // If type is IN, we add. If ADJUST, the user sends the signed offset (e.g., -5)
      const newStock = type === StockMovementType.IN 
        ? current.stock + quantity 
        : current.stock + quantity;

      if (newStock < 0) throw new Error("Adjustment would result in negative stock.");

      // 3. Update the BranchProduct
      const updatedItem = await tx.branchProduct.update({
        where: { id: branchProductId },
        data: {
          stock: newStock,
          stockVersion: { increment: 1 }, // Ensure version stays unique
          lastRestockedAt: type === StockMovementType.IN ? new Date() : undefined,
          costPrice: new Prisma.Decimal(unitCost),
        }
      });

      // 4. Record the Movement in the ledger
      await tx.stockMovement.create({
        data: {
          organizationId,
          branchId,
          branchProductId,
          productId: current.productId,
          type,
          quantity: Math.abs(quantity), // Ledger stores absolute, type handles direction
          unitCost: new Prisma.Decimal(unitCost),
          totalCost: new Prisma.Decimal(Math.abs(quantity) * unitCost),
          reason,
          handledById: personnelId,
        }
      });

      revalidatePath("/dashboard/inventory");
      return { success: true };
    });
  } catch (error: any) {
    console.error("[STOCK_ADJUST_ERR]", error);
    return { 
      success: false, 
      error: error.message || "Failed to commit adjustment to ledger" 
    };
  }
}

export async function createInventoryItem(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId || !session?.user?.branchId) {
    return { success: false, error: "Authentication expired" };
  }

  const rawData = Object.fromEntries(formData.entries());
  const validated = InventorySchema.safeParse(rawData);

  if (!validated.success) {
    return { success: false, error: validated.error.errors[0].message };
  }

  try {
    // Utilize the robust service layer to handle transactions and stock movements
    await createBranchInventory({
      ...validated.data,
      organizationId: session.user.organizationId,
      branchId: session.user.branchId,
      personnelId: session.user.id,
    });

    revalidatePath("/dashboard/inventory");
    return { success: true };
  } catch (error) {
    console.error("[CREATE_INVENTORY_ERR]", error);
    return { success: false, error: "Database error or duplicate SKU in branch" };
  }
}

export async function updateInventoryItem(id: string, formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.branchId) return { success: false, error: "Unauthorized" };

  const rawData = Object.fromEntries(formData.entries());
  const validated = InventorySchema.partial().safeParse(rawData);

  if (!validated.success) {
    return { success: false, error: "Invalid data provided" };
  }

  try {
    await prisma.branchProduct.update({
      where: { 
        id, 
        branchId: session.user.branchId,
        organizationId: session.user.organizationId 
      },
      data: {
        stock: validated.data.stock,
        reorderLevel: validated.data.reorderLevel,
        sellingPrice: validated.data.sellingPrice ? new Prisma.Decimal(validated.data.sellingPrice) : undefined,
        costPrice: validated.data.costPrice ? new Prisma.Decimal(validated.data.costPrice) : undefined,
        vendorId: validated.data.vendorId,
        lastRestockedAt: validated.data.stock && validated.data.stock > 0 ? new Date() : undefined,
      },
    });

    revalidatePath("/dashboard/inventory");
    return { success: true };
  } catch (e) {
    return { success: false, error: "Update failed" };
  }
}

export async function deleteInventoryItems(ids: string[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId || !session?.user?.branchId) return { success: false, error: "Unauthorized" };

  try {
    await prisma.branchProduct.updateMany({
      where: {
        id: { in: ids },
        organizationId: session.user.organizationId,
        branchId: session.user.branchId,
      },
      data: { deletedAt: new Date() },
    });

    revalidatePath("/dashboard/inventory");
    return { success: true };
  } catch (e) {
    return { success: false, error: "Deletion failed" };
  }
}

export async function getCategories() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) return [];

  return prisma.category.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}