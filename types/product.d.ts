import type { Category, Supplier } from "./domain";
import type { ProductTag } from "./enums";

/* ---------------------------------------------
 * BranchProduct (Branch-scoped inventory)
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

  pendingOrders?: number;       // aggregated
  totalSold?: number;           // aggregated
  salesVelocity?: number;       // units/day
  stockCoverageDays?: number;   // stock / velocity

  stockMoves?: {
    type: "IN" | "OUT" | "ADJUST" | "TRANSFER";
    quantity: number;
    createdAt: string;
  }[];

  createdAt: string;
  updatedAt?: string;
}

/* ---------------------------------------------
 * Product (Organization-scoped catalog)
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
  branches: BranchProduct[];
}

/* ---------------------------------------------
 * API Query Params
 * ------------------------------------------- */
export interface BranchProductsQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  tag?: "ALL" | ProductTag;
}

/* ---------------------------------------------
 * API Response
 * ------------------------------------------- */
export interface ProductsResponse {
  data: Product[];
  total: number;
  page: number;
  pageSize: number;
}
