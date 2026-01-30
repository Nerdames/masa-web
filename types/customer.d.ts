import type { Organization } from "./organization";
import type { Order } from "./order";
import type { Sale } from "./sale";
import type { Branch } from "./branch";
import type { CustomerType } from "@prisma/client";

/* Atomic breakdown per product */
export interface ProductBreakdownItem {
  productId: string;
  name: string;
  quantity: number;
  total: number;
}

/* ---------------------------------------------
 * Customer
 * Mirrors Prisma Customer model
 * ------------------------------------------- */
export interface Customer {
  id: string;
  organizationId: string;

  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;

  type: CustomerType;

  totalOrders: number;
  totalSpent: number;

  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;

  /* relations (optional — Prisma include-based) */
  organization?: Organization;
  orders?: Order[];
  sales?: Sale[];
  tags?: CustomerTag[];
  groups?: CustomerGroup[];
  customerSummaries?: CustomerOrderSummary[];
}

/* ---------------------------------------------
 * CustomerTag
 * Mirrors Prisma CustomerTag model
 * ------------------------------------------- */
export interface CustomerTag {
  id: string;
  organizationId: string;
  customerId: string;

  name: string;
  createdAt: Date;

  /* relations */
  organization?: Organization;
  customer?: Customer;
}

/* ---------------------------------------------
 * CustomerGroup
 * Mirrors Prisma CustomerGroup model
 * ------------------------------------------- */
export interface CustomerGroup {
  id: string;
  organizationId: string;

  name: string;
  description?: string | null;
  createdAt: Date;

  /* relations */
  organization?: Organization;
  customers?: Customer[];
}

/* ---------------------------------------------
 * CustomerOrderSummary
 * Mirrors Prisma CustomerOrderSummary model
 * ------------------------------------------- */
export interface CustomerOrderSummary {
  id: string;
  organizationId: string;
  branchId: string;
  customerId: string;

  totalOrders: number;
  totalQuantity: number;
  totalSpent: number;
  currency: string;

  lastOrderAt?: Date | null;

  /** Keyed by productId for type-safe access */
  productBreakdown?: Record<string, ProductBreakdownItem>;

  /* relations */
  organization?: Organization;
  branch?: Branch;
  customer?: Customer;
}
