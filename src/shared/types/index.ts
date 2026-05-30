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

// -------------------- Vendors --------------------
export type { 
  VendorFull, 
  BranchProductWithSales, 
  VendorUpdateInput, 
  VendorSummary 
} from "./vendor";

// -------------------- Personnel --------------------
export type { AuthorizedPersonnel, BranchAssignment } from "./personnel";

// -------------------- Stock Movements --------------------
export type { StockMovement } from "./stockMovement";

// -------------------- Notifications --------------------
export type { Notification } from "./notifications";

// -------------------- Payments / Receipts --------------------
export type { Payment } from "./payment";
export type { Receipt } from "./receipt";

// -------------------- Auth / NextAuth --------------------
export type { Account, Session, VerificationToken } from "./auth";