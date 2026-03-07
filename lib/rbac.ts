import { Role } from "@prisma/client";

export const PAGE_PERMISSIONS: Record<string, Role[]> = {

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

  "/dashboard/approvals": [
    Role.ADMIN,
  ],

  "/dashboard/orders": [
    Role.ADMIN,
    Role.MANAGER,
    Role.SALES,
  ],

  "/dashboard/sales": [
    Role.ADMIN,
    Role.MANAGER,
    Role.SALES,
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
};

export const MANAGEMENT_ROUTES = [
  "/dashboard/settings",
  "/dashboard/settings/branches",
  "/dashboard/settings/organizations",
  "/dashboard/settings/personnels",
  "/dashboard/settings/preferences",
  "/dashboard/settings/products",
];

export const PERSONAL_ROUTES = [
  "/dashboard/settings/profile",
  "/dashboard/settings/notifications",
];