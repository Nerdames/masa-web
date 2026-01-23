import type { ProductTag } from "./enums";

/* ======================================================
 * BASE ENTITIES (Schema-aligned, non-relational)
 * ==================================================== */

export interface Organization {
  id: string;
  name: string;
  active: boolean;
  ownerId?: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface Branch {
  id: string;
  organizationId: string;

  name: string;
  location?: string | null;
  active: boolean;
  deletedAt?: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  organizationId: string;

  name: string;
  description?: string | null;

  createdAt: string;
}

export interface Supplier {
  id: string;
  organizationId: string;

  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;

  createdAt: string;
  updatedAt: string;
}

/* ======================================================
 * CUSTOMER ORDER SUMMARY (Reporting / Read Model)
 * ==================================================== */

export interface ProductBreakdownItem {
  name: string;
  quantity: number;
  total: number;
}

export interface CustomerOrderSummary {
  id: string;
  organizationId: string;
  branchId: string;
  customerId: string;

  totalOrders: number;
  totalQuantity: number;
  totalSpent: number;
  currency: string;

  lastOrderAt?: string | null;

  /**
   * Mirrors Prisma Json?
   * Stored as key-value pairs (productId → breakdown)
   */
  productBreakdown?: Record<string, ProductBreakdownItem> | null;
}

/* ======================================================
 * CUSTOMER METADATA
 * ==================================================== */

export interface CustomerGroup {
  id: string;
  organizationId: string;

  name: string;
  description?: string | null;

  createdAt: string;
}

export interface CustomerTag {
  id: string;
  organizationId: string;
  customerId: string;

  name: string;
  createdAt: string;
}
