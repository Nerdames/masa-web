import { Role } from "@prisma/client";

/**
 * Page-level RBAC permissions
 * Key = route prefix
 * Value = roles allowed
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
} as const satisfies Record<string, readonly Role[]>;


/**
 * Management routes
 * Only ADMIN or OrgOwner allowed (blocked by proxy)
 */
export const MANAGEMENT_ROUTES = [
  "/dashboard/personnels",
  "/dashboard/branches",
  "/dashboard/organizations",
] as const;


/**
 * Personal user routes
 * Always allowed for authenticated users
 */
export const PERSONAL_ROUTES = [
  "/dashboard/settings/profile",
  "/dashboard/settings/preferences",
  "/dashboard/settings/notifications",
] as const;


/**
 * Optional helper for checking permission inside server components or APIs
 */
export function hasPagePermission(
  role: Role,
  pathname: string
): boolean {

  const entry = Object.entries(PAGE_PERMISSIONS).find(
    ([path]) =>
      pathname === path || pathname.startsWith(`${path}/`)
  );

  if (!entry) return false;

  return (entry[1] as readonly Role[]).includes(role);
}