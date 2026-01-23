// Barrel file for frontend-safe types

// -------------------- Enums --------------------
export type { 
  Role, 
  CustomerType, 
  OrderStatus, 
  StockMovementType, 
  ProductTag, 
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

// -------------------- Product types --------------------
export type { 
  BranchProduct, 
  Product, 
  BranchProductsQuery, 
  ProductsResponse 
} from "./product";

// Orders
export type { Order } from "./order";
export type { OrderItem } from "./orderItem";
export type { Invoice } from "./invoice";


// -------------------- Customers --------------------
export type { Customer } from "./customer";

// -------------------- Personnel --------------------
export type { AuthorizedPersonnel, BranchAssignment } from "./personnel";

// -------------------- Stock movements --------------------
export type { StockMovement } from "./stockMovement";

// -------------------- Notifications --------------------
export type { Notification } from "./notifications";

// -------------------- Sales --------------------
export type { Sale } from "./sale"; // New: includes attendant, customer, paymentType, discount, tax

// -------------------- Auth / NextAuth --------------------
export type { Account, Session, VerificationToken } from "./auth";
