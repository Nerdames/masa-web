import type { Order } from "./order";
import type { AuthorizedPersonnel } from "./personnel";
import type { Branch, Organization } from "./domain";
import type { Customer } from "./customer";
import type { InvoiceStatus } from "./enums";
import type { Payment } from "./payment";
import type { Sale } from "./sale";
import type { Receipt } from "./receipt";

/* ---------------------------------------------
 * Invoice
 * Mirrors Prisma Invoice model
 * ------------------------------------------- */
export interface Invoice {
  id: string;
  organizationId: string;
  branchId: string;
  orderId: string;
  issuedById: string;
  customerId?: string | null;

  total: number;
  paidAmount: number;   // Prisma Float @default(0)
  balance: number;
  currency: string;
  status: InvoiceStatus;
  deletedAt?: Date | null;

  issuedAt: Date;
  dueDate?: Date | null;

  createdAt: Date;
  updatedAt: Date;

  /* ---------------------------------------------
   * Relations (optional — Prisma include-based)
   * ------------------------------------------- */
  order?: Order;
  issuedBy?: AuthorizedPersonnel;
  customer?: Customer | null;
  organization?: Organization;
  branch?: Branch;

  payments?: Payment[];
  sales?: Sale[];
  receipts?: Receipt[];
}
