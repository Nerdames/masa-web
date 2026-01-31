// types/order.d.ts

import type { Branch } from "./domain";
import type { Customer } from "./customer";
import type { AuthorizedPersonnel } from "./personnel";
import type { Invoice } from "./invoice";
import type { Organization } from "./organization";
import type { BranchProduct, Product } from "./product";
import type { OrderStatus } from "./enums";

/* ---------------------------------------------
 * OrderItem
 * Mirrors Prisma OrderItem model
 * ------------------------------------------- */
export interface OrderItem {
  id: string;
  orderId: string;
  branchProductId: string;
  productId: string;

  quantity: number;
  unitPrice: number;
  total: number;

  discount?: number | null;
  tax?: number | null;

  /* ---------------------------------------------
   * Relations (optional — Prisma include-based)
   * ------------------------------------------- */
  order?: Order;
  branchProduct?: BranchProduct;
  product?: Product;
}

/* ---------------------------------------------
 * Order
 * Mirrors Prisma Order model
 * ------------------------------------------- */
export interface Order {
  id: string;
  organizationId: string;
  branchId: string;
  salespersonId: string;
  customerId?: string | null;

  total: number;
  currency: string;
  status: OrderStatus;

  notes?: string | null;
  expiresAt?: Date | null;
  deletedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;

  /* ---------------------------------------------
   * Relations (optional — Prisma include-based)
   * ------------------------------------------- */
  items?: OrderItem[];
  invoice?: Invoice | null;

  organization?: Organization;
  branch?: Branch;
  salesperson?: AuthorizedPersonnel;
  customer?: Customer | null;
}
