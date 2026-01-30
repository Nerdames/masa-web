// ======================================================
// Barrel file — MASA Types (frontend-safe)
// ======================================================

// -------------------- Enums --------------------
export type {
  Role,
  CustomerType,
  OrderStatus,
  StockMovementType,
  InvoiceStatus,
  SaleStatus,
  PaymentMethod,
  PaymentStatus,
  NotificationType
} from "./enums";

// -------------------- Domain types --------------------
export type {
  Organization,
  Branch,
  Category,
  Supplier,
  CustomerOrderSummary,
  ProductBreakdownItem,
  CustomerGroup,
  CustomerTag
} from "./domain";

// -------------------- Product / Inventory types --------------------
export type {
  Product,               // catalog product (org-scoped)
  BranchProduct,         // branch-product entity
  InventoryProduct,      // inventory DTO for UI
  BranchProductsQuery,   // API query params
  ProductsResponse       // inventory API response
} from "./product";

// -------------------- Orders --------------------
export type { Order, OrderItem } from "./order";
export type { Invoice } from "./invoice";

// -------------------- Customers --------------------
export type { Customer } from "./customer";

// -------------------- Personnel --------------------
export type { AuthorizedPersonnel, BranchAssignment } from "./personnel";

// -------------------- Stock Movements --------------------
export type { StockMovement } from "./stockMovement";

// -------------------- Notifications --------------------
export type { Notification } from "./notifications";

// -------------------- Sales --------------------
export type { Sale } from "./sale";

// -------------------- Payments / Receipts --------------------
export type { Payment } from "./payment";
export type { Receipt } from "./receipt";

// -------------------- Auth / NextAuth --------------------
export type { Account, Session, VerificationToken } from "./auth";
