"use server";

import prisma from "@/core/lib/prisma";
import { POStatus, Severity, ActorType, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// --- VALIDATION SCHEMAS ---
const PurchaseOrderItemSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  quantityOrdered: z.number().int().positive("Quantity must be at least 1"),
  unitCost: z.number().positive("Unit cost must be greater than 0"),
});

export const CreatePurchaseOrderSchema = z.object({
  organizationId: z.string(),
  branchId: z.string(),
  vendorId: z.string().min(1, "Vendor selection required"),
  expectedDate: z.string().optional().nullable(),
  notes: z.string().optional(),
  items: z.array(PurchaseOrderItemSchema).min(1, "At least one item is required"),
});

// --- UTILITIES ---
const generatePONumber = () => `PO-${Date.now().toString().slice(-6).toUpperCase()}`;
const d2n = (val: any) => Number(val?.toString() || 0);

// --- FETCH ACTIONS ---
export async function getPurchaseOrdersData(branchId: string, organizationId: string) {
  try {
    const [pos, logs, vendors, products] = await Promise.all([
      // 1. Purchase Orders
      prisma.purchaseOrder.findMany({
        where: { branchId, deletedAt: null },
        include: {
          vendor: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true } },
          items: {
            include: { product: { select: { id: true, name: true, sku: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      // 2. Forensic Ledger (PO Related)
      prisma.activityLog.findMany({
        where: { branchId, targetType: "PURCHASE_ORDER" },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      // 3. Active Vendors for this Organization
      prisma.vendor.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
      // 4. Branch Products for line item selection
      prisma.branchProduct.findMany({
        where: { branchId, deletedAt: null },
        include: { product: { select: { id: true, name: true, sku: true } } },
        orderBy: { product: { name: "asc" } }
      })
    ]);

    // Serialize Decimals for Client
    const serializedPOs = pos.map((po) => ({
      ...po,
      totalAmount: d2n(po.totalAmount),
      items: po.items.map((item) => ({
        ...item,
        unitCost: d2n(item.unitCost),
        totalCost: d2n(item.totalCost),
      })),
    }));

    return { 
      orders: serializedPOs, 
      ledger: logs, 
      vendors, 
      products: products.map(bp => ({ id: bp.product.id, name: bp.product.name, sku: bp.product.sku, costPrice: d2n(bp.costPrice) })) 
    };
  } catch (error) {
    console.error("[GET_PO_DATA_ERROR]:", error);
    throw new Error("Failed to retrieve workspace data");
  }
}

// --- MUTATION ACTIONS ---
export async function createPurchaseOrder(formData: any, actorId: string, role: Role) {
  const validated = CreatePurchaseOrderSchema.safeParse(formData);
  if (!validated.success) throw new Error(`Validation Failed: ${validated.error.message}`);

  const { organizationId, branchId, vendorId, items, expectedDate, notes } = validated.data;

  return await prisma.$transaction(async (tx) => {
    const totalAmount = items.reduce((acc, item) => acc + (item.quantityOrdered * item.unitCost), 0);

    const po = await tx.purchaseOrder.create({
      data: {
        organizationId,
        branchId,
        vendorId,
        poNumber: generatePONumber(),
        status: POStatus.ISSUED, // Standard initial status
        totalAmount,
        currency: "NGN",
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        notes,
        createdById: actorId,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantityOrdered: item.quantityOrdered,
            unitCost: item.unitCost,
            totalCost: item.quantityOrdered * item.unitCost,
          })),
        },
      },
      include: { vendor: true }
    });

    // Forensic Logging [cite: 3169, 3178]
    await tx.activityLog.create({
      data: {
        organizationId,
        branchId,
        actorId,
        actorType: ActorType.USER,
        actorRole: role,
        action: "PURCHASE_ORDER_ISSUED",
        description: `PO ${po.poNumber} issued to ${po.vendor.name}. Total Commitment: ₦${totalAmount.toLocaleString()}`,
        severity: Severity.LOW,
        targetId: po.id,
        targetType: "PURCHASE_ORDER",
        after: JSON.parse(JSON.stringify(po)), 
      },
    });

    revalidatePath("/inventory/purchase-orders");
    return po;
  });
}