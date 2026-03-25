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
 * =========================================================
 */
export const ROLE_WEIGHT: Record<Role, number> = {
  DEV: 0,
  CASHIER: 10,
  SALES: 20,
  INVENTORY: 30,
  AUDITOR: 35,
  MANAGER: 40,
  ADMIN: 50,
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
  ADMIN: {
    INVOICE: [
      PermissionAction.CREATE,
      PermissionAction.READ,
      PermissionAction.UPDATE,
      PermissionAction.DELETE,
      PermissionAction.VOID,
      PermissionAction.APPROVE,
      PermissionAction.EXPORT,
    ],
    STOCK: [
      PermissionAction.CREATE,
      PermissionAction.READ,
      PermissionAction.UPDATE,
      PermissionAction.DELETE,
      PermissionAction.APPROVE,
    ],
    AUDIT: [PermissionAction.READ, PermissionAction.EXPORT],
  },
  MANAGER: {
    INVOICE: [
      PermissionAction.CREATE,
      PermissionAction.READ,
      PermissionAction.UPDATE,
      PermissionAction.VOID,
      PermissionAction.APPROVE,
    ],
    STOCK: [
      PermissionAction.CREATE,
      PermissionAction.READ,
      PermissionAction.UPDATE,
      PermissionAction.APPROVE,
    ],
  },
  AUDITOR: {
    INVOICE: [PermissionAction.READ, PermissionAction.EXPORT],
    STOCK: [PermissionAction.READ],
    AUDIT: [PermissionAction.READ, PermissionAction.EXPORT],
    REPORT: [PermissionAction.READ, PermissionAction.EXPORT],
  },
  INVENTORY: {
    STOCK: [
      PermissionAction.CREATE,
      PermissionAction.READ,
      PermissionAction.UPDATE,
    ],
    PRODUCT: [
      PermissionAction.CREATE,
      PermissionAction.READ,
      PermissionAction.UPDATE,
    ],
  },
  SALES: {
    INVOICE: [PermissionAction.CREATE, PermissionAction.READ],
    CUSTOMER: [
      PermissionAction.CREATE,
      PermissionAction.READ,
      PermissionAction.UPDATE,
    ],
  },
  CASHIER: {
    INVOICE: [PermissionAction.CREATE, PermissionAction.READ],
  },
  DEV: {
    SETTINGS: [PermissionAction.READ, PermissionAction.UPDATE],
  },
};

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
 * PAGE-LEVEL RBAC
 * =========================================================
 */
export const PAGE_PERMISSIONS = {
  "/dashboard": [
    Role.ADMIN,
    Role.MANAGER,
    Role.SALES,
    Role.CASHIER,
    Role.INVENTORY,
    Role.AUDITOR,
  ],
  "/dashboard/admin": [Role.ADMIN, Role.MANAGER],
  "/dashboard/inventory": [
    Role.ADMIN,
    Role.MANAGER,
    Role.INVENTORY,
    Role.AUDITOR,
  ],
  "/dashboard/sales": [
    Role.ADMIN,
    Role.MANAGER,
    Role.SALES,
    Role.AUDITOR,
  ],
  "/dashboard/audit": [Role.ADMIN, Role.AUDITOR],
  "/pos": [Role.ADMIN, Role.MANAGER, Role.SALES, Role.CASHIER],
} as const satisfies Record<string, readonly Role[]>;

export const MANAGEMENT_ROUTES = ["/dashboard/admin"] as const;

export const PERSONAL_ROUTES = [
  "/dashboard/profile",
  "/dashboard/settings",
] as const;

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
  const roleRules = DEFAULT_ROLE_PERMISSIONS[role];
  if (!roleRules) return false;

  return roleRules[resource]?.includes(action) ?? false;
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
    return {
      authorized: false,
      reason: "Use profile settings for self-updates.",
    };
  }

  if (requester.isOrgOwner) return { authorized: true };

  if (requester.role === Role.ADMIN) {
    if (target.isOrgOwner) {
      return {
        authorized: false,
        reason: "Cannot modify organization owner.",
      };
    }
    return { authorized: true };
  }

  if (requester.role === Role.MANAGER) {
    if (target.role === Role.ADMIN || target.isOrgOwner) {
      return { authorized: false, reason: "Insufficient clearance." };
    }
  }

  const allowed =
    ROLE_WEIGHT[requester.role] > ROLE_WEIGHT[target.role];

  return {
    authorized: allowed,
    reason: allowed
      ? undefined
      : "You do not have authority over this role.",
  };
}

/**
 * =========================================================
 * PAGE ACCESS
 * =========================================================
 */
export function hasPagePermission(
  role: Role,
  pathname: string,
  isOrgOwner: boolean = false
): boolean {
  const path = normalizePath(pathname);

  if (isOrgOwner) return true;

  if (MANAGEMENT_ROUTES.some((p) => path.startsWith(p))) {
    return role === Role.ADMIN;
  }

  if (PERSONAL_ROUTES.some((p) => path.startsWith(p))) {
    return true;
  }

  const sorted = Object.entries(PAGE_PERMISSIONS).sort(
    (a, b) => b[0].length - a[0].length
  );

  const match = sorted.find(
    ([p]) => path === p || path.startsWith(`${p}/`)
  );

  if (!match) return false;

  return match[1].includes(role);
}

/**
 * =========================================================
 * APPROVAL CHECK
 * =========================================================
 */
export function actionRequiresApproval(
  role: Role,
  action: CriticalAction
): boolean {
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
  // 1. Org Owner override
  if (isOrgOwner) return { allowed: true };

  // 2. Page-level check
  if (pathname && !hasPagePermission(role, pathname, isOrgOwner)) {
    return { allowed: false, reason: "Access denied." };
  }

  // 3. Resource permission check
  if (action && resource) {
    const explicit = canPerform(userPermissions, action, resource);
    const fallback = hasDefaultPermission(
      role,
      action,
      resource as ResourceType
    );

    if (!explicit && !fallback) {
      return {
        allowed: false,
        reason: "Missing required permission.",
      };
    }
  }

  // 4. Critical action check
  if (criticalAction) {
    const needsApproval = actionRequiresApproval(role, criticalAction);

    if (needsApproval) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: "Action requires approval.",
      };
    }
  }

  return { allowed: true };
}

/**
 * =========================================================
 * OPTIONAL HELPERS
 * =========================================================
 */
export function canPerformAction(
  role: Role,
  action: CriticalAction
): boolean {
  return !actionRequiresApproval(role, action);
}