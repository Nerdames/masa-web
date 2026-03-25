// src/core/utils/currency.ts

/**
 * Standardized Naira (NGN) formatter using Nigerian locale.
 * Usage: formatCurrency(1500.50) -> ₦1,500.50
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  options: { showSymbol?: boolean; fractionDigits?: number } = {}
): string {
  const { showSymbol = true, fractionDigits = 2 } = options;
  
  if (amount === null || amount === undefined) return showSymbol ? "₦0.00" : "0.00";

  const numericAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  
  if (isNaN(numericAmount)) return showSymbol ? "₦0.00" : "0.00";

  const formatter = new Intl.NumberFormat("en-NG", {
    style: showSymbol ? "currency" : "decimal",
    currency: "NGN",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  return formatter.format(numericAmount);
}

/**
 * Converts Kobo (stored as Integers in DB) to Naira for UI display.
 * High-precision ERPs often store currency in minor units to avoid floating-point errors.
 * Usage: fromKobo(150050) -> 1500.50
 */
export function fromKobo(kobo: number | bigint): number {
  return Number(kobo) / 100;
}

/**
 * Converts Naira to Kobo for Database storage.
 * Usage: toKobo(1500.50) -> 150050
 */
export function toKobo(naira: number): number {
  return Math.round(naira * 100);
}

/**
 * Shorthand formatter for Dashboard Analytics.
 * Usage: formatCompactCurrency(1250000) -> ₦1.25M
 */
export function formatCompactCurrency(amount: number): string {
  const formatter = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    notation: "compact",
    maximumFractionDigits: 1,
  });

  return formatter.format(amount);
}

/**
 * Percentage formatter for Tax, Discounts, and Margin calculations.
 * Usage: formatPercent(0.075) -> 7.5%
 */
export function formatPercent(value: number, decimals = 1): string {
  return new Intl.NumberFormat("en-NG", {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Calculates a price inclusive of tax.
 * Used in POS Checkout logic.
 */
export function calculateTax(amount: number, taxRate: number): number {
  return amount * taxRate;
}