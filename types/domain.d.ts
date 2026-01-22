import type { ProductTag } from "./enums";

// -------------------- Base Entities --------------------
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

// -------------------- Customer Order Summary --------------------
export interface ProductBreakdownItem {
  name: string;
  quantity: number;
  total: number;
}

// This replaces `any` in a safe way
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
  productBreakdown?: Record<string, ProductBreakdownItem> | null;
}

// -------------------- Other Relations --------------------
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
