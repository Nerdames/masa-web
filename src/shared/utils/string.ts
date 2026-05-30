// src/core/utils/string.ts

/**
 * Generates up to two initials from a provided name.
 * Defaults to "SY" (System) if name is missing or invalid.
 * Logic: "John Doe" -> "JD", "Chibuzor" -> "CH", "123 Nick!" -> "NI"
 */
export function getInitials(name?: string | null): string {
  if (!name) return "SY";

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    // Strip non-alphabetic characters to ensure initials are letters
    .map((p) => p.replace(/[^A-Za-z]/g, ""))
    .filter((p) => p.length > 0);

  if (parts.length === 0) return "SY";

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  // Take the first letter of the first and second valid words
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Formats a slug or enum (e.g., "STOCK_ADJUST") into a readable label ("Stock Adjust").
 * Critical for rendering Prisma Enums in the UI.
 */
export function formatEnum(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Truncates text to a specified length and adds an ellipsis.
 * Useful for product descriptions in the Inventory Grid.
 */
export function truncate(str: string, length: number): string {
  if (!str) return "";
  return str.length > length ? `${str.substring(0, length)}...` : str;
}

/**
 * Converts a string into a URL-friendly slug.
 * "Electronics & Gadgets" -> "electronics-gadgets"
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")           // Replace spaces with -
    .replace(/[^\w-]+/g, "")         // Remove all non-word chars
    .replace(/--+/g, "-")            // Replace multiple - with single -
    .replace(/^-+/, "")              // Trim - from start
    .replace(/-+$/, "");             // Trim - from end
}

/**
 * Formats/Cleans Nigerian phone numbers to a consistent format.
 * Expects formats like "080123..." or "+234..." and returns a clean string.
 */
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  
  // If it starts with 0 (local format), replace with 234 (international)
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    return `234${cleaned.substring(1)}`;
  }
  
  return cleaned;
}

/**
 * Capitalizes the first letter of every word in a sentence.
 */
export function capitalize(str: string): string {
  if (!str) return "";
  return str
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}