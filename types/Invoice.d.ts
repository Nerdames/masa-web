import type { Order } from "./order";
import type { AuthorizedPersonnel } from "./personnel";
import type { InvoiceStatus } from "./enums";

/* ---------------------------------------------
 * Invoice
 * ------------------------------------------- */
export interface Invoice {
  id: string;
  orderId: string;

  total: number;
  paidAmount: number;
  currency: string;
  discount?: number | null;
  tax?: number | null;
  status: InvoiceStatus;

  issuedAt: string;
  paidAt?: string | null;
  closedAt?: string | null;
  voidedAt?: string | null;
  deletedAt?: string | null;

  paidById?: string | null;

  createdAt: string;
  updatedAt: string;

  /* ---------------------------------------------
   * Relations
   * ------------------------------------------- */
  order: Order;
  paidBy?: AuthorizedPersonnel | null;
}
