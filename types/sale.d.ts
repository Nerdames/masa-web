import type { Customer } from "./customer";
import type { BranchProduct, Product } from "./product";
import type { AuthorizedPersonnel } from "./personnel";
import type { Invoice } from "./invoice";
import type { Organization } from "./organization";
import type { Branch } from "./branch";
import type { Receipt } from "./receipt";
import type { SaleStatus } from "./enums";

/* ---------------------------------------------
 * Sale
 * Mirrors Prisma Sale model (STRICT)
 * ------------------------------------------- */
export interface Sale {
  id: string;

  organizationId: string;
  branchId: string;
  invoiceId: string;
  branchProductId: string;
  productId: string;

  quantity: number;
  unitPrice: number;
  total: number;
  currency: string;
  status: SaleStatus;

  cashierId: string;
  customerId?: string | null;

  deletedAt?: Date | null;
  createdAt: Date;

  /* ---------------------------------------------
   * Relations (optional when not included)
   * ------------------------------------------- */
  organization?: Organization;
  branch?: Branch;
  invoice?: Invoice;
  branchProduct?: BranchProduct;
  product?: Product;

  cashier?: AuthorizedPersonnel;
  customer?: Customer | null;
  receipts?: Receipt[];
}
