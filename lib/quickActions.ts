// lib/quickActions.ts
export interface QuickActionType {
  label: string;
  href: string;
  permission?: string; // optional permission key
}

// Map actions per role
export const quickActionsMap: Record<string, QuickActionType[]> = {
  ADMIN: [
    { label: "Create Order", href: "/dashboard/orders", permission: "createOrder" },
    { label: "Add Stock", href: "/dashboard/inventory", permission: "addStock" },
    { label: "Record Sale", href: "/dashboard/sales", permission: "recordSale" },
    { label: "Admin Panel", href: "/dashboard/settings", permission: "accessAdminPanel" },
  ],
  SALES: [
    { label: "Create Order", href: "/dashboard/orders", permission: "createOrder" },
    { label: "Record Sale", href: "/dashboard/sales", permission: "recordSale" },
  ],
  INVENTORY: [
    { label: "Add Stock", href: "/dashboard/inventory", permission: "addStock" },
    { label: "Update Stock", href: "/dashboard/inventory", permission: "updateStock" },
  ],
  CASHIER: [
    { label: "Process Payment", href: "/dashboard/invoices", permission: "processPayment" },
  ],
};

// DEV merges everything + extra actions
quickActionsMap.DEV = (() => {
  const merged: QuickActionType[] = [];
  Object.keys(quickActionsMap).forEach((role) => {
    if (role === "DEV") return;
    quickActionsMap[role].forEach((action) => {
      if (!merged.some((a) => a.label === action.label)) merged.push(action);
    });
  });

  // Add extra DEV-specific actions with permissions
  merged.push(
    { label: "Manage Users", href: "/dashboard/users", permission: "manageUsers" },
    { label: "Manage Branches", href: "/dashboard/branches", permission: "manageBranches" },
    { label: "View All Products", href: "/dashboard/products", permission: "viewProducts" },
    { label: "Manage Customers", href: "/dashboard/customers", permission: "manageCustomers" },
    { label: "View Invoices", href: "/dashboard/invoices", permission: "viewInvoices" },
    { label: "Dashboard Stats", href: "/dashboard", permission: "viewDashboardStats" }
  );

  return merged;
})();
