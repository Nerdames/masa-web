"use server";

import prisma from "@/core/lib/prisma"; // Adjust path to your prisma client
import { POStatus, Severity, ActorType, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

/**
 * FETCH: Purchase Orders with full relations
 */
export async function getPurchaseOrders(branchId: string) {
  try {
    return await prisma.purchaseOrder.findMany({
      where: { 
        branchId, 
        deletedAt: null 
      },
      include: {
        vendor: { select: { id: true, name: true, email: true } },
        createdBy: { select: { name: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    console.error("[GET_PO_ERROR]:", error);
    throw new Error("Failed to retrieve purchase orders");
  }
}

/**
 * TRANSACTIONAL CREATE: PO + Items + Forensic Audit
 */
export async function createPurchaseOrder(
  data: {
    organizationId: string;
    branchId: string;
    vendorId: string;
    expectedDate?: string;
    notes?: string;
    items: { productId: string; quantityOrdered: number; unitCost: number }[];
  },
  actorId: string,
  role: Role
) {
  return await prisma.$transaction(async (tx) => {
    // 1. Calculate Total Commitment
    const totalAmount = data.items.reduce(
      (acc, item) => acc + (item.quantityOrdered * item.unitCost), 0
    );

    // 2. Create the Purchase Order + Items
    const po = await tx.purchaseOrder.create({
      data: {
        organizationId: data.organizationId,
        branchId: data.branchId,
        vendorId: data.vendorId,
        poNumber: `PO-${Date.now().toString().slice(-6)}`,
        status: POStatus.ISSUED,
        totalAmount,
        expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
        notes: data.notes,
        createdById: actorId,
        items: {
          create: data.items.map((item) => ({
            productId: item.productId,
            quantityOrdered: item.quantityOrdered,
            unitCost: item.unitCost,
            totalCost: item.quantityOrdered * item.unitCost,
          })),
        },
      },
      include: { vendor: true }
    });

    // 3. Forensic Activity Log (Immutable Record)
    await tx.activityLog.create({
      data: {
        organizationId: po.organizationId,
        branchId: po.branchId,
        actorId,
        actorType: ActorType.USER,
        actorRole: role,
        action: "PURCHASE_ORDER_ISSUED",
        description: `PO ${po.poNumber} issued to ${po.vendor.name} for ₦${totalAmount.toLocaleString()}`,
        severity: Severity.MEDIUM,
        targetId: po.id,
        targetType: "PURCHASE_ORDER",
        after: JSON.parse(JSON.stringify(po)), // Snapshot
      },
    });

    revalidatePath("/inventory/purchase-orders");
    return po;
  });
}

/**
 * FETCH: Recent PO-related Audit Logs
 */
export async function getPurchaseOrderLedger(branchId: string) {
  return await prisma.activityLog.findMany({
    where: { 
      branchId, 
      targetType: "PURCHASE_ORDER" 
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}