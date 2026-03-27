"use server";

import prisma from "@/lib/prisma"; // Updated path based on your auth file
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { Prisma, StockMovementType, POStatus, OrderStatus, InvoiceStatus, SaleStatus } from "@prisma/client";
import { z } from "zod";
import { spawnSync } from "child_process";

const UnifiedFlowSchema = z.object({
  vendorId: z.string(),
  productId: z.string(),
  branchProductId: z.string(), // Required for relations
  quantity: z.coerce.number().min(1),
  costPrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  customerId: z.string(),
});

/**
 * Invokes the Python Fortress Engine
 */
async function generateAuditHash(previousHash: string, payload: any): Promise<string> {
  const input = JSON.stringify({ previousHash, payload });
  const process = spawnSync("python3", ["src/core/engines/fortress_engine.py"], {
    input,
    encoding: "utf-8",
  });

  if (process.error) throw new Error("Fortress Engine unreachable");
  const result = JSON.parse(process.stdout);
  if (result.error) throw new Error(result.error);
  return result.hash;
}

/**
 * PRODUCTION UNIFIED MODULE: PO -> Inventory IN -> Order -> Invoice -> Sale -> Inventory OUT
 */
export async function processUnifiedProcurement(formData: FormData) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.branchId || !session?.user?.organizationId) {
    return { success: false, error: "Unauthorized: Missing session context" };
  }

  const rawData = Object.fromEntries(formData.entries());
  const validated = UnifiedFlowSchema.safeParse(rawData);
  
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0].message };
  }

  const { vendorId, productId, branchProductId, quantity, costPrice, sellingPrice, customerId } = validated.data;
  const { branchId, organizationId, id: personnelId } = session.user;

  try {
    return await prisma.$transaction(async (tx) => {
      const timestamp = Date.now();
      const totalCostAmount = new Prisma.Decimal(quantity * costPrice);
      const totalSaleAmount = new Prisma.Decimal(quantity * sellingPrice);

      // --- 1. PROCUREMENT ---
      const po = await tx.purchaseOrder.create({
        data: {
          organizationId,
          branchId,
          vendorId,
          [span_4](start_span)poNumber: `PO-${timestamp}`, // Required by schema[span_4](end_span)
          status: POStatus.FULFILLED, // Fulfilling immediately
          totalAmount: totalCostAmount,
          [span_5](start_span)createdById: personnelId, // Required personnel link[span_5](end_span)
          items: {
            create: {
              productId,
              quantityOrdered: quantity,
              quantityReceived: quantity,
              unitCost: new Prisma.Decimal(costPrice),
              totalCost: totalCostAmount,
            [span_6](start_span)} // Matches PurchaseOrderItem[span_6](end_span)
          }
        }
      });

      // --- 2. INVENTORY UPDATE ---
      const currentProduct = await tx.branchProduct.findUnique({
        where: { id: branchProductId },
        select: { stock: true }
      });

      if (!currentProduct) throw new Error("Branch product not found.");

      const runningBalanceIn = currentProduct.stock + quantity;
      
      const updatedProduct = await tx.branchProduct.update({
        where: { id: branchProductId },
        data: {
          stock: runningBalanceIn - quantity, // It comes in and immediately goes out
          stockVersion: { increment: 1 },
          lastRestockedAt: new Date(),
          [span_7](start_span)lastSoldAt: new Date(), //[span_7](end_span)
          costPrice: new Prisma.Decimal(costPrice),
          sellingPrice: new Prisma.Decimal(sellingPrice),
        }
      });

      // --- 3. FORTRESS HASHING & STOCK MOVEMENT (IN) ---
      const lastMovement = await tx.stockMovement.findFirst({
        where: { branchId },
        orderBy: { createdAt: 'desc' }
      });

      const hashIn = await generateAuditHash(lastMovement?.hash || "ROOT", {
        action: "AUTO_PROCURE_IN", poId: po.id, qty: quantity
      });

      await tx.stockMovement.create({
        data: {
          organizationId, branchId, branchProductId, productId,
          [span_8](start_span)type: StockMovementType.IN, //[span_8](end_span)
          quantity,
          unitCost: new Prisma.Decimal(costPrice),
          totalCost: totalCostAmount,
          [span_9](start_span)runningBalance: runningBalanceIn, // Required field[span_9](end_span)
          reason: `Auto-procured from Vendor for immediate fulfillment`,
          previousHash: lastMovement?.hash || [span_10](start_span)"ROOT", //[span_10](end_span)
          hash: hashIn,
          handledById: personnelId,
        }
      });

      // --- 4. SALES PIPELINE (Order -> Invoice -> Sale) ---
      const order = await tx.order.create({
        data: {
          organizationId, branchId, customerId,
          [span_11](start_span)salespersonId: personnelId, //[span_11](end_span)
          orderNumber: `ORD-${timestamp}`,
          status: OrderStatus.FULFILLED,
          total: totalSaleAmount,
          items: {
            create: {
              branchProductId, productId, quantity,
              unitPrice: new Prisma.Decimal(sellingPrice),
              total: totalSaleAmount
            [span_12](start_span)} //[span_12](end_span)
          }
        }
      });

      const invoice = await tx.invoice.create({
        data: {
          organizationId, branchId, customerId,
          [span_13](start_span)[span_14](start_span)orderId: order.id, // Mandatory 1:1 relation[span_13](end_span)[span_14](end_span)
          invoiceNumber: `INV-${timestamp}`,
          [span_15](start_span)issuedById: personnelId, //[span_15](end_span)
          subtotal: totalSaleAmount,
          total: totalSaleAmount,
          balance: new Prisma.Decimal(0), // Fully paid assumption for this module
          status: InvoiceStatus.ISSUED,
        }
      });

      const sale = await tx.sale.create({
        data: {
          organizationId, branchId, invoiceId: invoice.id, branchProductId, productId,
          [span_16](start_span)cashierId: personnelId, customerId, //[span_16](end_span)
          quantity,
          unitPrice: new Prisma.Decimal(sellingPrice),
          total: totalSaleAmount,
          status: SaleStatus.COMPLETED,
        }
      });

      // --- 5. FORTRESS HASHING & STOCK MOVEMENT (OUT) ---
      const hashOut = await generateAuditHash(hashIn, {
        action: "AUTO_SALE_OUT", saleId: sale.id, qty: quantity
      });

      await tx.stockMovement.create({
        data: {
          organizationId, branchId, branchProductId, productId,
          type: StockMovementType.OUT,
          quantity,
          unitCost: new Prisma.Decimal(costPrice), // Logged at cost for margin tracking
          totalCost: totalCostAmount,
          runningBalance: runningBalanceIn - quantity,
          reason: `Auto-fulfillment for Sale #${sale.id}`,
          previousHash: hashIn,
          hash: hashOut,
          handledById: personnelId,
          [span_17](start_span)[span_18](start_span)saleId: sale.id, // Traceability link[span_17](end_span)[span_18](end_span)
        }
      });

      revalidatePath("/dashboard/inventory");
      return { success: true, invoiceId: invoice.id };
    });
  } catch (error: any) {
    console.error("[UNIFIED_PROCUREMENT_ERROR]", error);
    return { success: false, error: error.message || "Failed to execute chain." };
  }
}
