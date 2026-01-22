// -------------------- Roles --------------------
export type Role = "ADMIN" | "MANAGER" | "SALES" | "INVENTORY" | "CASHIER" | "DEV";

// -------------------- Customer Types --------------------
export type CustomerType = "BUYER" | "SUPPLIER";

// -------------------- Order Status --------------------
export type OrderStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "CANCELLED"
  | "RETURNED";

// -------------------- Stock Movement Types --------------------
export type StockMovementType = "IN" | "OUT" | "ADJUST" | "TRANSFER";

// -------------------- Product Tags --------------------
export type ProductTag = "DISCONTINUED" | "OUT_OF_STOCK" | "LOW_STOCK" | "HOT";

// -------------------- Notification Types --------------------
export type NotificationType = "INFO" | "WARNING" | "ERROR" | "SYSTEM";
