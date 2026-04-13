import { z } from "zod";

export const PurchaseOrderItemSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  quantityOrdered: z.number().int().positive("Quantity must be at least 1"),
  unitCost: z.number().positive("Unit cost must be greater than 0"),
});

export const CreatePurchaseOrderSchema = z.object({
  organizationId: z.string(),
  branchId: z.string(),
  vendorId: z.string(),
  expectedDate: z.string().optional().nullable(),
  notes: z.string().optional(),
  items: z.array(PurchaseOrderItemSchema).min(1, "At least one item is required"),
});