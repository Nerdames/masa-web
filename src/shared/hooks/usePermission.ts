"use client";

import { useSession } from "next-auth/react";
import { useMemo } from "react";
import { authorize, ROLE_WEIGHT } from "@/server/permissions/enforcer";
import { 
  PermissionAction, 
  CriticalAction, 
  Resource,
  Role
} from "@prisma/client";

/**
 * PRODUCTION-READY PERMISSION HOOK
 * Centralized client-side authorization utility synchronized with the core RBAC engine (V3.2).
 * * Features:
 * - O(1) Performance via memoized check functions.
 * - OrgOwner bypass logic (Superuser access).
 * - Full alignment with Prisma Enums (Resource, CriticalAction, PermissionAction). [cite: 156, 165, 268]
 * - Semantic helpers for common UI triggers.
 */
export function usePermission() {
  const { data: session, status } = useSession();

  const permissions = useMemo(() => {
    // Note: session.user is expected to contain 'role', 'isOrgOwner', and 'permissions' array.
    // Ensure these are injected via the NextAuth session callback.
    const user = session?.user;
    const isLoading = status === "loading";
    const isAuthenticated = status === "authenticated";

    /**
     * Internal check wrapper to interface with the core authorization engine.
     * Maps user session data to the RBAC authorize function.
     */
    const check = (action: PermissionAction, resource: Resource): boolean => {
      if (!user) return false;
      return authorize({
        role: user.role as Role,
        isOrgOwner: user.isOrgOwner,
        userPermissions: user.permissions, // Injected via session at login 
        action,
        resources: resource,
      }).allowed;
    };

    return {
      isLoading,
      isAuthenticated,
      user,
      
      /**
       * Core check for generic logic or dynamic permission requirements.
       * Usage: can(PermissionAction.CREATE, Resource.INVOICE)
       */
      can: (action: PermissionAction, resource: Resource) => check(action, resource),
      
      /**
       * Semantic alias for 'can' for better readability in event handlers.
       */
      canPerform: (action: PermissionAction, resource: Resource) => check(action, resource),

      /**
       * Visibility check for UI elements like "Details" sections or Sidebars.
       * Automatically maps to PermissionAction.READ. [cite: 158]
       */
      canSee: (resource: Resource) => check(PermissionAction.READ, resource),

      /** Semantic Helpers for common component triggers */
      canCreate:  (resource: Resource) => check(PermissionAction.CREATE, resource),
      canEdit:    (resource: Resource) => check(PermissionAction.UPDATE, resource),
      canDelete:  (resource: Resource) => check(PermissionAction.DELETE, resource),
      canApprove: (resource: Resource) => check(PermissionAction.APPROVE, resource),
      canVoid:    (resource: Resource) => check(PermissionAction.VOID, resource),
      canExport:  (resource: Resource) => check(PermissionAction.EXPORT, resource),

      /**
       * Validates critical actions (e.g., PRICE_UPDATE) that may require approvals. [cite: 272]
       * Returns: { allowed: boolean, requiresApproval: boolean, reason?: string }
       */
      checkCritical: (criticalAction: CriticalAction) => {
        if (!user) return { allowed: false, requiresApproval: false, reason: "Unauthenticated" };
        return authorize({
          role: user.role as Role,
          isOrgOwner: user.isOrgOwner,
          userPermissions: user.permissions,
          criticalAction,
        });
      },

      /**
       * Hierarchy-based check: determines if user's role meets a weight threshold.
       * Useful for high-level UI sections like "Admin Panel".
       */
      isAtLeast: (targetRole: Role) => {
        if (!user) return false;
        if (user.isOrgOwner) return true;
        const userWeight = ROLE_WEIGHT[user.role as Role] || 0;
        const targetWeight = ROLE_WEIGHT[targetRole] || 0;
        return userWeight >= targetWeight;
      },

      /**
       * Exact role check for specific system-level features.
       * Automatically grants access to Organization Owners. [cite: 431]
       */
      isRole: (role: Role) => user?.role === role || user?.isOrgOwner,
    };
  }, [session, status]);

  return permissions;
}