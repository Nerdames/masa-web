import type { Product } from "./product";
import type { BranchProduct } from "./product";
import type { Order } from "./order";

/* ---------------------------------------------
 * OrderItem
 * ------------------------------------------- */
export interface OrderItem {
  id: string;
  orderId: string;
  branchProductId: string;
  productId: string;
  quantity: number;
  price: number;
  total: number;

  // New Prisma fields
  discount?: number | null;
  tax?: number | null;

  // Relations
  order: Order;
  branchProduct: BranchProduct;
  product: Product;
}
