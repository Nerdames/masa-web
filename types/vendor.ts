/* -----------------------------------------
   Base Vendor from Prisma
------------------------------------------ */
export type VendorBase = {
  id: string;
  organizationId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/* -----------------------------------------
   Branch Product & Sales (nested)
------------------------------------------ */
export type VendorBranchProductSale = {
  quantity: number;
  total: number;
  createdAt: Date;
};

export type VendorBranchProduct = {
  id: string;
  branchId: string;
  productId: string;
  stock: number;
  sellingPrice: number; // Forced as number because of toNumber() helper in API
  costPrice?: number | null;
  vendorId?: string | null;
  sales: VendorBranchProductSale[];
};

/* -----------------------------------------
   Computed Analytics Fields
------------------------------------------ */
export type VendorAnalytics = {
  id: string;
  name: string;
  productsSupplied: number;       // Count of branch products
  totalRevenue: number;           // Sum of sales total
  totalQuantitySold: number;      // Sum of sales quantity
  totalStockValue: number;        // stock * sellingPrice
  salesVelocity: number;          // Avg quantity per active day
  performanceScore: number;       // 0–100 normalized score
};

/* -----------------------------------------
   Full Vendor Type (DB + Analytics + Branch Products)
------------------------------------------ */
/**
 * VendorFull merges the database schema with computed analytics
 * and the specific subset of branch data used for the dashboard.
 */
export type VendorFull = VendorBase & VendorAnalytics & {
  branchProducts: VendorBranchProduct[];
};

/* -----------------------------------------
   API Response Types
------------------------------------------ */
export interface VendorPagination {
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export interface VendorSummary {
  totalVendors: number;
  totalRevenue: number;
}

export interface VendorLeaders {
  topVendor: VendorAnalytics | null;
  fastestVendor: VendorAnalytics | null;
  bestOverall: VendorAnalytics | null;
}

export interface VendorsApiResponse {
  summary: VendorSummary;
  leaders: VendorLeaders;
  vendors: VendorFull[];
  pagination: VendorPagination;
}