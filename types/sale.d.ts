import type { Customer } from "./customer";
import type { BranchProduct, Product } from "./product";
import type { AuthorizedPersonnel } from "./personnel";
import type { Order } from "./order";
import type { Invoice } from "./invoice";
import type { Organization } from "./organization";

/* ---------------------------------------------
 * Sale
 * ------------------------------------------- */
export interface Sale {
  id: string;
  organizationId: string;
  branchProductId: string;
  productId: string;
  orderId?: string | null;
  invoiceId?: string | null;
  quantity: number;
  total: number;
  currency: string;
  createdAt: string;

  // Optional fields
  attendantId?: string | null;
  customerId?: string | null;
  paymentType?: "CASH" | "TRANSFER" | "OTHER" | null;
  discount?: number | null;
  tax?: number | null;

  /* ---------------------------------------------
   * Relations
   * ------------------------------------------- */
  organization: Organization;
  branchProduct: BranchProduct;
  product: Product;

  attendant?: AuthorizedPersonnel | null;
  customer?: Customer | null;
  order?: Order | null;
  invoice?: Invoice | null;
}
