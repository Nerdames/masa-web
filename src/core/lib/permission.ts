import {
  Role,
  PermissionAction,
  Permission,
  AuthorizedPersonnel,
  CriticalAction,
} from "@prisma/client";

/**
 * ROLE HIERARCHY
 * Higher weight = Higher authority.
 * Used for management validation and visibility logic.
 */
export const ROLE_WEIGHT: Record<Role, number> = {
  DEV: 100,       // System Superuser (Tools Silo)
  ADMIN: 50,      // Organization Admin (Full Business Access)
  MANAGER: 40,    // Branch/Department Manager
  AUDITOR: 35,    // Compliance/Finance oversight
  INVENTORY: 30,  // Warehouse/Stock control
  SALES: 20,      // Front-end sales
  CASHIER: 10,    // Point of Sale operations
} as const;

/**
 * RESOURCE IDENTIFIERS
 * Matches the 'resource' field in the Permission model.
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
 * PAGE-LEVEL RBAC (Browser URLs)
 * Maps Next.js Route Groups to authorized roles.
 * Route Groups like (dashboard) or (terminal) are omitted from URLs.
 */
export const PAGE_PERMISSIONS = {
  // --- (tools) Group: System Only ---
  "/db-inspector": [Role.DEV],
  "/logs": [Role.DEV],
  "/tools": [Role.DEV],

  // --- (dashboard) Group: Admin & Audit ---
  "/admin/personnels": [Role.ADMIN, Role.MANAGER],
  "/admin/branches": [Role.ADMIN],
  "/audit/logs": [Role.ADMIN, Role.AUDITOR],
  "/audit/reports": [Role.ADMIN, Role.AUDITOR],
  "/notifications": [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.INVENTORY, Role.SALES, Role.CASHIER],
  "/dashboard": [Role.ADMIN, Role.MANAGER, Role.AUDITOR],

  // --- (terminal) Group: Operations ---
  "/inventory": [Role.ADMIN, Role.MANAGER, Role.INVENTORY],
  "/pos": [Role.ADMIN, Role.MANAGER, Role.SALES, Role.CASHIER],
  "/products": [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.SALES],
  "/terminal": [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.SALES, Role.CASHIER],
} as const satisfies Record<string, readonly Role[]>;

/**
 * PERSONAL & SHARED ROUTES
 * Accessible to any authenticated personnel.
 */
export const PERSONAL_ROUTES = ["/settings", "/feedback", "/support"] as const;

/**
 * CRITICAL ACTION REQUIREMENTS
 * Maps sensitive actions to the minimum role weight required[cite: 1].
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
 * DEFAULT ROLE PERMISSIONS
 * Fallback hardcoded permissions used when dynamic DB permissions are absent[cite: 1].
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Partial<Record<ResourceType, PermissionAction[]>>> = {
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
  AUDITOR: {
    INVOICE: [PermissionAction.READ, PermissionAction.EXPORT],
    AUDIT: [PermissionAction.READ, PermissionAction.EXPORT],
    REPORT: [PermissionAction.READ, PermissionAction.EXPORT],
    FINANCE: [PermissionAction.READ],
  },
  MANAGER: {
    INVOICE: [PermissionAction.CREATE, Role.SALES ? PermissionAction.READ : PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.VOID, PermissionAction.APPROVE],
    STOCK: [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.APPROVE],
    PERSONNEL: [PermissionAction.READ, PermissionAction.UPDATE],
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
 * CORE LOGIC HELPERS
 * =========================================================
 */

function normalizePath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

/**
 * Validates URL access with Group Isolation.
 * - Devs are siloed to /tools.
 * - Non-Admins are restricted to specific operations groups.
 */
export function hasPagePermission(role: Role, pathname: string, isOrgOwner: boolean = false): boolean {
  const path = normalizePath(pathname);

  // 1. Personal routes always accessible[cite: 1]
  if (PERSONAL_ROUTES.some((p) => path === p || path.startsWith(`${p}/`))) return true;

  // 2. DEV Isolation: Devs ONLY access (tools). Non-Devs NEVER access (tools).
  const isToolsRoute = path.startsWith("/tools") || path.startsWith("/db-inspector") || path.startsWith("/logs");
  if (role === Role.DEV) return isToolsRoute;
  if (isToolsRoute && role !== Role.DEV) return false;

  // 3. Admin/Owner Bypass for operational/dashboard silos
  if (isOrgOwner || role === Role.ADMIN) return true;

  // 4. Group RBAC matching
  const match = Object.entries(PAGE_PERMISSIONS)
    .sort((a, b) => b[0].length - a[0].length) // Match deepest route first
    .find(([p]) => path === p || path.startsWith(`${p}/`));

  if (!match) return false;
  return (match[1] as readonly Role[]).includes(role);
}

/**
 * Ensures hierarchy integrity during personnel modification[cite: 1].
 */
export function validateManagementRights(
  requester: { id: string; role: Role; isOrgOwner: boolean },
  target: Pick<AuthorizedPersonnel, "id" | "role" | "isOrgOwner">,
  action: ManagementAction
): { authorized: boolean; reason?: string } {
  if (requester.id === target.id) return { authorized: false, reason: "Self-modification prohibited." };
  if (target.isOrgOwner) return { authorized: false, reason: "Org Owners cannot be modified by staff." };
  if (requester.isOrgOwner) return { authorized: true };

  if (ROLE_WEIGHT[requester.role] <= ROLE_WEIGHT[target.role]) {
    return { authorized: false, reason: `Insufficient Authority: ${requester.role} cannot manage ${target.role}.` };
  }

  if (action === "DELETE" && requester.role !== Role.ADMIN) {
    return { authorized: false, reason: "Destructive actions require Admin privileges." };
  }

  return { authorized: true };
}

export function canPerform(userPermissions: Permission[], action: PermissionAction, resource: string): boolean {
  return userPermissions.some((p) => p.action === action && p.resource === resource);
}

export function hasDefaultPermission(role: Role, action: PermissionAction, resource: ResourceType): boolean {
  return (DEFAULT_ROLE_PERMISSIONS[role] as any)?.[resource]?.includes(action) ?? false;
}

export function actionRequiresApproval(role: Role, action: CriticalAction): boolean {
  const requiredRole = ACTION_REQUIREMENTS[action];
  if (!requiredRole) return false;
  return ROLE_WEIGHT[role] < ROLE_WEIGHT[requiredRole];
}

export function authorize({
  role,
  isOrgOwner = false,
  pathname,
  action,
  resource,
  userPermissions = [],
  criticalAction,
}: {
  role: Role;
  isOrgOwner?: boolean;
  pathname?: string;
  action?: PermissionAction;
  resource?: ResourceType | string;
  userPermissions?: Permission[];
  criticalAction?: CriticalAction;
}): { allowed: boolean; requiresApproval?: boolean; reason?: string } {
  if (isOrgOwner) return { allowed: true };

  if (pathname && !hasPagePermission(role, pathname, isOrgOwner)) {
    return { allowed: false, reason: "Access denied to this module silo." };
  }

  if (action && resource) {
    const hasPerm = canPerform(userPermissions, action, resource) || 
                   hasDefaultPermission(role, action, resource as ResourceType);
    if (!hasPerm) return { allowed: false, reason: `Permission ${action} denied for ${resource}.` };
  }

  if (criticalAction && actionRequiresApproval(role, criticalAction)) {
    return { allowed: false, requiresApproval: true, reason: "Higher-level approval required." };
  }

  return { allowed: true };
}