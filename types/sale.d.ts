import type { Customer } from "./customer";
import type { BranchProduct, Product } from "./product";
import type { AuthorizedPersonnel } from "./personnel";
import type { Order } from "./order";
import type { Invoice } from "./invoice";
import type { Organization } from "./organization";
import type { PaymentMethod } from "./enums";

/* ---------------------------------------------
 * Sale
 * Mirrors Prisma Sale model
 * ------------------------------------------- */
export interface Sale {
  id: string;
  organizationId: string;
  branchProductId: string;
  productId: string;
  orderId?: string | null;
  invoiceId?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  currency: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  createdAt: Date;

  // Optional fields from Prisma
  attendantId?: string | null;
  customerId?: string | null;
  discount?: number | null;
  tax?: number | null;

  paymentType?: PaymentMethod | null;

  /* ---------------------------------------------
   * Relations (optional)
   * ------------------------------------------- */
  organization?: Organization;
  branchProduct?: BranchProduct;
  product?: Product;

  attendant?: AuthorizedPersonnel | null;
  customer?: Customer | null;
  order?: Order | null;
  invoice?: Invoice | null;
}
