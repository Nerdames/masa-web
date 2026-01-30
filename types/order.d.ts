// types/order.d.ts

import type { Branch } from "./domain";
import type { Customer } from "./customer";
import type { AuthorizedPersonnel } from "./personnel";
import type { Invoice } from "./invoice";

/* ---------------------------------------------
 * OrderItem
 * Mirrors Prisma OrderItem model
 * ------------------------------------------- */
export interface OrderItem {
  id: string;
  orderId: string;
  branchProductId: string;
  productId: string;

  quantity: number;   // Prisma Int
  unitPrice: number;  // Prisma Float
  total: number;      // Prisma Float (snapshot)

  discount?: number | null; // Prisma Float? @default(0)
  tax?: number | null;      // Prisma Float? @default(0)

  /* ---------------------------------------------
   * Relations (optional — Prisma include-based)
   * ------------------------------------------- */
  order?: Order;
  branchProduct?: unknown; // optional, define BranchProduct type if needed
  product?: unknown;       // optional, define Product type if needed
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
  status: string; // import OrderStatus from enums if strict typing is needed

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

  organization?: unknown;           // frontend usually omits this
  branch?: Branch;
  salesperson?: AuthorizedPersonnel;
  customer?: Customer | null;
}
