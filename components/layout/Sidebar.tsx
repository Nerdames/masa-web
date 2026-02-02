/* eslint-disable react-hooks/immutability */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { Tooltip } from "@/components/feedback/Tooltip";

// ---------------- Types ----------------
export interface SidebarItem {
  key: string;
  name: string;
  href: string;
  icon: string;
  children?: SidebarItem[];
}

// ---------------- Navigation Items ----------------
const SIDEBAR_ITEMS: SidebarItem[] = [
  { key: "overview", name: "Overview", href: "/dashboard", icon: "bx-home" },
  { key: "orders", name: "Orders", href: "/dashboard/orders", icon: "bx-cart" },
  { key: "sales", name: "Sales", href: "/dashboard/sales", icon: "bx-chart" },
  { key: "invoices", name: "Invoices", href: "/dashboard/invoices", icon: "bx-file" },
  { key: "inventory", name: "Inventory", href: "/dashboard/inventory", icon: "bx-box" },
  { key: "customers", name: "Customers", href: "/dashboard/customers", icon: "bx-user" },
  { key: "notifications", name: "Notifications", href: "/dashboard/notifications", icon: "bx-bell" },
  { key: "settings", name: "Settings", href: "/dashboard/settings", icon: "bx-cog" },
];

// ------------------ Sidebar ------------------
interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname() ?? "/dashboard";

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "true";
  });

  // Persist collapsed state
  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  // ESC to close sidebar on mobile
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // -------- Active Item --------
  const activeKeys = useMemo(() => {
    let longestMatchLength = 0;
    let matchedKey: string | null = null;

    const walk = (item: SidebarItem) => {
      const match = pathname === item.href || pathname.startsWith(item.href + "/");
      if (match && item.href.length > longestMatchLength) {
        longestMatchLength = item.href.length;
        matchedKey = item.key;
      }
      item.children?.forEach(walk);
    };

    SIDEBAR_ITEMS.forEach(walk);
    return matchedKey ? new Set([matchedKey]) : new Set<string>();
  }, [pathname]);

  // -------- Render Item --------
  const renderItem = useCallback(
    (item: SidebarItem, level = 0): ReactNode => {
      const activeItem = activeKeys.has(item.key);
      const padding = level * 12;

      const link = (
        <Link
          key={item.key}
          href={item.href}
          role="menuitem"
          aria-current={activeItem ? "page" : undefined}
          className={`flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-all
            ${activeItem ? "bg-black text-white" : "text-gray-700 hover:bg-gray-100"}`}
          style={{ paddingLeft: `${padding + 8}px` }}
        >
          <i className={`bx ${item.icon} text-xl w-6`} />
          {!collapsed && <span>{item.name}</span>}
        </Link>
      );

      // Wrap with Tooltip only when collapsed
      return (
        <div key={item.key} className="pl-2 pr-4 z-9999">
          {collapsed ? <Tooltip content={item.name}>{link}</Tooltip> : link}
          {item.children?.map(child => renderItem(child, level + 1))}
        </div>
      );
    },
    [activeKeys, collapsed]
  );

  return (
    <>
      {/* Overlay for mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        role="navigation"
        aria-label="Main navigation"
        className={`fixed lg:static z-999 top-0 left-0 h-full bg-white border-r border-gray-200 shadow-sm
          flex flex-col transition-all duration-300
          ${collapsed ? "w-16" : "w-52"}
          ${open ? "translate-x-0" : "-translate-x-52 lg:translate-x-0"}`}
      >
        {/* Header */}
        <div className="flex items-center h-12 pl-2 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <i className="bx bx-bar-chart-alt-2 text-3xl w-6" />
            {!collapsed && <span className="text-lg font-semibold">MASA</span>}
          </div>

          <div className="ml-auto">
            {/* Tooltip for Collapse/Expand button */}
            <Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              <button
                onClick={() => setCollapsed(v => !v)}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
                className="flex items-center justify-center rounded-full p-1 hover:bg-gray-100 transition"
              >
                <i
                  className={`bx text-2xl ${
                    collapsed ? "bx-chevron-right" : "bx-chevron-left"
                  }`}
                />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Navigation */}
        <nav role="menu" className="flex-1 flex flex-col py-3 space-y-2">
          {SIDEBAR_ITEMS.map(item => renderItem(item))}
        </nav>
      </aside>
    </>
  );
}

export default React.memo(Sidebar);
