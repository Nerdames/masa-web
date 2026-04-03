import {
  Role,
  PermissionAction,
  Permission,
  AuthorizedPersonnel,
  CriticalAction,
} from "@prisma/client";

/**
 * =========================================================
 * ROLE HIERARCHY
 * Higher weight = Higher authority.
 * =========================================================
 */
export const ROLE_WEIGHT: Record<Role, number> = {
  DEV: 100,      // System Superuser
  ADMIN: 50,     // Organization Admin
  MANAGER: 40,   // Branch/Department Manager
  AUDITOR: 35,   // Compliance/Finance oversight
  INVENTORY: 30, // Warehouse/Stock control
  SALES: 20,     // Front-end sales
  CASHIER: 10,   // Point of Sale operations
};

/**
 * =========================================================
 * RESOURCES
 * =========================================================
 */
export const RESOURCES = {
  INVOICE: "INVOICE",
  STOCK: "STOCK",
  PRODUCT: "PRODUCT",
  CUSTOMER: "CUSTOMER",
  EXPENSE: "EXPENSE",
  REPORT: "REPORT",
  AUDIT: "AUDIT",
  SETTINGS: "SETTINGS",
  BRANCH: "BRANCH",
  PERSONNEL: "PERSONNEL",
} as const;

export type ResourceType = keyof typeof RESOURCES;

/**
 * =========================================================
 * DEFAULT ROLE PERMISSIONS (Fallback Layer)
 * =========================================================
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<
  Role,
  Partial<Record<ResourceType, PermissionAction[]>>
> = {
  DEV: {
    SETTINGS: [PermissionAction.READ, PermissionAction.UPDATE],
    AUDIT: [PermissionAction.READ],
  },
  ADMIN: {
    INVOICE: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE, PermissionAction.VOID, PermissionAction.APPROVE, PermissionAction.EXPORT],
    STOCK: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE, PermissionAction.APPROVE],
    PERSONNEL: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE],
    BRANCH: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
    AUDIT: [PermissionAction.READ, PermissionAction.EXPORT],
    SETTINGS: [PermissionAction.READ, PermissionAction.UPDATE],
  },
  MANAGER: {
    INVOICE: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.VOID, PermissionAction.APPROVE],
    STOCK: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.APPROVE],
    PERSONNEL: [PermissionAction.READ, PermissionAction.UPDATE], 
  },
  AUDITOR: {
    INVOICE: [PermissionAction.READ, PermissionAction.EXPORT],
    STOCK: [PermissionAction.READ],
    AUDIT: [PermissionAction.READ, PermissionAction.EXPORT],
    REPORT: [PermissionAction.READ, PermissionAction.EXPORT],
  },
  INVENTORY: {
    STOCK: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
    PRODUCT: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
  },
  SALES: {
    INVOICE: [PermissionAction.CREATE, PermissionAction.READ],
    CUSTOMER: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
  },
  CASHIER: {
    INVOICE: [PermissionAction.CREATE, PermissionAction.READ],
  },
};

/**
 * =========================================================
 * PAGE-LEVEL RBAC (Browser URLs)
 * =========================================================
 */
export const PAGE_PERMISSIONS = {
  "/admin": [Role.ADMIN, Role.MANAGER, Role.DEV],
  "/admin/overview": [Role.ADMIN, Role.MANAGER, Role.DEV],
  "/admin/personnels": [Role.ADMIN, Role.MANAGER, Role.DEV], 
  "/admin/branches": [Role.ADMIN, Role.DEV],
  "/audit": [Role.ADMIN, Role.AUDITOR, Role.DEV],
  "/inventory": [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.AUDITOR, Role.DEV],
  "/pos": [Role.ADMIN, Role.MANAGER, Role.SALES, Role.CASHIER, Role.DEV],
  "/db-inspector": [Role.DEV],
  "/logs": [Role.DEV, Role.ADMIN],
  "/monitoring": [Role.DEV],
} as const satisfies Record<string, readonly Role[]>;

export const MANAGEMENT_ROUTES = ["/admin/branches", "/db-inspector"];
export const PERSONAL_ROUTES = ["/settings", "/feedback"] as const;

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
 * UTILITIES
 * =========================================================
 */
function normalizePath(path: string) {
  return path.replace(/\/+$/, "") || "/";
}

/**
 * =========================================================
 * PERMISSION HELPERS
 * =========================================================
 */
export function canPerform(
  userPermissions: Permission[],
  action: PermissionAction,
  resource: string
): boolean {
  return userPermissions.some(
    (p) => p.action === action && p.resource === resource
  );
}

export function hasDefaultPermission(
  role: Role,
  action: PermissionAction,
  resource: ResourceType
): boolean {
  return DEFAULT_ROLE_PERMISSIONS[role]?.[resource]?.includes(action) ?? false;
}

/**
 * VISIBILITY HIERARCHY
 * Determines if a recipient has the authority to see an action performed by an actor.
 */
export function canSeeAction(recipientRole: Role, actorRole: Role): boolean {
  // 1. Devs and Admins see everything.
  if (recipientRole === Role.DEV || recipientRole === Role.ADMIN) return true;

  // 2. Auditors see everything for compliance/oversight.
  if (recipientRole === Role.AUDITOR) return true;

  // 3. Managers see anyone with a strictly lower weight (Cashier, Sales, Inventory).
  // They cannot see actions by other Managers, Admins, or Devs.
  if (recipientRole === Role.MANAGER) {
    return ROLE_WEIGHT[actorRole] < ROLE_WEIGHT.MANAGER;
  }

  // 4. Standard personnel (Cashier/Sales) generally don't see system notifications.
  return false;
}

/**
 * =========================================================
 * MANAGEMENT VALIDATION
 * =========================================================
 */
export function validateManagementRights(
  requester: { id: string; role: Role; isOrgOwner: boolean },
  target: Pick<AuthorizedPersonnel, "id" | "role" | "isOrgOwner">
): { authorized: boolean; reason?: string } {
  if (requester.id === target.id) {
    return { authorized: false, reason: "Use profile settings for self-updates." };
  }

  if (requester.isOrgOwner) return { authorized: true };

  if (target.isOrgOwner) {
    return { authorized: false, reason: "Organization owners cannot be modified by staff." };
  }

  const allowed = ROLE_WEIGHT[requester.role] > ROLE_WEIGHT[target.role];

  return {
    authorized: allowed,
    reason: allowed ? undefined : "You do not have authority over this role rank.",
  };
}

/**
 * =========================================================
 * PAGE ACCESS ENGINE
 * =========================================================
 */
export function hasPagePermission(
  role: Role,
  pathname: string,
  isOrgOwner: boolean = false
): boolean {
  const path = normalizePath(pathname);
  if (isOrgOwner) return true;

  if (PERSONAL_ROUTES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return true;
  }

  if (MANAGEMENT_ROUTES.some((p) => path.startsWith(p))) {
    return role === Role.ADMIN || role === Role.DEV;
  }

  const sorted = Object.entries(PAGE_PERMISSIONS).sort((a, b) => b[0].length - a[0].length);
  const match = sorted.find(([p]) => path === p || path.startsWith(`${p}/`));

  if (!match) return false;
  return (match[1] as readonly Role[]).includes(role);
}

/**
 * =========================================================
 * APPROVAL CHECK
 * =========================================================
 */
export function actionRequiresApproval(role: Role, action: CriticalAction): boolean {
  const required = ACTION_REQUIREMENTS[action];
  if (!required) return false;

  return ROLE_WEIGHT[role] < ROLE_WEIGHT[required];
}

/**
 * =========================================================
 * UNIFIED AUTHORIZATION ENGINE
 * =========================================================
 */
type AuthorizeParams = {
  role: Role;
  isOrgOwner?: boolean;
  pathname?: string;
  action?: PermissionAction;
  resource?: ResourceType | string;
  userPermissions?: Permission[];
  criticalAction?: CriticalAction;
};

export function authorize({
  role,
  isOrgOwner = false,
  pathname,
  action,
  resource,
  userPermissions = [],
  criticalAction,
}: AuthorizeParams): {
  allowed: boolean;
  requiresApproval?: boolean;
  reason?: string;
} {
  if (isOrgOwner) return { allowed: true };

  if (pathname && !hasPagePermission(role, pathname, isOrgOwner)) {
    return { allowed: false, reason: "Access denied to this module." };
  }

  if (action && resource) {
    const explicit = canPerform(userPermissions, action, resource);
    const fallback = hasDefaultPermission(role, action, resource as ResourceType);

    if (!explicit && !fallback) {
      return { allowed: false, reason: "Insufficient resource permissions." };
    }
  }

  if (criticalAction) {
    const needsApproval = actionRequiresApproval(role, criticalAction);
    if (needsApproval) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: "This action requires manager approval.",
      };
    }
  }

  return { allowed: true };
}

export function canPerformAction(role: Role, action: CriticalAction): boolean {
  return !actionRequiresApproval(role, action);
}