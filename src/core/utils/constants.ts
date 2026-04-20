export const RESOURCES = [
  "PRODUCT",
  "INVENTORY",
  "INVOICE",
  "SALE",
  "VENDOR",
  "PURCHASE_ORDER",
  "GRN",
  "PERSONNEL",
  "FINANCE_ACCOUNT",
  "AUDIT_LOG"
] as const;

// Optional: Create a type from the array for stricter type safety
export type ResourceType = (typeof RESOURCES)[number];