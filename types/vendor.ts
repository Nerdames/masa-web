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
  sellingPrice?: number | null;
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
  productsSupplied: number;       // # of branch products
  totalRevenue: number;           // sum of sales total
  totalQuantitySold: number;      // sum of sales quantity
  totalStockValue: number;        // stock * sellingPrice
  salesVelocity: number;          // avg quantity per active day
  performanceScore: number;       // 0–100 normalized
};

/* -----------------------------------------
   Full Vendor Type (DB + Analytics + Branch Products)
------------------------------------------ */
export type VendorFull = VendorBase & VendorAnalytics & {
  branchProducts: VendorBranchProduct[];
};