// Barrel file for frontend-safe types

// Enums
export type { Role, CustomerType, OrderStatus, StockMovementType, ProductTag, NotificationType } from "./enums";

// Domain types
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

// Product types
export type { BranchProduct, Product, BranchProductsQuery, ProductsResponse } from "./product";

// Orders
export type { Order, OrderItem, Invoice } from "./order";

// Customers
export type { Customer } from "./customer";

// Personnel
export type { AuthorizedPersonnel, BranchAssignment } from "./personnel";

// Stock movements
export type { StockMovement } from "./stockMovement";

// Notifications
export type { Notification } from "./notifications";

// Auth / NextAuth
export type { Account, Session, VerificationToken } from "./auth";
