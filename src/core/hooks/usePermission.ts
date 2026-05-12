"use client";

import { useSession } from "next-auth/react";
import { useMemo } from "react";
import { authorize } from "@/core/lib/permission";
import { PermissionAction, CriticalAction } from "@prisma/client";

export type ResourceType = string;

export function usePermission() {
  const { data: session, status } = useSession();

  const permissions = useMemo(() => {
    const user = session?.user;
    
    return {
      isLoading: status === "loading",
      isAuthenticated: status === "authenticated",
      user,
      
      /**
       * Check if user can perform a specific action on a resource
       * Usage: can("CREATE", "INVOICE")
       */
      can: (action: PermissionAction, resource: ResourceType) => {
        if (!user) return false;
        return authorize({
          role: user.role,
          isOrgOwner: user.isOrgOwner,
          userPermissions: user.permissions,
          action,
          resources: resource,
        }).allowed;
      },

      /**
       * Check for critical actions that might require approval
       * Usage: checkCritical("VOID_INVOICE")
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
       * Check if user has access to a specific path (for UI menu visibility)
       */
      canAccessPath: (pathname: string) => {
        if (!user) return false;
        return authorize({
          role: user.role,
          isOrgOwner: user.isOrgOwner,
          userPermissions: user.permissions,
          pathname,
        }).allowed;
      }
    };
  }, [session, status]);

  return permissions;
}