import type { Category, Supplier } from "./domain";
import type { ProductTag } from "./enums";

/* ---------------------------------------------
 * BranchProduct (Branch-scoped inventory entity)
 * Mirrors Prisma BranchProduct
 * ------------------------------------------- */
export interface BranchProduct {
  id: string;
  organizationId: string;
  branchId: string;
  productId: string;

  stock: number;
  reorderLevel: number;
  tag: ProductTag;

  sellingPrice: number;
  costPrice?: number | null;

  safetyStock?: number | null;
  unit?: string | null;

  lastSoldAt?: string | null;
  lastRestockedAt?: string | null;

  supplierId?: string | null;
  supplier?: Supplier | null;

  // Aggregates
  pendingOrders?: number;
  totalSold?: number;
  salesVelocity?: number;
  stockCoverageDays?: number;

  stockMoves?: {
    type: "IN" | "OUT" | "ADJUST" | "TRANSFER";
    quantity: number;
    createdAt: string;
  }[];

  createdAt: string;
  updatedAt?: string;
}

/* ---------------------------------------------
 * Product (Organization-scoped catalog product)
 * Mirrors Prisma Product
 * ------------------------------------------- */
export interface Product {
  id: string;
  organizationId: string;

  name: string;
  sku: string;
  barcode?: string | null;
  description?: string | null;

  categoryId?: string | null;
  costPrice: number;
  currency: string;

  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;

  // Relations
  category?: Category | null;
  branches?: BranchProduct[]; // optional outside Prisma contexts
}

/* ---------------------------------------------
 * InventoryProduct (API DTO used by UI)
 * THIS is what your inventory page consumes
 * ------------------------------------------- */
export interface InventoryProduct {
  id: string;
  organizationId: string;

  name: string;
  sku: string;

  category?: Category | null;

  // Branch-scoped fields (flattened)
  stock: number;
  sellingPrice: number;
  tag: ProductTag;
  unit: string;

  pendingOrders: number;
  totalSold: number;
  salesVelocity: number;

  supplier?: {
    id: string;
    name: string;
  } | null;

  lastSoldAt?: string | null;
  lastRestockedAt?: string | null;

  stockMoves: {
    type: "IN" | "OUT" | "ADJUST" | "TRANSFER";
    quantity: number;
    createdAt: string;
  }[];

  createdAt: string;
  updatedAt: string;
}

/* ---------------------------------------------
 * API Query Params
 * ------------------------------------------- */
export interface BranchProductsQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  tag?: "ALL" | ProductTag;
  sort?: "az" | "newest" | "";
}

/* ---------------------------------------------
 * API Response (Inventory endpoint)
 * Matches exactly what server returns
 * ------------------------------------------- */
export interface ProductsResponse {
  data: InventoryProduct[];

  total: number;
  page: number;
  pageSize: number;

  totalQuantity: number;
  totalValue: number;

  lowStockCount: number;
  outOfStockCount: number;
  discontinuedCount: number;
  hotCount: number;
  pendingOrders: number;
}
