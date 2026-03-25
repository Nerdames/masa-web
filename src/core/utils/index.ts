import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Core utility for merging Tailwind classes.
 * Combines 'clsx' for logic and 'tailwind-merge' for conflict resolution.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Export your other utilities so they are accessible from this index
export * from "./currency";
export * from "./string";
export * from "./errors";
// Add others as needed...