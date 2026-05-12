/**
 * src/core/lib/permissionCache.ts
 * * PRODUCTION-READY RBAC CACHE
 * Fortified for Next.js Serverless/Edge environments
 */

import { LRUCache } from "lru-cache";
import { Role } from "@prisma/client";

// ============================================================================
// CONFIGURATION & ENVIRONMENT SAFETY
// ============================================================================
// Safely parse environment variables with strict fallbacks to prevent NaN errors
const CACHE_TTL = parseInt(process.env.PERMISSION_CACHE_TTL_MS || "120000", 10) || 120000; // 2 mins default
const CACHE_MAX_SIZE = parseInt(process.env.PERMISSION_CACHE_MAX_SIZE || "5000", 10) || 5000;

// ============================================================================
// SINGLETON PATTERN (CRITICAL FOR NEXT.JS)
// Prevents memory leaks and cache wiping during Next.js Hot Module Replacement (HMR)
// ============================================================================
const globalForCache = globalThis as unknown as {
  permissionCache: LRUCache<string, string[]> | undefined;
};

export const permissionCache =
  globalForCache.permissionCache ??
  new LRUCache<string, string[]>({
    max: CACHE_MAX_SIZE,
    ttl: CACHE_TTL,
    // Optional: Dispose method allows for memory cleanup logging
    dispose: (value, key) => {
      if (process.env.NODE_ENV === "development") {
        console.debug(`[Cache Dispose] Key evicted: ${key}`);
      }
    },
    // Update TTL when item is fetched to keep active sessions alive in cache
    updateAgeOnGet: true,
  });

if (process.env.NODE_ENV !== "production") {
  globalForCache.permissionCache = permissionCache;
}

// ============================================================================
// UTILITIES & GUARDS
// ============================================================================

/**
 * Generates a standardized, namespaced cache key to prevent collision poisoning.
 */
const getCacheKey = (organizationId: string, role: Role | string): string => {
  if (!organizationId || !role) {
    throw new Error("Invalid cache key parameters: organizationId and role are required.");
  }
  return `ORG:${organizationId}:ROLE:${role}`;
};

// ============================================================================
// CACHE OPERATIONS
// ============================================================================

/**
 * Retrieves cached permissions for a specific organization and role.
 * Fast O(1) lookup to prevent DB bottlenecking and UI rendering lag.
 */
export const getCachedPermissions = (
  organizationId: string,
  role: Role | string
): string[] | undefined => {
  try {
    const key = getCacheKey(organizationId, role);
    return permissionCache.get(key);
  } catch (error) {
    console.error("[PermissionCache:GET] Failed to retrieve cache", error);
    return undefined; // Fail open to allow DB fallback
  }
};

/**
 * Sets permissions in the cache. 
 * Validates payload to prevent storing undefined/null artifacts.
 */
export const setCachedPermissions = (
  organizationId: string,
  role: Role | string,
  permissions: string[]
): void => {
  try {
    if (!Array.isArray(permissions)) return;
    const key = getCacheKey(organizationId, role);
    permissionCache.set(key, permissions);
  } catch (error) {
    console.error("[PermissionCache:SET] Failed to set cache", error);
  }
};

/**
 * Invalidates cache for a specific role within an organization.
 * Used when a specific ResourcePermission is updated.
 */
export const invalidateOrgRole = (organizationId: string, role: Role | string): void => {
  try {
    const key = getCacheKey(organizationId, role);
    permissionCache.delete(key);
  } catch (error) {
    console.error("[PermissionCache:INVALIDATE_ROLE] Error:", error);
  }
};

/**
 * Invalidates ALL role caches for a specific organization.
 * Optimized for O(N) iteration, safely batching deletions.
 */
export const invalidateAllOrgRoles = (organizationId: string): void => {
  try {
    if (!organizationId) return;
    
    const prefix = `ORG:${organizationId}:`;
    const keysToDelete: string[] = [];

    // Collect keys first to avoid mutation while iterating
    for (const key of permissionCache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    // Batch delete
    keysToDelete.forEach((key) => permissionCache.delete(key));
    
    if (process.env.NODE_ENV === "development") {
      console.debug(`[PermissionCache] Cleared ${keysToDelete.length} roles for ORG:${organizationId}`);
    }
  } catch (error) {
    console.error("[PermissionCache:INVALIDATE_ORG] Error:", error);
  }
};

/**
 * Total system purge (Emergency use / Dev use).
 */
export const clearSystemCache = (): void => {
  permissionCache.clear();
};