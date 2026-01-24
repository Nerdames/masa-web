// customer.d.ts
import type { Organization } from "./organization";
import type { Order } from "./order";
import type { Sale } from "./sale";

/* ---------------------------------------------
 * CustomerType Enum
 * ------------------------------------------- */
export type CustomerType = "BUYER" | "SUPPLIER";

/* ---------------------------------------------
 * Customer
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

  /* relations */
  organization: Organization;
  orders: Order[];
  sales: Sale[];
  tags: CustomerTag[];
  groups: CustomerGroup[];
}

/* ---------------------------------------------
 * CustomerTag
 * ------------------------------------------- */
export interface CustomerTag {
  id: string;
  organizationId: string;
  customerId: string;

  name: string;
  createdAt: Date;

  /* relations */
  organization: Organization;
  customer: Customer;
}

/* ---------------------------------------------
 * CustomerGroup
 * ------------------------------------------- */
export interface CustomerGroup {
  id: string;
  organizationId: string;

  name: string;
  description?: string | null;
  createdAt: Date;

  /* relations */
  organization: Organization;
  customers: Customer[];
}
