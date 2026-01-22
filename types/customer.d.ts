// customer.d.ts
import type { Organization } from "./organization";
import type { Order } from "./order";
import type { Attachment } from "./attachment";

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
  type: CustomerType;

  totalOrders: number;
  totalSpent: number;

  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;

  organization: Organization;
  orders: Order[];
  attachments: Attachment[];
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

  organization: Organization;
  customers: Customer[];
}
