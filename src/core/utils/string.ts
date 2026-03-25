// src/core/utils/string.ts

/**
 * Generates up to two initials from a provided name.
 * Defaults to "AP" (Authorized Personnel) if name is missing.
 * Logic: "John Doe" -> "JD", "Chibuzor" -> "CH", null -> "AP"
 */
export function getInitials(name?: string | null): string {
  if (!name || name.trim().length === 0) return "AP";

  const parts = name.trim().split(/\s+/); // Handle multiple spaces between names

  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }

  // Take the first letter of the first and second words
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Formats a slug or enum (e.g., "STOCK_ADJUST") into a readable label ("Stock Adjust").
 * Critical for rendering Prisma Enums in the UI.
 */
export function formatEnum(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
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
 * Used in the Inventory module for category/product slugs.
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
  
  // If it starts with 0, replace with 234
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
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}