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

export interface BranchPersonnelDTO {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  staffCode: string | null;
}

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  location: string | null;
  active: boolean;
  deletedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  branchAssignments: {
    id: string;
    role: Role;
    isPrimary: boolean;
    personnel: BranchPersonnelDTO;
  }[];
  _count: {
    personnel: number;
    branchProducts: number;
    orders: number;
    activityLogs: number;
  };
  salesTotal: number; // Enriched by the API
}

export interface BranchSummary {
  total: number;
  active: number;
  inactive: number;
  deleted: number;
}

export interface BranchListResponse {
  data: Branch[];
  summary: BranchSummary;
  recentLogs: any[];
  page: number;
  pageSize: number;
}

export interface UpdateBranchPayload {
  id: string;
  name?: string;
  location?: string;
  active?: boolean;
  deletedAt?: string | null;
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
