import { 
  Vendor, 
  BranchProduct, 
  Sale, 
  PurchaseOrder, 
  GoodsReceiptNote, 
  Expense 
} from "@prisma/client";

/**
 * Enhanced Vendor Type for Analytics and Dashboarding.
 * Includes nested relations required for revenue calculation, 
 * performance scoring, and inventory tracking.
 */
export interface VendorFull extends Vendor {
  // core relations from schema 
  branchProducts: BranchProductWithSales[];
  purchaseOrders: PurchaseOrder[];
  grns: GoodsReceiptNote[];
  expenses: Expense[];

  // calculated analytics fields
  productsSupplied: number;
  totalRevenue: number;
  totalQuantitySold: number;
  totalStockValue: number;
  salesVelocity: number;
  performanceScore: number;
}

/**
 * Helper interface for deep sales access within branch products.
 * Aligns with the BranchProduct and Sale models[cite: 36, 38, 39, 40].
 */
export interface BranchProductWithSales extends BranchProduct {
  sales: Pick<Sale, "quantity" | "total" | "createdAt">[];
}

/**
 * DTO for creating/updating vendors via API.
 * Fields aligned with the Vendor model scalar fields[cite: 50, 51].
 */
export interface VendorUpdateInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

/**
 * Summary interface for vendor dashboard widgets.
 */
export interface VendorSummary {
  totalVendors: number;
  totalRevenue: number;
  leaders: {
    topVendor: VendorFull | null;
    fastestVendor: VendorFull | null;
    bestOverall: VendorFull | null;
  };
}