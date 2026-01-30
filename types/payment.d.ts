import type { Invoice } from "./invoice";
import type { AuthorizedPersonnel } from "./personnel";
import type { BranchProduct } from "./product";
import type { Branch } from "./domain";
import type { Organization } from "./organization";
import type { Sale } from "./sale";
import type { PaymentMethod, PaymentStatus } from "./enums";

/* ---------------------------------------------
 * Payment
 * Mirrors Prisma Payment model
 * ------------------------------------------- */
export interface Payment {
  id: string;
  invoiceId: string;
  cashierId: string;

  method: PaymentMethod;
  amount: number;
  currency: string;
  status: PaymentStatus;

  reference?: string | null;
  receivedAt: Date;
  deletedAt?: Date | null;

  /* ---------------------------------------------
   * Relations (optional – Prisma include-based)
   * ------------------------------------------- */
  invoice?: Invoice;
  cashier?: AuthorizedPersonnel;
}
