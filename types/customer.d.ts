import type { Organization } from "./organization";
import type { Order } from "./order";
import type { Sale } from "./sale";
import type { Branch } from "./branch";
import type { CustomerType } from "@prisma/client";

/* =========================================================
   Atomic breakdown per product (used in analytics)
========================================================= */
export interface ProductBreakdownItem {
  productId: string;
  name: string;
  quantity: number;
  total: number;
}

/* =========================================================
   Customer
   Mirrors Prisma Customer model
========================================================= */
export interface Customer {
  id: string;
  organizationId: string;

  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;

  type: CustomerType;

  /* Lifetime aggregates */
  totalOrders: number;
  totalSpent: number;
  totalQuantity?: number;

  /* Optional analytics fields */
  averageOrderValue?: number;
  lastPurchaseAt?: Date | null;
  firstPurchaseAt?: Date | null;
  lifetimeValue?: number;
  performanceScore?: number; // 0–100 scoring for dashboards
  segment?: "VIP" | "LOYAL" | "REGULAR" | "NEW" | "AT_RISK";

  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;

  /* relations (optional — Prisma include-based) */
  organization?: Organization;
  orders?: Order[];
  sales?: Sale[];
  tags?: CustomerTag[];
  groups?: CustomerGroup[];
  customerSummaries?: CustomerOrderSummary[];
}

/* =========================================================
   CustomerTag
   Mirrors Prisma CustomerTag model
========================================================= */
export interface CustomerTag {
  id: string;
  organizationId: string;
  customerId: string;

  name: string;
  createdAt: Date;

  /* relations */
  organization?: Organization;
  customer?: Customer;
}

/* =========================================================
   CustomerGroup
   Mirrors Prisma CustomerGroup model
========================================================= */
export interface CustomerGroup {
  id: string;
  organizationId: string;

  name: string;
  description?: string | null;
  createdAt: Date;

  /* analytics */
  totalCustomers?: number;
  totalRevenue?: number;

  /* relations */
  organization?: Organization;
  customers?: Customer[];
}

/* =========================================================
   CustomerOrderSummary
   Branch-Level Aggregated Summary
========================================================= */
export interface CustomerOrderSummary {
  id: string;
  organizationId: string;
  branchId: string;
  customerId: string;

  totalOrders: number;
  totalQuantity: number;
  totalSpent: number;
  currency: string;

  averageOrderValue?: number;
  lastOrderAt?: Date | null;
  firstOrderAt?: Date | null;

  /* Vendor / Product analytics */
  topProductId?: string | null;
  topProductName?: string | null;

  /** Keyed by productId for type-safe access */
  productBreakdown?: Record<string, ProductBreakdownItem>;

  /* Customer engagement analytics */
  purchaseFrequencyPerMonth?: number;
  recencyInDays?: number;
  churnRiskScore?: number; // 0–100

  /* relations */
  organization?: Organization;
  branch?: Branch;
  customer?: Customer;
}

/* =========================================================
   Dashboard / Analytics Response Types
========================================================= */

export interface CustomerAnalyticsSummary {
  totalCustomers: number;
  totalRevenue: number;
  averageCustomerValue: number;

  topCustomer?: Customer | null;
  mostFrequentCustomer?: Customer | null;
  highestSpendingCustomer?: Customer | null;

  newCustomersThisMonth?: number;
  returningCustomers?: number;
}

export interface CustomerLeaderboardItem {
  id: string;
  name: string;
  totalSpent: number;
  totalOrders: number;
  performanceScore: number;
  segment?: Customer["segment"];
}

export interface CustomerDashboardResponse {
  summary: CustomerAnalyticsSummary;
  leaderboard: CustomerLeaderboardItem[];
  customers: Customer[];
}