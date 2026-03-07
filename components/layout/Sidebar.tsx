"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
  useRef,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip } from "@/components/feedback/Tooltip";
import { useSession, signOut } from "next-auth/react";
import { getInitials } from "@/lib/getInitials";

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
  { key: "overview", name: "Overview", href: "/dashboard", icon: "bx-doughnut-chart" },
  { key: "orders", name: "Orders", href: "/dashboard/orders", icon: "bx-cart" },
  { key: "sales", name: "Sales", href: "/dashboard/sales", icon: "bx-chart" },
  { key: "invoices", name: "Invoices", href: "/dashboard/invoices", icon: "bx-file" },
  { key: "inventory", name: "Inventory", href: "/dashboard/inventory", icon: "bx-box" },
  { key: "vendors", name: "Vendors", href: "/dashboard/vendors", icon: "bx-store" },
  { key: "customers", name: "Customers", href: "/dashboard/customers", icon: "bx-group" },
  { key: "notifications", name: "Notifications", href: "/dashboard/notifications", icon: "bx-bell" },
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
      {active && (
        <motion.span
          layoutId="sidebar-active-indicator"
          className="absolute inset-0 rounded-md bg-black"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      <i aria-hidden className={`bx ${item.icon} text-xl relative z-10`} />
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
 * Dropdown Menu Component
 * --------------------------------------------*/
interface MenuItem {
  type?: "card" | "action";
  label?: string;
  email?: string | null;
  leftElement?: React.ReactNode;
  details?: { icon: string; value: string }[];
  icon?: string;
  destructive?: boolean;
  action?: () => void;
}

const DropdownMenu = ({
  items,
  show,
  setShow,
  parentWidth,
  containerRef,
}: {
  items: MenuItem[];
  show: boolean;
  setShow: (v: boolean) => void;
  parentWidth: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) => {
  useEffect(() => {
    if (!show) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setShow(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [show, containerRef, setShow]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="absolute bottom-0 mb-14 w-52 bg-white border border-gray-200 rounded shadow-lg z-50 overflow-hidden"
          style={{ left: parentWidth }}
        >
          <div className="absolute left-0 top-4 -ml-2 w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-r-[8px] border-r-white" />
          {items.map((item, i) => {
            if (item.type === "card") {
              return (
                <motion.div
                  key={i}
                  className="p-3 border-b border-gray-200 cursor-default"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center gap-3">
                    {item.leftElement}
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900 text-sm truncate">{item.label}</span>
                      {item.email && (
                        <span className="text-gray-500 text-xs truncate">{item.email}</span>
                      )}
                    </div>
                  </div>
                  {item.details && (
                    <div className="mt-2 flex flex-col text-xs text-gray-500 space-y-1">
                      {item.details.map((d, j) => (
                        <div key={j} className="flex items-center gap-1">
                          <i className={`bx ${d.icon} text-gray-400`} />
                          <span className="truncate">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            }

            return (
              <motion.button
                key={i}
                onClick={() => {
                  item.action?.();
                  setShow(false);
                }}
                className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 rounded hover:bg-gray-100 ${
                  item.destructive ? "text-red-600 hover:bg-red-50" : "text-gray-700"
                }`}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                transition={{ duration: 0.15 }}
              >
                {item.icon && <i className={`bx ${item.icon} text-[16px]`} />}
                {item.label}
              </motion.button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ---------------------------------------------
 * Sidebar
 * --------------------------------------------*/
interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname() ?? "/dashboard";
  const { data: session } = useSession();
  const user = session?.user;

  // Use null initially to avoid render flash
  const [collapsed, setCollapsed] = useState<boolean | null>(null);

  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showManageMenu, setShowManageMenu] = useState(false);

  const accountRef = useRef<HTMLDivElement>(null);
  const manageRef = useRef<HTMLDivElement>(null);

  /* ---------- Fetch persisted state from DB or localStorage ---------- */
  useEffect(() => {
    if (!user?.organizationId || !user?.id || !user?.branchId) return;

    const fetchPreference = async () => {
      // LocalStorage fallback for immediate render
      const saved = localStorage.getItem("sidebar-collapsed");
      if (saved !== null) setCollapsed(saved === "true");

      try {
        const params = new URLSearchParams({
          organizationId: user.organizationId || "",
          branchId: user.branchId || "",
          personnelId: user.id || "",
          category: "LAYOUT",
          key: "sidebar-collapsed",
          target: "",
        });
        const res = await fetch(`/api/preferences?${params.toString()}`);
        const data = await res.json();
        if (data.success && typeof data.preference === "boolean") {
          setCollapsed(data.preference);
          localStorage.setItem("sidebar-collapsed", String(data.preference));
        }
      } catch (err) {
        console.error("Failed to fetch sidebar preference:", err);
      }
    };

    fetchPreference();
  }, [user?.organizationId, user?.id, user?.branchId]);

  /* ---------- Toggle collapse & persist ---------- */
  const toggleCollapsed = async () => {
    if (collapsed === null) return; // avoid toggling before loaded
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem("sidebar-collapsed", String(newState));

    if (!user?.organizationId || !user?.id || !user?.branchId) return;

    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: user.organizationId,
          branchId: user.branchId,
          personnelId: user.id,
          scope: "USER",
          category: "LAYOUT",
          key: "sidebar-collapsed",
          value: newState,
          target: "",
        }),
      });
    } catch (err) {
      console.error("Failed to save sidebar preference:", err);
    }
  };

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
      const match = pathname === item.href || pathname.startsWith(item.href + "/");
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
        collapsed={collapsed ?? false} // default to false if not loaded yet
      />
    ),
    [activeKeys, collapsed]
  );

  const accountMenu: MenuItem[] = user
    ? [
        {
          type: "card",
          label: user.name ?? "Profile",
          email: user.email ?? "",
          leftElement: (
            <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center font-semibold text-lg">
              {getInitials(user.name)}
            </div>
          ),
          details: [
            ...(user.organizationName ? [{ icon: "bx-building", value: user.organizationName }] : []),
            ...(user.branchName ? [{ icon: "bx-map", value: user.branchName }] : []),
            ...(user.role ? [{ icon: "bx-id-card", value: user.role }] : []),
          ],
        },
        {
          type: "action",
          label: "Manage your profile",
          icon: "bx-user",
          action: () => (window.location.href = "/dashboard/settings/profile"),
        },
        {
          type: "action",
          label: "Sign Out",
          icon: "bx-log-out",
          destructive: true,
          action: async () => await signOut({ callbackUrl: "/" }),
        },
      ]
    : [];

  const manageMenu: MenuItem[] = [
    { label: "Personnel & Role", icon: "bx-user", action: () => (window.location.href = "/dashboard/settings/personnels") },
    { label: "Branches", icon: "bx-git-branch", action: () => (window.location.href = "/dashboard/settings/branches") },
    { label: "Organizations", icon: "bx-buildings", action: () => (window.location.href = "/dashboard/settings/organizations") },
    { label: "Settings", icon: "bx-cog", action: () => (window.location.href = "/dashboard/settings") },
    { label: "Extensions", icon: "bx-plug", action: () => (window.location.href = "/dashboard/settings/extensions") },
    { label: "Logs", icon: "bx-list-ul", action: () => (window.location.href = "/dashboard/settings/logs") },
    { label: "Analytics", icon: "bx-bar-chart", action: () => (window.location.href = "/dashboard/settings/analytics") },
  ];

  const canAccessManage = useMemo(
    () => user?.role && ["DEV", "ADMIN", "MANAGER"].includes(user.role),
    [user]
  );

  const sidebarWidth = collapsed ?? false ? 64 : 208;

  const handleBottomClick = (setMenu: React.Dispatch<React.SetStateAction<boolean>>) => {
    setMenu(prev => !prev);
  };

  if (collapsed === null) return null; // avoid flashing sidebar

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
        className={`fixed lg:static top-0 left-0 z-40 h-full
          bg-white border-r border-gray-200 shadow-sm
          flex flex-col justify-between
          ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Header */}
        <div
          className={`flex items-center h-12 px-3 ${collapsed ? "justify-center" : "justify-start"}`}
        >
          <i className="bx bxs-grid-alt text-xl text-gray-500" />
          {!collapsed && (
            <AnimatePresence initial={false}>
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                className="ml-3 text-m font-medium text-gray-500"
              >
                Dashboard
              </motion.span>
            </AnimatePresence>
          )}
        </div>

        {/* Collapse/Expand button */}
        <Tooltip side="right" content={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <button
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            className={`absolute top-2 -right-3 w-6 h-6 flex items-center justify-center 
              bg-white border border-gray-200 rounded-full shadow hover:bg-gray-100 transition-all z-50`}
          >
            <AnimatePresence initial={false} mode="wait">
              {collapsed ? (
                <motion.i
                  key="expand"
                  className="bx bx-expand-horizontal text-gray-500 text-lg"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.2 }}
                />
              ) : (
                <motion.i
                  key="collapse"
                  className="bx bx-collapse-horizontal text-gray-500 text-lg"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                />
              )}
            </AnimatePresence>
          </button>
        </Tooltip>

        {/* Navigation */}
        <nav
          role="menu"
          className={`flex-1 flex flex-col py-3 ${collapsed ? "space-y-3" : "space-y-3 px-2"}`}
        >
          {SIDEBAR_ITEMS.map(renderItem)}
        </nav>

        {/* Bottom buttons */}
        <div className="flex flex-col mb-4 space-y-2 px-2">
          {user && (
            <div ref={accountRef} className="relative">
              {collapsed ? (
                <Tooltip content={user.name ?? "Account"} side="right">
                  <button
                    onClick={() => handleBottomClick(setShowAccountMenu)}
                    className="flex items-center h-10 w-full px-3 gap-3 rounded hover:bg-gray-100 transition-colors"
                  >
                    <i className="bx bx-user text-xl" />
                  </button>
                </Tooltip>
              ) : (
                <button
                  onClick={() => handleBottomClick(setShowAccountMenu)}
                  className="flex items-center h-10 w-full px-3 gap-3 rounded hover:bg-gray-100 transition-colors"
                >
                  <i className="bx bx-user text-xl" />
                  <span className="ml-2 text-sm font-medium">Account</span>
                </button>
              )}
              <DropdownMenu
                items={accountMenu}
                show={showAccountMenu}
                setShow={setShowAccountMenu}
                parentWidth={sidebarWidth}
                containerRef={accountRef}
              />
            </div>
          )}

          {canAccessManage && (
            <div ref={manageRef} className="relative">
              {collapsed ? (
                <Tooltip content="Manage" side="right">
                  <button
                    onClick={() => handleBottomClick(setShowManageMenu)}
                    className="flex items-center h-10 w-full px-3 gap-3 rounded hover:bg-gray-100 transition-colors"
                  >
                    <i className="bx bx-cog text-xl" />
                  </button>
                </Tooltip>
              ) : (
                <button
                  onClick={() => handleBottomClick(setShowManageMenu)}
                  className="flex items-center h-10 w-full px-3 gap-3 rounded hover:bg-gray-100 transition-colors"
                >
                  <i className="bx bx-cog text-xl" />
                  <span className="ml-2 text-sm font-medium">Manage</span>
                </button>
              )}
              <DropdownMenu
                items={manageMenu}
                show={showManageMenu}
                setShow={setShowManageMenu}
                parentWidth={sidebarWidth}
                containerRef={manageRef}
              />
            </div>
          )}
        </div>
      </motion.aside>
    </>
  );
}

export default React.memo(Sidebar);