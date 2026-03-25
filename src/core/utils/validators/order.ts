import { z } from "zod";
import { OrderStatus } from "@prisma/client";

/* -----------------------------
   Query: GET /dashboard/orders
------------------------------ */
export const OrderListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
    search: z.string().trim().min(1).optional(),
    status: z.nativeEnum(OrderStatus).optional(),

    // Optional date filter (YYYY-MM-DD)
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .optional(),
  })
  .strict();

/* -----------------------------
   POST: Create order
------------------------------ */
export const OrderItemSchema = z
  .object({
    branchProductId: z.string().cuid(),
    quantity: z.number().int().positive(),
  })
  .strict();

export const OrderCreateSchema = z
  .object({
    customerId: z.string().cuid().optional(),
    items: z.array(OrderItemSchema).min(1),
    paidAmount: z.number().min(0).optional(),
  })
  .strict();

/* -----------------------------
   PATCH: Update order
------------------------------ */
export const OrderUpdateSchema = z
  .object({
    id: z.string().cuid(),
    paidAmount: z.number().min(0).optional(),
    status: z.nativeEnum(OrderStatus).optional(),
  })
  .strict();

/* -----------------------------
   Inferred Types (USE THESE)
------------------------------ */
export type OrderListQuery = z.infer<typeof OrderListQuerySchema>;
export type OrderCreateInput = z.infer<typeof OrderCreateSchema>;
export type OrderUpdateInput = z.infer<typeof OrderUpdateSchema>;
