/* ======================================================
 * ENUMS — Single Source of Truth
 * ==================================================== */

/* ======================================================
 * PRISMA ENUMS (Database-backed)
 * ==================================================== */
import type {
  Role,
  CustomerType,
  OrderStatus,
  InvoiceStatus,
  StockMovementType,
  SaleStatus,
} from "@prisma/client";

/* -------------------- DB-backed enums -------------------- */
export type { Role, CustomerType, OrderStatus, InvoiceStatus, StockMovementType, SaleStatus };

/* -------------------- Runtime helpers -------------------- */
export const ROLES: Role[] = ["ADMIN", "MANAGER", "SALES", "INVENTORY", "CASHIER", "DEV"];
export const CUSTOMER_TYPES: CustomerType[] = ["BUYER", "SUPPLIER"];
export const ORDER_STATUSES: OrderStatus[] = ["DRAFT", "SUBMITTED", "CANCELLED"];
export const INVOICE_STATUSES: InvoiceStatus[] = ["ISSUED", "PARTIALLY_PAID", "PAID", "VOIDED"];
export const STOCK_MOVEMENT_TYPES: StockMovementType[] = ["IN", "OUT", "ADJUST", "TRANSFER"];
export const SALE_STATUSES: SaleStatus[] = ["PENDING", "COMPLETED", "CANCELLED"];

/* ======================================================
 * DOMAIN ENUMS (Non-Prisma / Code-only)
 * ==================================================== */

/* -------------------- Payment Methods -------------------- */
export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "MOBILE_MONEY" | "POS";
export const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CARD", "BANK_TRANSFER", "MOBILE_MONEY", "POS"];

/* -------------------- Payment Status -------------------- */
export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
export const PAYMENT_STATUSES: PaymentStatus[] = ["PENDING", "COMPLETED", "FAILED", "REFUNDED"];

/* -------------------- Notification Types -------------------- */
export type NotificationType = "INFO" | "WARNING" | "ERROR" | "SYSTEM";
export const NOTIFICATION_TYPES: NotificationType[] = ["INFO", "WARNING", "ERROR", "SYSTEM"];
