import type { Customer } from "./customer";
import type { BranchProduct, Product } from "./product";
import type { AuthorizedPersonnel } from "./personnel";

/* ---------------------------------------------
 * Sale
 * ------------------------------------------- */
export interface Sale {
  id: string;
  organizationId: string;
  branchProductId: string;
  productId: string;
  quantity: number;
  total: number;
  currency: string;
  createdAt: string;

  // Relations
  branchProduct: BranchProduct;
  product: Product;

  attendantId?: string | null;   // optional foreign key
  attendant?: AuthorizedPersonnel | null;

  customerId?: string | null;    // optional foreign key
  customer?: Customer | null;

  paymentType?: "CASH" | "TRANSFER" | "OTHER" | null;
  discount?: number | null;
  tax?: number | null;
}
