// frontend-safe types barrel
// ==========================

// -------------------- Enums --------------------
export type {
  Role,
  CustomerType,
  OrderStatus,
  StockMovementType,
  ProductTag,
  NotificationType,
} from "./enums";

// -------------------- Core domain --------------------
export type {
  Organization,
  Branch,
  Category,
  Supplier,
  CustomerGroup,
  CustomerTag,
  CustomerOrderSummary,
  ProductBreakdownItem,
} from "./domain";

// -------------------- Products & inventory --------------------
export type {
  Product,
  BranchProduct,
  BranchProductsQuery,
  ProductsResponse,
} from "./product";

// -------------------- Orders & billing --------------------
export type { Order } from "./order";
export type { OrderItem } from "./orderItem";
export type { Invoice } from "./invoice";

// -------------------- Customers --------------------
export type { Customer } from "./customer";

// -------------------- Personnel & access --------------------
export type {
  AuthorizedPersonnel,
  BranchAssignment,
} from "./personnel";

// -------------------- Stock movements --------------------
export type { StockMovement } from "./stockMovement";

// -------------------- Sales --------------------
export type { Sale } from "./sale";

// -------------------- Notifications --------------------
export type { Notification } from "./notifications";

// -------------------- Auth (NextAuth – frontend-safe) --------------------
export type {
  Account,
  Session,
  VerificationToken,
} from "./auth";

// -------------------- Page Detail (UI infrastructure) --------------------
export type {
  PageDetailConfig,
  PageDetailFetchParams,
  PageDetailFetchResult,
  PageDetailFetchHookResult,
  PageDetailTableProps,
} from "./PageDetail";
