/**
 * src/core/lib/permission.ts
 * * CORE AUTHORIZATION & RBAC ENGINE
 * Synchronized with Prisma Schema
 */

import {
  Role,
  PermissionAction,
  AuthorizedPersonnel,
  CriticalAction,
  Resource,
} from "@prisma/client";

/**
 * =========================================================
 * EXPORTS & CONSTANTS
 * =========================================================
 */
export const RESOURCES = Resource;

/**
 * ROLE HIERARCHY
 * Defines authority levels for management and visibility checks.
 * Higher weight = Higher authority.
 */
export const ROLE_WEIGHT: Record<Role, number> = {
  DEV: 100,       // System Superuser
  ADMIN: 50,      // Organization Admin
  MANAGER: 40,    // Branch/Department Manager
  AUDITOR: 35,    // Compliance/Finance oversight
  INVENTORY: 30,  // Warehouse/Stock control
  SALES: 20,      // Front-end sales
  CASHIER: 10,    // Point of Sale operations
} as const;

/**
 * DEFAULT TERMINALS
 * Determines the landing page after login based on role.
 */
export const DEFAULT_TERMINALS: Record<Role, string> = {
  DEV: "/db-inspector",
  ADMIN: "/",
  MANAGER: "/",
  AUDITOR: "/audit",
  INVENTORY: "/inventory",
  SALES: "/pos",
  CASHIER: "/pos",
} as const;

export type Resources = Resource;

export type ManagementAction = 
  | "UPDATE_ROLE" 
  | "UPDATE_STATUS" 
  | "DELETE" 
  | "RESET_PASSWORD" 
  | "TRANSFER_BRANCH";

/**
 * =========================================================
 * DEFAULT ROLE PERMISSIONS (RBAC Baseline)
 * =========================================================
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<
  Role,
  Partial<Record<Resource, PermissionAction[]>>
> = {
  DEV: {
    [Resource.SETTINGS]: [PermissionAction.READ, PermissionAction.UPDATE],
    [Resource.AUDIT]: [PermissionAction.READ],
    [Resource.PERSONNEL]: [PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE],
  },
  ADMIN: {
    [Resource.INVOICE]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE, PermissionAction.VOID, PermissionAction.APPROVE, PermissionAction.EXPORT],
    [Resource.STOCK]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE, PermissionAction.APPROVE],
    [Resource.PERSONNEL]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE],
    [Resource.BRANCH]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
    [Resource.AUDIT]: [PermissionAction.READ, PermissionAction.EXPORT],
    [Resource.SETTINGS]: [PermissionAction.READ, PermissionAction.UPDATE],
    [Resource.FINANCE]: [PermissionAction.READ, PermissionAction.CREATE, PermissionAction.UPDATE],
  },
  MANAGER: {
    [Resource.INVOICE]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.VOID, PermissionAction.APPROVE],
    [Resource.STOCK]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.APPROVE],
    [Resource.PERSONNEL]: [PermissionAction.READ, PermissionAction.UPDATE],
    [Resource.CUSTOMER]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
    [Resource.EXPENSE]: [PermissionAction.CREATE, PermissionAction.READ],
  },
  AUDITOR: {
    [Resource.INVOICE]: [PermissionAction.READ, PermissionAction.EXPORT],
    [Resource.STOCK]: [PermissionAction.READ],
    [Resource.AUDIT]: [PermissionAction.READ, PermissionAction.EXPORT],
    [Resource.REPORT]: [PermissionAction.READ, PermissionAction.EXPORT],
    [Resource.FINANCE]: [PermissionAction.READ],
  },
  INVENTORY: {
    [Resource.STOCK]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
    [Resource.PRODUCT]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
    [Resource.PROCUREMENT]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
  },
  SALES: {
    [Resource.INVOICE]: [PermissionAction.CREATE, PermissionAction.READ],
    [Resource.CUSTOMER]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
    [Resource.PRODUCT]: [PermissionAction.READ],
  },
  CASHIER: {
    [Resource.INVOICE]: [PermissionAction.CREATE, PermissionAction.READ],
    [Resource.PRODUCT]: [PermissionAction.READ],
  },
};

/**
 * =========================================================
 * NEXTAUTH PERMISSION MATRIX
 * =========================================================
 */
export const ROLE_PERMISSIONS_MATRIX: Record<Role, string[]> = (
  Object.keys(DEFAULT_ROLE_PERMISSIONS) as Role[]
).reduce((acc, role) => {
  if (role === Role.DEV || role === Role.ADMIN) {
    acc[role] = ["*:*"];
    return acc;
  }

  const permissions: string[] = [];
  const resourcesMap = DEFAULT_ROLE_PERMISSIONS[role];

  Object.entries(resourcesMap).forEach(([resource, actions]) => {
    const actionList = actions as PermissionAction[];
    actionList.forEach((action) => {
      permissions.push(`${action.toUpperCase()}:${resource.toUpperCase()}`);
    });
  });

  acc[role] = permissions;
  return acc;
}, {} as Record<Role, string[]>);

/**
 * =========================================================
 * CRITICAL ACTION REQUIREMENTS 
 * =========================================================
 */
export const ACTION_REQUIREMENTS: Record<CriticalAction, Role> = {
  USER_LOCK_UNLOCK: Role.MANAGER,
  EMAIL_CHANGE: Role.ADMIN,
  PASSWORD_CHANGE: Role.ADMIN,
  PRICE_UPDATE: Role.MANAGER,
  STOCK_ADJUST: Role.MANAGER,
  STOCK_TRANSFER: Role.MANAGER,
  VOID_INVOICE: Role.MANAGER,
};

/**
 * =========================================================
 * UTILITIES & HELPERS
 * =========================================================
 */

/**
 * Checks if a user has an explicit permission string (e.g., "READ:INVOICE")
 */
export function canPerform(
  userPermissions: string[],
  action: PermissionAction,
  resources: Resource
): boolean {
  if (!userPermissions || userPermissions.length === 0) return false;
  
  const actionUpper = action.toUpperCase();
  const resourcesUpper = resources.toUpperCase();
  const requiredAuth = `${actionUpper}:${resourcesUpper}`;
  
  return userPermissions.some((p) => {
    const perm = p.toUpperCase();
    return (
      perm === requiredAuth || 
      perm === "*:*" || 
      perm === `*:${resourcesUpper}` ||
      perm === `${actionUpper}:*`
    );
  });
}

/**
 * Checks the default role-based baseline for a specific permission.
 * FIX: Removed "as any" cast to satisfy @typescript-eslint/no-explicit-any.
 */
export function hasDefaultPermission(
  role: Role,
  action: PermissionAction,
  resources: Resource
): boolean {
  const rolePermissions = DEFAULT_ROLE_PERMISSIONS[role];
  const permissionsForResource = rolePermissions[resources];
  return permissionsForResource?.includes(action) ?? false;
}

/**
 * Validates visibility of audit/log actions based on hierarchy.
 */
export function canSeeAction(recipientRole: Role, actorRole: Role): boolean {
  if (([Role.DEV, Role.ADMIN, Role.AUDITOR] as Role[]).includes(recipientRole)) {
    return true;
  }
  if (recipientRole === Role.MANAGER) {
    return ROLE_WEIGHT[actorRole] < ROLE_WEIGHT[Role.MANAGER];
  }
  return false;
}

/**
 * Validates if one user is authorized to perform management actions on another.
 */
export function validateManagementRights(
  requester: { id: string; role: Role; isOrgOwner: boolean },
  target: Pick<AuthorizedPersonnel, "id" | "role" | "isOrgOwner">,
  action: ManagementAction
): { authorized: boolean; reason?: string } {
  if (requester.id === target.id) {
    return { authorized: false, reason: "Security Policy: You cannot modify your own management rights." };
  }
  if (target.isOrgOwner) {
    return { authorized: false, reason: "Organization owners cannot be modified by staff members." };
  }
  if (requester.isOrgOwner) return { authorized: true };

  const requesterWeight = ROLE_WEIGHT[requester.role] || 0;
  const targetWeight = ROLE_WEIGHT[target.role] || 0;

  if (requesterWeight <= targetWeight) {
    return { authorized: false, reason: `Insufficient Authority: A ${requester.role} cannot manage a ${target.role}.` };
  }
  if (action === "DELETE" && requester.role === Role.MANAGER) {
    return { authorized: false, reason: "Access Denied: Managers can deactivate staff but lack deletion privileges." };
  }
  return { authorized: true };
}

/**
 * Determines if an action requires an approval request based on the actor's role.
 */
export function actionRequiresApproval(role: Role, action: CriticalAction): boolean {
  const requiredRole = ACTION_REQUIREMENTS[action];
  if (!requiredRole) return false;
  return ROLE_WEIGHT[role] < ROLE_WEIGHT[requiredRole];
}

type AuthorizeParams = {
  role: Role;
  isOrgOwner?: boolean;
  action?: PermissionAction;
  resources?: Resource;
  userPermissions?: string[]; 
  criticalAction?: CriticalAction;
};

/**
 * MAIN AUTHORIZATION HANDLER
 * Primary entry point for API and Server Action security checks.
 */
export function authorize({
  role,
  isOrgOwner = false,
  action,
  resources,
  userPermissions = [],
  criticalAction,
}: AuthorizeParams): {
  allowed: boolean;
  requiresApproval?: boolean;
  reason?: string;
} {
  // Org Owners bypass all checks
  if (isOrgOwner) return { allowed: true };

  // Resource-level permission check
  if (action && resources) {
    const explicit = canPerform(userPermissions, action, resources);
    const fallback = hasDefaultPermission(role, action, resources);

    if (!explicit && !fallback) {
      return { 
        allowed: false, 
        reason: `Insufficient permissions for ${resources} ${action}.`,
      };
    }
  }

  // Critical action approval check
  if (criticalAction) {
    const needsApproval = actionRequiresApproval(role, criticalAction);
    if (needsApproval) {
      return { 
        allowed: false, 
        requiresApproval: true, 
        reason: "This action requires higher-level approval." 
      };
    }
  }

  return { allowed: true };
}

/**
 * Boolean wrapper for critical action permission checks.
 */
export function canPerformAction(role: Role, action: CriticalAction): boolean {
  return !actionRequiresApproval(role, action);
}