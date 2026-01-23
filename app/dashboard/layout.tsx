/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { ReactNode, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar, { SidebarItem } from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

// ---------------- Dashboard Items ----------------
const dashboardItems: SidebarItem[] = [
  { key: "overview", name: "Overview", href: "/dashboard", icon: "bx-home", mode: "dashboard" },
  { key: "inventory", name: "Inventory", href: "/dashboard/inventory", icon: "bx-box", mode: "dashboard" },
  { key: "orders", name: "Orders", href: "/dashboard/orders", icon: "bx-cart", mode: "dashboard" },
  { key: "sales", name: "Sales", href: "/dashboard/sales", icon: "bx-chart", mode: "dashboard" },
  { key: "invoices", name: "Invoices", href: "/dashboard/invoices", icon: "bx-file", mode: "dashboard" },
  { key: "customers", name: "Customers", href: "/dashboard/customers", icon: "bx-user", mode: "dashboard" },
  { key: "notifications", name: "Notifications", href: "/dashboard/notifications", icon: "bx-bell", mode: "dashboard" },
  // Settings parent for highlighting
  { key: "settings", name: "Settings", href: "/dashboard/settings/general", icon: "bx-cog", mode: "dashboard" },
];

// ---------------- Settings Items ----------------
const settingsItems: SidebarItem[] = [
  { key: "general", name: "General", href: "/dashboard/settings/general", icon: "bx-cog", mode: "settings" },
  { key: "branches", name: "Branches", href: "/dashboard/settings/branches", icon: "bx-git-branch", mode: "settings" },
  { key: "products", name: "Products", href: "/dashboard/settings/products", icon: "bx-box", mode: "settings" },
  { key: "personnel", name: "Personnel", href: "/dashboard/settings/personnel", icon: "bx-user-circle", mode: "settings" },
  { key: "integrations", name: "Integrations", href: "/dashboard/settings/integrations", icon: "bx-plug", mode: "settings" },
  { key: "billing", name: "Billing", href: "/dashboard/settings/billing", icon: "bx-credit-card", mode: "settings" },
];

interface DashboardRootLayoutProps {
  children: ReactNode;
}

export default function DashboardRootLayout({ children }: DashboardRootLayoutProps) {
  const pathname = usePathname() ?? "/dashboard";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mode, setMode] = useState<"dashboard" | "settings">("dashboard");
  const [activeKey, setActiveKey] = useState<string>("overview");

  useEffect(() => {
    if (pathname.startsWith("/dashboard/settings")) {
      // Switch to settings mode
      const match = settingsItems.find(item =>
        pathname === item.href || pathname.startsWith(item.href + "/")
      );
      setMode("settings");
      setActiveKey(match ? match.key : "general");
    } else {
      // Dashboard mode
      const match = dashboardItems.find(item => {
        if (item.key === "settings" && pathname.startsWith("/dashboard/settings")) return true;
        return pathname === item.href || pathname.startsWith(item.href + "/");
      });
      setMode("dashboard");
      setActiveKey(match ? match.key : "overview");
    }
  }, [pathname]);

  const handleItemClick = (item: SidebarItem) => {
    setActiveKey(item.key);
    setMode(item.mode);
  };

  // Sidebar shows dashboard or settings items depending on mode
  const items = mode === "dashboard" ? dashboardItems : settingsItems;

  return (
    <div className="flex h-screen bg-white select-none">
      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        items={items}
        active={activeKey}
        onClick={handleItemClick}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden bg-white">
        {/* Desktop TopBar */}
        <div className="hidden lg:flex bg-white">
          <TopBar />
        </div>

        {/* Mobile TopBar */}
        <div className="flex items-center justify-end px-3 py-2 border-b bg-white lg:hidden">
          <button
            className="p-2 rounded-md border border-gray-300 hover:bg-gray-100 transition"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <i className="bx bx-menu text-2xl"></i>
          </button>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
