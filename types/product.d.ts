import type { Category, Vendor } from "./domain";
import type { StockMovementType } from "@prisma/client";

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

  sellingPrice?: number | null;
  costPrice?: number | null;

  safetyStock?: number | null;
  unit?: string | null;

  lastSoldAt?: Date | null;
  lastRestockedAt?: Date | null;

  vendorId?: string | null;
  vendor?: Vendor | null;

  // Aggregates (derived / optional)
  pendingOrders?: number;
  totalSold?: number;
  salesVelocity?: number;
  stockCoverageDays?: number;

  stockMoves?: {
    type: StockMovementType;
    quantity: number;
    createdAt: Date;
  }[];

  createdAt: Date;
  updatedAt?: Date;
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

  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;

  // Relations
  category?: Category | null;
  branches?: BranchProduct[];
}

/* ---------------------------------------------
 * InventoryProduct (API DTO used by UI)
 * Flattened view for frontend
 * ------------------------------------------- */
export interface InventoryProduct {
  id: string;
  organizationId: string;

  name: string;
  sku: string;

  category?: Category | null;

  // Branch-scoped fields
  stock: number;
  sellingPrice?: number | null;
  unit?: string | null;

  pendingOrders?: number;
  totalSold?: number;
  salesVelocity?: number;

  vendor?: {
    id: string;
    name: string;
  } | null;

  lastSoldAt?: Date | null;
  lastRestockedAt?: Date | null;

  stockMoves: {
    type: StockMovementType;
    quantity: number;
    createdAt: Date;
  }[];

  createdAt: Date;
  updatedAt: Date;
}

/* ---------------------------------------------
 * API query params for Inventory
 * ------------------------------------------- */
export interface BranchProductsQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  tag?: "ALL" | string;
  sort?: "az" | "newest" | "";
}

/* ---------------------------------------------
 * API response from Inventory endpoint
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