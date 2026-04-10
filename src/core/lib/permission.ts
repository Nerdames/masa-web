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
 * RESOURCE IDENTIFIERS
 * Matches the 'resource' field in the Permission model.
 * =========================================================
 */
export const RESOURCES = {
  INVOICE: "INVOICE",
  STOCK: "STOCK",
  PRODUCT: "PRODUCT",
  CUSTOMER: "CUSTOMER",
  EXPENSE: "EXPENSE",
  PROCUREMENT: "PROCUREMENT", // PurchaseOrders/GRNs
  VENDOR: "VENDOR",
  REPORT: "REPORT",
  AUDIT: "AUDIT",             // ActivityLogs
  SETTINGS: "SETTINGS",
  BRANCH: "BRANCH",
  PERSONNEL: "PERSONNEL",
  FINANCE: "FINANCE",         // Accounts/Transactions
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
import { Role } from "@prisma/client";

/**
 * PAGE_PERMISSIONS
 * Maps actual URL paths (based on your App Router structure) to allowed Roles.
 * * Note: Next.js Route Groups like (dashboard) or (terminal) do not appear in the URL.
 */
export const PAGE_PERMISSIONS = {
  // Admin Section (from src/app/(dashboard)/admin)
  "/admin/personnels": [Role.ADMIN, Role.MANAGER, Role.DEV],
  "/admin/branches": [Role.ADMIN, Role.DEV],
  
  // Audit Section (from src/app/(dashboard)/audit)
  "/audit/logs": [Role.ADMIN, Role.AUDITOR, Role.DEV],
  "/audit/reports": [Role.ADMIN, Role.AUDITOR, Role.DEV],
  
  // Terminal/POS Section (from src/app/(terminal))
  "/dashboard": [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.SALES, Role.CASHIER, Role.DEV],
  "/inventory": [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.AUDITOR, Role.DEV],
  "/pos": [Role.ADMIN, Role.MANAGER, Role.SALES, Role.CASHIER, Role.DEV],
  "/products": [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.SALES, Role.DEV],

  // Common Dashboard (from src/app/(dashboard))
  "/notifications": [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.SALES, Role.CASHIER, Role.AUDITOR, Role.DEV],
  
  // Tools & System (matching your (tools) folder and intended dev paths)
  "/db-inspector": [Role.DEV],
  "/logs": [Role.DEV, Role.ADMIN],
} as const satisfies Record<string, readonly Role[]>;

/**
 * Routes that trigger "Management Mode" in the UI (Sidebars/Headers)
 */
export const MANAGEMENT_ROUTES = [
  "/admin/branches", 
  "/admin/personnels", 
  "/db-inspector"
] as const;

/**
 * Routes accessible by any authenticated user for personal management
 */
export const PERSONAL_ROUTES = [
  "/settings", 
  "/feedback", 
  "/support" // Added based on your (auth)/support folder
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

function normalizePath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

/**
 * Checks if a specific action is allowed on a resource based on dynamic DB permissions.
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

/**
 * Checks if a role has the hardcoded default permission for a resource.
 */
export function hasDefaultPermission(
  role: Role,
  action: PermissionAction,
  resource: ResourceType
): boolean {
  return (DEFAULT_ROLE_PERMISSIONS[role] as any)?.[resource]?.includes(action) ?? false;
}

/**
 * LOG VISIBILITY: Determines if a user can see another user's activity in logs.
 * - Devs, Admins, and Auditors see everything.
 * - Managers see only those with lower hierarchy weight.
 */
export function canSeeAction(recipientRole: Role, actorRole: Role): boolean {
  if ([Role.DEV, Role.ADMIN, Role.AUDITOR].includes(recipientRole)) {
    return true;
  }

  if (recipientRole === Role.MANAGER) {
    return ROLE_WEIGHT[actorRole] < ROLE_WEIGHT[Role.MANAGER];
  }

  return false;
}

/**
 * MANAGEMENT RIGHTS: Validates if one user can modify another.
 * Prevents Self-Disable, Same-Level modification, and Owner jeopardy.
 */
export function validateManagementRights(
  requester: { id: string; role: Role; isOrgOwner: boolean },
  target: Pick<AuthorizedPersonnel, "id" | "role" | "isOrgOwner">,
  action: ManagementAction
): { authorized: boolean; reason?: string } {
  
  // 1. Block Self-Management
  if (requester.id === target.id) {
    return { 
      authorized: false, 
      reason: "Security Policy: You cannot modify your own management rights or status from here." 
    };
  }

  // 2. Protect Org Owners
  if (target.isOrgOwner) {
    return { authorized: false, reason: "Organization owners cannot be modified by staff members." };
  }

  // 3. Org Owner Bypass
  if (requester.isOrgOwner) return { authorized: true };

  // 4. Hierarchy Check (Strictly Greater Than)
  const requesterWeight = ROLE_WEIGHT[requester.role];
  const targetWeight = ROLE_WEIGHT[target.role];

  if (requesterWeight <= targetWeight) {
    return { 
      authorized: false, 
      reason: `Insufficient Authority: A ${requester.role} cannot manage a ${target.role}.` 
    };
  }

  // 5. Destructive Action Restriction
  if (action === "DELETE" && requester.role === Role.MANAGER) {
    return {
      authorized: false,
      reason: "Access Denied: Managers can deactivate staff but do not have deletion privileges."
    };
  }

  return { authorized: true };
}

/**
 * PAGE PERMISSIONS: Validates URL access.
 */
export function hasPagePermission(
  role: Role,
  pathname: string,
  isOrgOwner: boolean = false
): boolean {
  if (isOrgOwner) return true;
  const path = normalizePath(pathname);

  if (PERSONAL_ROUTES.some((p) => path === p || path.startsWith(`${p}/`))) return true;

  if (MANAGEMENT_ROUTES.some((p) => path.startsWith(p))) {
    return role === Role.ADMIN || role === Role.DEV;
  }

  const sortedMatches = Object.entries(PAGE_PERMISSIONS).sort((a, b) => b[0].length - a[0].length);
  const match = sortedMatches.find(([p]) => path === p || path.startsWith(`${p}/`));

  if (!match) return false;
  return (match[1] as readonly Role[]).includes(role);
}

/**
 * CRITICAL ACTION: Checks if an action triggers an approval flow.
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
      return { allowed: false, reason: `Insufficient permissions for ${resource} ${action}.` };
    }
  }

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