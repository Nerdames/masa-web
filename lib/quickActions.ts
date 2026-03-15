import { Role } from "@prisma/client";
import { hasPagePermission } from "@/lib/security";

export interface QuickActionType {
  label: string;
  href: string;
}

/**
 * Quick actions mapped per role.
 * Visibility is also filtered by page permissions.
 */
export const quickActionsMap: Record<Role, QuickActionType[]> = {
  ADMIN: [
    { label: "Create Order", href: "/dashboard/orders" },
    { label: "Add Stock", href: "/dashboard/inventory" },
    { label: "Record Sale", href: "/dashboard/sales" },
    { label: "Process Payment", href: "/dashboard/invoices" },
    { label: "Manage Personnel", href: "/dashboard/personnels" },
  ],

  MANAGER: [
    { label: "Create Order", href: "/dashboard/orders" },
    { label: "Add Stock", href: "/dashboard/inventory" },
    { label: "Record Sale", href: "/dashboard/sales" },
    { label: "Process Payment", href: "/dashboard/invoices" },
  ],

  SALES: [
    { label: "Create Order", href: "/dashboard/orders" },
    { label: "Record Sale", href: "/dashboard/sales" },
    { label: "View Invoices", href: "/dashboard/invoices" },
  ],

  INVENTORY: [
    { label: "Add Stock", href: "/dashboard/inventory" },
    { label: "View Vendors", href: "/dashboard/vendors" },
  ],

  CASHIER: [
    { label: "Process Payment", href: "/dashboard/invoices" },
    { label: "Record Sale", href: "/dashboard/sales" },
  ],

  /**
   * DEV actions are auto-generated below.
   * Placeholder required to satisfy Record<Role,...>
   */
  DEV: [],
};

/**
 * DEV role receives all unique actions across roles
 * plus developer-only utilities.
 */
quickActionsMap.DEV = (() => {
  const merged: QuickActionType[] = [];

  Object.values(quickActionsMap).forEach((actions) => {
    actions.forEach((action) => {
      if (!merged.some((a) => a.label === action.label)) {
        merged.push(action);
      }
    });
  });

  merged.push(
    { label: "Manage Users", href: "/dashboard/personnels" },
    { label: "Manage Branches", href: "/dashboard/branches" },
    { label: "Manage Organizations", href: "/dashboard/organizations" },
    { label: "View Customers", href: "/dashboard/customers" },
    { label: "View Dashboard", href: "/dashboard" }
  );

  return merged;
})();

/**
 * Returns actions a user can actually see
 * after validating page permissions.
 */
export function getQuickActions(
  role: Role,
  pathname: string,
  isOrgOwner: boolean = false
): QuickActionType[] {
  const actions = quickActionsMap[role] ?? [];

  return actions.filter((action) =>
    hasPagePermission(role, action.href, isOrgOwner)
  );
}