import type { Category } from "./domain";
import type { Supplier } from "./domain";
import type { ProductTag } from "./enums";

// -------------------- BranchProduct Type --------------------
export interface BranchProduct {
  id: string;
  branchId: string;
  organizationId: string;
  productId: string;
  stock: number;
  sellingPrice: number;
  costPrice?: number;
  tag: ProductTag;
  supplierId?: string;
  supplier?: Supplier | null;
}

// -------------------- Product Type --------------------
export interface Product {
  id: string;
  organizationId: string;
  name: string;
  sku: string;
  barcode?: string | null;
  description?: string | null;
  categoryId?: string | null;
  costPrice: number;
  sellingPrice?: number; // derived from branch
  currency: string;
  tag: ProductTag;
  stock: number; // branch stock
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;

  // Relations
  category?: Category | null;
  supplier?: Supplier | null;
  branches: BranchProduct[];

  // Optional frontend arrays
  orderItems?: unknown[];
  sales?: unknown[];
  stockMoves?: unknown[];
}

// -------------------- API Query Params --------------------
export interface BranchProductsQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  tag?: "ALL" | ProductTag;
}

// -------------------- API Response --------------------
export interface ProductsResponse {
  data: Product[];
  total: number;
  page: number;
  pageSize: number;
}
