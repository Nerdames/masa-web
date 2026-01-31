// types/receipt.d.ts

import type { Sale } from "./sale";
import type { Invoice } from "./invoice";
import type { AuthorizedPersonnel } from "./personnel";
import type { Branch } from "./domain";
import type { BranchProduct } from "./product";
import type { Organization } from "./organization";
import type { PaymentMethod } from "./enums";

/* ---------------------------------------------
 * Receipt
 * Mirrors Prisma Receipt model
 * ------------------------------------------- */
export interface Receipt {
  id: string;
  saleId: string;
  cashierId: string;
  branchId: string;
  branchProductId: string;
  organizationId: string;
  invoiceId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  currency: string;
  createdAt: Date;

  /* ---------------------------------------------
   * Relations (optional — Prisma include-based)
   * ------------------------------------------- */
  sale?: Sale;
  invoice?: Invoice;
  cashier?: AuthorizedPersonnel;
  branch?: Branch;
  branchProduct?: BranchProduct;
  organization?: Organization;
}
