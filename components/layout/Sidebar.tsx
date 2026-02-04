/* eslint-disable react-hooks/immutability */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip } from "@/components/feedback/Tooltip";

/* ---------------------------------------------
 * Types
 * --------------------------------------------*/
export interface SidebarItem {
  key: string;
  name: string;
  href: string;
  icon: string;
  children?: SidebarItem[];
}

/* ---------------------------------------------
 * Navigation Items
 * --------------------------------------------*/
const SIDEBAR_ITEMS: SidebarItem[] = [
  { key: "overview", name: "Overview", href: "/dashboard", icon: "bx-grid-alt" },
  { key: "orders", name: "Orders", href: "/dashboard/orders", icon: "bx-cart" },
  { key: "sales", name: "Sales", href: "/dashboard/sales", icon: "bx-chart" },
  { key: "invoices", name: "Invoices", href: "/dashboard/invoices", icon: "bx-file" },
  { key: "inventory", name: "Inventory", href: "/dashboard/inventory", icon: "bx-box" },
  { key: "customers", name: "Customers", href: "/dashboard/customers", icon: "bx-user" },
  { key: "notifications", name: "Notifications", href: "/dashboard/notifications", icon: "bx-bell" },
  { key: "settings", name: "Settings", href: "/dashboard/settings", icon: "bx-cog" },
];

/* ---------------------------------------------
 * Motion Tokens
 * --------------------------------------------*/
const SIDEBAR_MOTION = {
  expanded: { width: 208 },
  collapsed: { width: 64 },
};

/* ---------------------------------------------
 * Sidebar Item
 * --------------------------------------------*/
interface ItemProps {
  item: SidebarItem;
  active: boolean;
  collapsed: boolean;
}

const SidebarItemLink = React.memo(function SidebarItemLink({
  item,
  active,
  collapsed,
}: ItemProps) {
  const link = (
    <Link
      href={item.href}
      role="menuitem"
      aria-current={active ? "page" : undefined}
      className={`
        relative flex items-center rounded-md
        ${collapsed ? "h-10 w-10 justify-center mx-auto" : "px-3 py-2.5 gap-3"}
        text-sm font-medium transition-colors
        ${active ? "text-white" : "text-gray-700 hover:bg-gray-100"}
      `}
    >
      {/* Shared active indicator */}
      {active && (
        <motion.span
          layoutId="sidebar-active-indicator"
          className="absolute inset-0 rounded-md bg-black"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}

      {/* Icon */}
      <i
        aria-hidden
        className={`bx ${item.icon} text-xl relative z-10`}
      />

      {/* Label */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.span
            key="label"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.15 }}
            className="relative z-10 truncate"
          >
            {item.name}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );

  return collapsed ? <Tooltip content={item.name}>{link}</Tooltip> : link;
});

/* ---------------------------------------------
 * Sidebar
 * --------------------------------------------*/
interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname() ?? "/dashboard";
  const [collapsed, setCollapsed] = useState(false);

  /* ---------- Hydrate persisted state ---------- */
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved !== null) setCollapsed(saved === "true");
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  /* ---------- ESC close (mobile) ---------- */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  /* ---------- Active route ---------- */
  const activeKeys = useMemo(() => {
    let longest = 0;
    let key: string | null = null;

    for (const item of SIDEBAR_ITEMS) {
      const match =
        pathname === item.href ||
        pathname.startsWith(item.href + "/");

      if (match && item.href.length > longest) {
        longest = item.href.length;
        key = item.key;
      }
    }

    return key ? new Set([key]) : new Set<string>();
  }, [pathname]);

  const renderItem = useCallback(
    (item: SidebarItem): ReactNode => (
      <SidebarItemLink
        key={item.key}
        item={item}
        active={activeKeys.has(item.key)}
        collapsed={collapsed}
      />
    ),
    [activeKeys, collapsed]
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <motion.aside
        role="navigation"
        aria-label="Main navigation"
        initial={false}
        animate={collapsed ? "collapsed" : "expanded"}
        variants={SIDEBAR_MOTION}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className={`
          fixed lg:static top-0 left-0 z-40 h-full
          bg-white border-r border-gray-200 shadow-sm
          flex flex-col
          ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Header */}
        <div className="flex items-center h-12 border-b border-gray-200 px-2">
          <i className="bx bx-network-chart text-3xl" />

          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="ml-2 text-lg font-semibold"
              >
                MASA
              </motion.span>
            )}
          </AnimatePresence>

          <div className="ml-auto">
            <Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              <button
                onClick={() => setCollapsed(v => !v)}
                aria-expanded={!collapsed}
                className="rounded-full p-1 hover:bg-gray-100"
              >
                <motion.i
                  className="bx bx-chevron-left text-xl"
                  animate={{ rotate: collapsed ? 180 : 0 }}
                />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Navigation */}
        <nav
          role="menu"
          className={`flex-1 flex flex-col py-3 ${
            collapsed ? "space-y-3" : "space-y-3 px-2"
          }`}
        >
          {SIDEBAR_ITEMS.map(renderItem)}
        </nav>
      </motion.aside>
    </>
  );
}

export default React.memo(Sidebar);
