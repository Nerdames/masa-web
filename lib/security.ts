import { Role, AuthorizedPersonnel } from "@prisma/client";

/**
 * --- OPERATIONAL HIERARCHY ---
 * Numeric weights to compare roles programmatically.
 */
export const ROLE_WEIGHT: Record<Role, number> = {
  DEV: 0,       // Technical/Maintenance only
  CASHIER: 10,
  SALES: 20,
  INVENTORY: 30,
  MANAGER: 40,
  ADMIN: 50,
};

/**
 * --- ACTION-LEVEL RBAC ---
 * Maps critical actions to the minimum role required to perform them directly.
 */
export const ACTION_REQUIREMENTS: Record<string, Role> = {
  USER_LOCK_UNLOCK: Role.MANAGER,
  EMAIL_CHANGE: Role.ADMIN,
  PASSWORD_CHANGE: Role.ADMIN,
  PRICE_UPDATE: Role.MANAGER,
  STOCK_ADJUST: Role.MANAGER,
  STOCK_TRANSFER: Role.MANAGER,
  VOID_INVOICE: Role.MANAGER,
};

/**
 * --- PAGE-LEVEL RBAC ---
 * Defines which roles can access specific dashboard modules.
 */
export const PAGE_PERMISSIONS = {
  "/dashboard": [
    Role.ADMIN,
    Role.MANAGER,
    Role.SALES,
    Role.CASHIER,
    Role.INVENTORY,
  ],
  "/dashboard/customers": [
    Role.ADMIN,
    Role.MANAGER,
    Role.SALES,
    Role.CASHIER,
  ],
  "/dashboard/inventory": [
    Role.ADMIN,
    Role.MANAGER,
    Role.INVENTORY,
  ],
  "/dashboard/orders": [
    Role.ADMIN,
    Role.MANAGER,
    Role.SALES,
  ],
  "/dashboard/sales": [
    Role.ADMIN,
    Role.MANAGER,
    Role.CASHIER,
  ],
  "/dashboard/invoices": [
    Role.ADMIN,
    Role.MANAGER,
    Role.SALES,
    Role.CASHIER,
  ],
  "/dashboard/vendors": [
    Role.ADMIN,
    Role.MANAGER,
    Role.INVENTORY,
  ],
  "/dashboard/notifications": [
    Role.ADMIN,
    Role.MANAGER,
    Role.SALES,
    Role.CASHIER,
    Role.INVENTORY,
  ],
  "/dashboard/personnels": [
    Role.ADMIN,
    Role.MANAGER,
  ],
} as const satisfies Record<string, readonly Role[]>;

/**
 * --- RESTRICTED MANAGEMENT ROUTES ---
 * Only ADMIN or OrgOwner allowed.
 */
export const MANAGEMENT_ROUTES = [
  "/dashboard/branches",
  "/dashboard/organizations",
] as const;

/**
 * --- PERSONAL ROUTES ---
 * Always allowed for any authenticated personnel.
 */
export const PERSONAL_ROUTES = [
  "/dashboard/settings/profile",
  "/dashboard/settings/preferences",
  "/dashboard/settings/notifications",
] as const;

/**
 * --- SECURITY LOGIC HELPERS ---
 */

/**
 * Validates if the requester can legally modify the target personnel.
 * Used for personnel management and credential changes.
 */
export function validateManagementRights(
  requester: { id: string; role: Role; isOrgOwner: boolean },
  target: AuthorizedPersonnel
): { authorized: boolean; reason?: string } {
  // 1. Cannot lock/disable/modify yourself via management routes
  if (requester.id === target.id) {
    return { authorized: false, reason: "Use profile settings for self-updates." };
  }

  // 2. Org Owners and Admins have top-level clearance
  if (requester.isOrgOwner || requester.role === Role.ADMIN) {
    return { authorized: true };
  }

  // 3. Managers cannot touch Admins or the Org Owner
  if (requester.role === Role.MANAGER) {
    if (target.role === Role.ADMIN || target.isOrgOwner) {
      return { authorized: false, reason: "Insufficient clearance for Admin accounts." };
    }
  }

  // 4. General weight check: You must outrank the target
  const isAuthorized = ROLE_WEIGHT[requester.role] > ROLE_WEIGHT[target.role];
  return { 
    authorized: isAuthorized, 
    reason: isAuthorized ? undefined : "You do not have the authority to manage this role." 
  };
}

/**
 * Checks if a user role is permitted to access a specific route.
 * Handles exact matches and nested path prefixes.
 */
export function hasPagePermission(
  role: Role,
  pathname: string,
  isOrgOwner: boolean = false
): boolean {
  // 1. Management Routes (Owner/Admin Only)
  if (MANAGEMENT_ROUTES.some(path => pathname.startsWith(path))) {
    return isOrgOwner || role === Role.ADMIN;
  }

  // 2. Personal Routes (Authenticated Only)
  if (PERSONAL_ROUTES.some(path => pathname.startsWith(path))) {
    return true;
  }

  // 3. Check Module-level Permissions
  const entry = Object.entries(PAGE_PERMISSIONS).find(
    ([path]) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (!entry) return false;

  return (entry[1] as readonly Role[]).includes(role);
}

/**
 * Determines if an action requires an approval request based on role weight.
 */
export function actionRequiresApproval(
  userRole: Role, 
  action: string
): boolean {
  const requiredRole = ACTION_REQUIREMENTS[action];
  if (!requiredRole) return false; // Action is not restricted
  
  return ROLE_WEIGHT[userRole] < ROLE_WEIGHT[requiredRole];
}