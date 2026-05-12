"use client";

import { useSession } from "next-auth/react";
import { useMemo } from "react";
import { authorize, ROLE_WEIGHT } from "@/core/lib/permission";
import { 
  PermissionAction, 
  CriticalAction, 
  Resource,
  Role
} from "@prisma/client";

/**
 * PRODUCTION-READY PERMISSION HOOK
 * Centralized client-side authorization utility synchronized with the core RBAC engine.
 */
export function usePermission() {
  const { data: session, status } = useSession();

  const permissions = useMemo(() => {
    const user = session?.user;
    const isLoading = status === "loading";
    const isAuthenticated = status === "authenticated";

    // Shared internal check to maintain O(1) performance in components
    const check = (action: PermissionAction, resource: Resource): boolean => {
      if (!user) return false;
      return authorize({
        role: user.role,
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
       * Core check for buttons or specific logic.
       * Usage: can(PermissionAction.CREATE, Resource.INVOICE)
       */
      can: (action: PermissionAction, resource: Resource) => check(action, resource),
      
      /**
       * Semantic alias for 'can' for better readability in action handlers.
       */
      canPerform: (action: PermissionAction, resource: Resource) => check(action, resource),

      /**
       * Visibility check for UI elements like "Details" sections or Sidebars.
       * Maps to PermissionAction.READ. 
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
       * Validates critical actions (e.g., price updates) that may require approvals. [cite: 2, 3]
       */
      checkCritical: (criticalAction: CriticalAction) => {
        if (!user) return { allowed: false, requiresApproval: false, reason: "Unauthenticated" };
        return authorize({
          role: user.role,
          isOrgOwner: user.isOrgOwner,
          userPermissions: user.permissions,
          criticalAction,
        });
      },

      /**
       * Checks if the user's role meets a hierarchy threshold. 
       * Useful for high-level UI sections like "Admin Panel".
       */
      isAtLeast: (targetRole: Role) => {
        if (!user) return false;
        if (user.isOrgOwner) return true;
        return ROLE_WEIGHT[user.role] >= ROLE_WEIGHT[targetRole];
      },

      /**
       * Exact role check for specific system-level features.
       */
      isRole: (role: Role) => user?.role === role || user?.isOrgOwner,
    };
  }, [session, status]);

  return permissions;
}