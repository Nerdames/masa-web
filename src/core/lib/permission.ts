import {
  Role,
  PermissionAction,
  AuthorizedPersonnel,
  CriticalAction,
} from "@prisma/client";

/**
 * =========================================================
 * ROLE HIERARCHY
 * Higher weight = Higher authority.
 * Used for management validation and visibility logic.
 * =========================================================
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
 * =========================================================
 * DEFAULT TERMINALS (Fallback Routing)
 * Maps each role to their designated functional workspace.
 * Prevents "Blank Pages" and infinite redirect loops.
 * =========================================================
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

/**
 * =========================================================
 * RESOURCE IDENTIFIERS
 * Matches the 'resource' section of the string-based permission.
 * =========================================================
 */
export const RESOURCES = {
  INVOICE: "INVOICE",
  STOCK: "STOCK",
  PRODUCT: "PRODUCT",
  CUSTOMER: "CUSTOMER",
  EXPENSE: "EXPENSE",
  PROCUREMENT: "PROCUREMENT",
  VENDOR: "VENDOR",
  REPORT: "REPORT",
  AUDIT: "AUDIT",
  SETTINGS: "SETTINGS",
  BRANCH: "BRANCH",
  PERSONNEL: "PERSONNEL",
  FINANCE: "FINANCE",
} as const;

export type ResourceType = (typeof RESOURCES)[keyof typeof RESOURCES];

export type ManagementAction = 
  | "UPDATE_ROLE" 
  | "UPDATE_STATUS" 
  | "DELETE" 
  | "RESET_PASSWORD" 
  | "TRANSFER_BRANCH";

/**
 * =========================================================
 * DEFAULT ROLE PERMISSIONS (Fallback Layer)
 * Hardcoded baseline permissions for each role.
 * =========================================================
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<
  Role,
  Partial<Record<ResourceType, PermissionAction[]>>
> = {
  DEV: {
    SETTINGS: [PermissionAction.READ, PermissionAction.UPDATE],
    AUDIT: [PermissionAction.READ],
    PERSONNEL: [PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE],
  },
  ADMIN: {
    INVOICE: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE, PermissionAction.VOID, PermissionAction.APPROVE, PermissionAction.EXPORT],
    STOCK: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE, PermissionAction.APPROVE],
    PERSONNEL: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE],
    BRANCH: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
    AUDIT: [PermissionAction.READ, PermissionAction.EXPORT],
    SETTINGS: [PermissionAction.READ, PermissionAction.UPDATE],
    FINANCE: [PermissionAction.READ, PermissionAction.CREATE, PermissionAction.UPDATE],
  },
  MANAGER: {
    INVOICE: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.VOID, PermissionAction.APPROVE],
    STOCK: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.APPROVE],
    PERSONNEL: [PermissionAction.READ, PermissionAction.UPDATE],
    CUSTOMER: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
    EXPENSE: [PermissionAction.CREATE, PermissionAction.READ],
  },
  AUDITOR: {
    INVOICE: [PermissionAction.READ, PermissionAction.EXPORT],
    STOCK: [PermissionAction.READ],
    AUDIT: [PermissionAction.READ, PermissionAction.EXPORT],
    REPORT: [PermissionAction.READ, PermissionAction.EXPORT],
    FINANCE: [PermissionAction.READ],
  },
  INVENTORY: {
    STOCK: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
    PRODUCT: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
    PROCUREMENT: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
  },
  SALES: {
    INVOICE: [PermissionAction.CREATE, PermissionAction.READ],
    CUSTOMER: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE],
    PRODUCT: [PermissionAction.READ],
  },
  CASHIER: {
    INVOICE: [PermissionAction.CREATE, PermissionAction.READ],
    PRODUCT: [PermissionAction.READ],
  },
};

/**
 * =========================================================
 * PAGE-LEVEL RBAC (Browser URLs)
 * =========================================================
 */
export const PAGE_PERMISSIONS = {
  // Org Owner & System Configs
  "/myorg": [Role.ADMIN, Role.MANAGER, Role.DEV],

  // Admin Module
  "/admin": [Role.ADMIN, Role.MANAGER, Role.DEV],
  
  // Audit Module
  "/audit": [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV],
  
  // Primary Operations Modules
  "/": [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.SALES, Role.CASHIER, Role.AUDITOR, Role.DEV],
  "/inventory": [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.AUDITOR, Role.DEV],
  "/pos": [Role.ADMIN, Role.MANAGER, Role.SALES, Role.CASHIER, Role.DEV],
  "/products": [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.SALES, Role.CASHIER, Role.DEV],

  // Shared Modules
  "/notifications": [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.SALES, Role.CASHIER, Role.AUDITOR, Role.DEV],
  
  // Developer & System Tools
  "/tools": [Role.ADMIN, Role.MANAGER, Role.DEV],
  "/db-inspector": [Role.DEV],
  "/logs": [Role.DEV, Role.ADMIN, Role.MANAGER],
} as const satisfies Record<string, readonly Role[]>;

/**
 * Routes that trigger "Management Mode" structural layouts.
 */
export const MANAGEMENT_ROUTES = [
  "/admin",
  "/personnel", 
  "/branches", 
  "/db-inspector"
] as const;

/**
 * Routes accessible by ANY authenticated user.
 */
export const PERSONAL_ROUTES = [
  "/profile",
  "/settings", 
  "/feedback", 
  "/support"
] as const;

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

export function normalizePath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

/**
 * STANDARDIZED ROUTING RESOLVER
 */
export function getFallbackRoute(
  role?: Role, 
  state?: 'VALID' | 'LOCKED' | 'DISABLED' | 'EXPIRED' | 'PASSWORD_RESET'
): string {
  if (state === 'PASSWORD_RESET') return '/reset-password';
  if (!role || state === 'LOCKED' || state === 'DISABLED' || state === 'EXPIRED') {
    return `/signin${state ? `?error=ACCOUNT_${state}` : ''}`;
  }
  return DEFAULT_TERMINALS[role] || "/";
}

/**
 * Validates dynamic DB permissions based on session string arrays.
 */
export function canPerform(
  userPermissions: string[],
  action: PermissionAction,
  resource: string
): boolean {
  if (!userPermissions || userPermissions.length === 0) return false;
  
  const actionUpper = action.toUpperCase();
  const resourceUpper = resource.toUpperCase();
  const requiredAuth = `${actionUpper}:${resourceUpper}`;
  
  return userPermissions.some((p) => {
    const perm = p.toUpperCase();
    return (
      perm === requiredAuth || 
      perm === "*:*" || 
      perm === `*:${resourceUpper}` ||
      perm === `${actionUpper}:*`
    );
  });
}

/**
 * Checks hardcoded default permissions.
 */
export function hasDefaultPermission(
  role: Role,
  action: PermissionAction,
  resource: ResourceType
): boolean {
  return DEFAULT_ROLE_PERMISSIONS[role][resource]?.includes(action) ?? false;
}

/**
 * LOG VISIBILITY
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
 * MANAGEMENT RIGHTS
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
 * PAGE PERMISSIONS: Validates URL access dynamically.
 */
export function hasPagePermission(
  role: Role,
  pathname: string,
  isOrgOwner: boolean = false
): boolean {
  // 1. Organization Owners have unrestricted access to all modules
  if (isOrgOwner) return true;
  
  const path = normalizePath(pathname);

  // 2. Allow unrestricted access to personal routes (Profile, Settings, etc.)
  if (PERSONAL_ROUTES.some((p) => path === p || path.startsWith(`${p}/`))) return true;

  // 3. Special handling for the root path: 
  // If the user reaches "/", they are permitted (Middleware will then redirect them to their terminal)
  if (path === "/") return true;

  // 4. Enforce structural management route access
  if (MANAGEMENT_ROUTES.some((p) => path.startsWith(p))) {
    return role === Role.ADMIN || role === Role.MANAGER || role === Role.DEV;
  }

  // 5. Match against explicitly defined terminals
  const sortedMatches = Object.entries(PAGE_PERMISSIONS).sort((a, b) => b[0].length - a[0].length);
  const match = sortedMatches.find(([p]) => path === p || path.startsWith(`${p}/`));

  if (!match) return false; 
  
  return (match[1] as readonly Role[]).includes(role);
}

/**
 * Checks if an action triggers an approval flow.
 */
export function actionRequiresApproval(role: Role, action: CriticalAction): boolean {
  const requiredRole = ACTION_REQUIREMENTS[action];
  if (!requiredRole) return false;
  return ROLE_WEIGHT[role] < ROLE_WEIGHT[requiredRole];
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
  userPermissions?: string[]; 
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
  fallbackRoute?: string;
} {
  const defaultFallback = getFallbackRoute(role, 'VALID');

  if (isOrgOwner) return { allowed: true };

  // Route Authorization Check
  if (pathname && !hasPagePermission(role, pathname, isOrgOwner)) {
    return { 
      allowed: false, 
      reason: "Access denied to this module.", 
      fallbackRoute: defaultFallback 
    };
  }

  // Resource-Level Action Check
  if (action && resource) {
    const explicit = canPerform(userPermissions, action, resource);
    const fallback = hasDefaultPermission(role, action, resource as ResourceType);

    if (!explicit && !fallback) {
      return { 
        allowed: false, 
        reason: `Insufficient permissions for ${resource} ${action}.`,
        fallbackRoute: defaultFallback
      };
    }
  }

  // Approval Threshold Check
  if (criticalAction) {
    const needsApproval = actionRequiresApproval(role, criticalAction);
    if (needsApproval) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: "This action requires higher-level approval.",
      };
    }
  }

  return { allowed: true };
}

export function canPerformAction(role: Role, action: CriticalAction): boolean {
  return !actionRequiresApproval(role, action);
}