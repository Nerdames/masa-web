import type { Order } from "./order";

/* ---------------------------------------------
 * Invoice
 * ------------------------------------------- */
export interface Invoice {
  id: string;
  orderId: string;
  total: number;
  paid: boolean;
  currency: string;
  createdAt: string;

  // New Prisma fields
  discount?: number | null;
  tax?: number | null;

  // Relations
  order: Order;
}
