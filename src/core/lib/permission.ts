/**
 * src/core/lib/permission.ts
 * CORE AUTHORIZATION & RBAC ENGINE (V3.2 - PRODUCTION READY)
 * Synchronized with Prisma Schema and fortified for strict auditing.
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
 * Defines authority levels for management and visibility checks. [cite: 1513]
 */
export const ROLE_WEIGHT: Record<Role, number> = {
  DEV: 100,       // System Superuser [cite: 1513]
  ADMIN: 50,      // Organization Admin [cite: 1513]
  MANAGER: 40,    // Branch/Department Manager [cite: 1513]
  AUDITOR: 35,    // Compliance/Finance oversight [cite: 1513]
  INVENTORY: 30,  // Warehouse/Stock control [cite: 1513]
  SALES: 20,      // Front-end sales [cite: 1513]
  CASHIER: 10,    // Point of Sale operations [cite: 1513]
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
 * Fortified with full Resource enum synchronization and 
 * mandatory Product access for Managers. [cite: 1513]
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
    [Resource.PRODUCT]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE],
    [Resource.PERSONNEL]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE],
    [Resource.BRANCH]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
    [Resource.AUDIT]: [PermissionAction.READ, PermissionAction.EXPORT],
    [Resource.SETTINGS]: [PermissionAction.READ, PermissionAction.UPDATE],
    [Resource.FINANCE]: [PermissionAction.READ, PermissionAction.CREATE, PermissionAction.UPDATE],
    [Resource.VENDOR]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE],
  },
  MANAGER: {
    [Resource.INVOICE]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.VOID, PermissionAction.APPROVE],
    [Resource.STOCK]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.APPROVE],
    [Resource.PRODUCT]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE],
    [Resource.PERSONNEL]: [PermissionAction.READ, PermissionAction.UPDATE],
    [Resource.CUSTOMER]: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
    [Resource.EXPENSE]: [PermissionAction.CREATE, PermissionAction.READ],
    [Resource.VENDOR]: [PermissionAction.READ, PermissionAction.UPDATE],
    [Resource.REPORT]: [PermissionAction.READ, PermissionAction.EXPORT],
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
    [Resource.VENDOR]: [PermissionAction.READ],
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
 * Automatically generates standard permission strings for JWT session.
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
 * Updated to include all items in the CriticalAction Enum.
 * =========================================================
 */
export const ACTION_REQUIREMENTS: Record<CriticalAction, Role> = {
  // Account & Security (Admin Level)
  EMAIL_CHANGE: Role.ADMIN,
  PASSWORD_CHANGE: Role.ADMIN,
  AUTHORIZATION_APPROVED: Role.ADMIN,
  AUTHORIZATION_REJECTED: Role.ADMIN,
  SUSPICIOUS_LOGIN: Role.ADMIN,
  FAILED_LOGIN_LOCKOUT: Role.ADMIN,

  // Personnel & Access (Manager Level)
  USER_LOCK_UNLOCK: Role.MANAGER,
  
  // Finance & Inventory Operations (Manager Level)
  PRICE_UPDATE: Role.MANAGER,
  STOCK_ADJUST: Role.MANAGER,
  STOCK_TRANSFER: Role.MANAGER,
  VOID_INVOICE: Role.MANAGER,
  EXPENSE_VOIDING: Role.MANAGER,
  REFUND_PROCESS: Role.MANAGER,
  STOCK_TAKE_ADJUST: Role.MANAGER,

  // Approval Workflow Management (Manager Level)
  APPROVAL_REQUESTED: Role.MANAGER,
  APPROVAL_GRANTED: Role.MANAGER,
  APPROVAL_DENIED: Role.MANAGER,
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
  userPermissions: string[] | null | undefined,
  action: PermissionAction,
  resources: Resource
): boolean {
  const perms = userPermissions || [];
  if (perms.length === 0) return false;
  
  const actionUpper = action.toUpperCase();
  const resourcesUpper = resources.toUpperCase();
  const requiredAuth = `${actionUpper}:${resourcesUpper}`;
  
  return perms.some((p) => {
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
 */
export function hasDefaultPermission(
  role: Role,
  action: PermissionAction,
  resources: Resource
): boolean {
  const rolePermissions = DEFAULT_ROLE_PERMISSIONS[role];
  if (!rolePermissions) return false;
  const permissionsForResource = rolePermissions[resources];
  return permissionsForResource?.includes(action) ?? false;
}

/**
 * Validates visibility based on hierarchy weight.
 */
export function canSeeAction(recipientRole: Role, actorRole: Role): boolean {
  if (([Role.DEV, Role.ADMIN, Role.AUDITOR] as Role[]).includes(recipientRole)) {
    return true;
  }
  if (recipientRole === Role.MANAGER) {
    return (ROLE_WEIGHT[actorRole] || 0) < ROLE_WEIGHT[Role.MANAGER];
  }
  return false;
}

/**
 * Validates management rights for staff modification actions.
 */
export function validateManagementRights(
  requester: { id: string; role: Role; isOrgOwner: boolean },
  target: Pick<AuthorizedPersonnel, "id" | "role" | "isOrgOwner">,
  action: ManagementAction
): { authorized: boolean; reason?: string } {
  if (requester.id === target.id) {
    return { authorized: false, reason: "Security Policy: You cannot self-modify management rights." };
  }
  if (target.isOrgOwner) {
    return { authorized: false, reason: "Security Policy: Organization owners are immutable by staff." };
  }
  if (requester.isOrgOwner) return { authorized: true };

  const requesterWeight = ROLE_WEIGHT[requester.role] || 0;
  const targetWeight = ROLE_WEIGHT[target.role] || 0;

  if (requesterWeight <= targetWeight) {
    return { authorized: false, reason: `Insufficient Authority: Your role (${requester.role}) cannot manage a ${target.role}.` };
  }
  if (action === "DELETE" && requester.role === Role.MANAGER) {
    return { authorized: false, reason: "Access Denied: Managers lack system deletion privileges." };
  }
  return { authorized: true };
}

/**
 * Determines if an action requires an approval workflow.
 */
export function actionRequiresApproval(role: Role, action: CriticalAction): boolean {
  const requiredRole = ACTION_REQUIREMENTS[action];
  if (!requiredRole) return false;
  return (ROLE_WEIGHT[role] || 0) < ROLE_WEIGHT[requiredRole];
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
 * Use this in all API routes and Server Actions.
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
  // 1. Org Owners bypass all resource restrictions [cite: 1522]
  if (isOrgOwner) return { allowed: true };

  // 2. Resource-level permission check
  if (action && resources) {
    const explicit = canPerform(userPermissions, action, resources);
    const fallback = hasDefaultPermission(role, action, resources);

    if (!explicit && !fallback) {
      return { 
        allowed: false, 
        reason: `Insufficient permissions for ${resources}:${action}.`,
      };
    }
  }

  // 3. Critical action approval check [cite: 1528]
  if (criticalAction) {
    const needsApproval = actionRequiresApproval(role, criticalAction);
    if (needsApproval) {
      return { 
        allowed: false, 
        requiresApproval: true, 
        reason: "This operation requires authorized approval." 
      };
    }
  }

  return { allowed: true };
}

/**
 * Quick boolean check for critical actions.
 */
export function canPerformAction(role: Role, action: CriticalAction): boolean {
  return !actionRequiresApproval(role, action);
}