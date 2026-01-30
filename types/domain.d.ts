/* ======================================================
 * BASE ENTITIES (Schema-aligned, non-relational)
 * ==================================================== */

export interface Organization {
  id: string;
  name: string;
  active: boolean;
  ownerId?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface Branch {
  id: string;
  organizationId: string;

  name: string;
  location?: string | null;
  active: boolean;
  deletedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  organizationId: string;

  name: string;
  description?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface Supplier {
  id: string;
  organizationId: string;

  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

/* ======================================================
 * CUSTOMER ORDER SUMMARY (Reporting / Read Model)
 * ==================================================== */

export interface ProductBreakdownItem {
  productId: string;
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

  lastOrderAt?: Date | null;

  productBreakdown?: Record<string, ProductBreakdownItem> | null;

  createdAt: Date;
  updatedAt: Date;

  /* ---------------------------------------------
   * Relations (optional — Prisma include-based)
   * ------------------------------------------- */
  organization?: Organization;
  branch?: Branch;
  customer?: Customer;
}

/* ======================================================
 * CUSTOMER METADATA
 * ==================================================== */

export interface CustomerGroup {
  id: string;
  organizationId: string;

  name: string;
  description?: string | null;

  createdAt: Date;
  updatedAt: Date;

  /* Relations */
  organization?: Organization;
  customers?: Customer[];
}

export interface CustomerTag {
  id: string;
  organizationId: string;
  customerId: string;

  name: string;
  createdAt: Date;

  /* Relations */
  organization?: Organization;
  customer?: Customer;
}
