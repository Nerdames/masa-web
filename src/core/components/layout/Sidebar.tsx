"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { motion } from "framer-motion";
import { Role } from "@prisma/client";

// Import core UI and hooks
import { Tooltip } from "@/core/components/feedback/Tooltip";
import { usePermission } from "@/core/hooks/usePermission"; // Adjust import path as needed

// Lucide React Icons
import {
  LayoutDashboard,
  Building2,
  MapPin,
  Users,
  Box,
  Database,
  ShoppingCart,
  ClipboardCheck,
  RefreshCw,
  ArrowUpRight,
  PackageCheck,
  AlertTriangle,
  BarChart3,
  Fingerprint,
  Scale,
  FileSearch,
  RefreshCcw,
  Landmark,
  History,
  User,
  Bell,
  Brush,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Boxes,
  Store,
  ShieldCheck,
  Settings
} from "lucide-react";

/* --------------------------------------------- */
/* Types */
/* --------------------------------------------- */

export interface SidebarItem {
  key: string;
  name: string;
  href: string;
  icon: React.ElementType;
  roles?: Role[];
}

/* --------------------------------------------- */
/* Navigation Config */
/* --------------------------------------------- */

const MANAGEMENT_ITEMS: SidebarItem[] = [
  { key: "admin-ovw", name: "Overview", href: "/", icon: LayoutGrid, roles: [Role.ADMIN, Role.DEV, Role.MANAGER] },
  { key: "org", name: "Org & Defaults", href: "/admin/myorg", icon: Building2, roles: [Role.ADMIN, Role.DEV] },
  { key: "branches", name: "Branches", href: "/admin/branches", icon: MapPin, roles: [Role.ADMIN, Role.DEV] },
  { key: "personnels", name: "Personnel", href: "/admin/personnels", icon: Users, roles: [Role.ADMIN, Role.DEV] },
];

const INVENTORY_ITEMS: SidebarItem[] = [
  { key: "inv-ovw", name: "Overview", href: "/inventory", icon: LayoutGrid, roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.AUDITOR, Role.DEV] },
  { key: "inv-fortress", name: "Stock Levels", href: "/inventory/fortress", icon: Box, roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.AUDITOR, Role.DEV] },
  { key: "inv-registry", name: "Product Registry", href: "/inventory/products", icon: Database, roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.DEV] },
  { key: "inv-proc", name: "Procurement", href: "/inventory/procurement", icon: ShoppingCart, roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.DEV] },
  { key: "inv-app", name: "Approvals", href: "/inventory/approvals", icon: ClipboardCheck, roles: [Role.ADMIN, Role.MANAGER, Role.DEV] },
  { key: "inv-stock", name: "Stock Take", href: "/inventory/stock-takes", icon: RefreshCw, roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.DEV] },
  { key: "inv-trans", name: "Transfers", href: "/inventory/transfers", icon: ArrowUpRight, roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.DEV] },
  { key: "inv-rep", name: "Reports", href: "/inventory/reports", icon: BarChart3, roles: [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV] },
  { key: "inv-ref", name: "Returns", href: "/inventory/refunds", icon: AlertTriangle, roles: [Role.ADMIN, Role.MANAGER, Role.DEV] },
  { key: "inv-ven", name: "Vendors", href: "/inventory/vendors", icon: Users, roles: [Role.ADMIN, Role.MANAGER, Role.DEV] },
];

const POS_ITEMS: SidebarItem[] = [
  { key: "pos-ovw", name: "Overview", href: "/pos", icon: LayoutGrid, roles: [Role.ADMIN, Role.MANAGER, Role.SALES, Role.CASHIER, Role.DEV] },
  { key: "pos-term", name: "Sales Terminal", href: "/pos/terminal", icon: ShoppingCart, roles: [Role.ADMIN, Role.MANAGER, Role.SALES, Role.CASHIER, Role.DEV] },
  { key: "pos-sess", name: "POS Sessions", href: "/pos/sessions", icon: History, roles: [Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.DEV] },
  { key: "pos-drafts", name: "Draft Sales", href: "/pos/drafts", icon: ClipboardCheck, roles: [Role.ADMIN, Role.MANAGER, Role.SALES, Role.CASHIER, Role.DEV] },
  { key: "pos-inv", name: "Invoices", href: "/pos/invoices", icon: PackageCheck, roles: [Role.ADMIN, Role.MANAGER, Role.SALES, Role.CASHIER, Role.AUDITOR, Role.DEV] },
  { key: "pos-cust", name: "Customers", href: "/pos/customers", icon: Users, roles: [Role.ADMIN, Role.MANAGER, Role.SALES, Role.CASHIER, Role.DEV] },
  { key: "pos-ref", name: "Returns", href: "/pos/refunds", icon: RefreshCw, roles: [Role.ADMIN, Role.MANAGER, Role.DEV] },
  { key: "pos-rep", name: "POS Reports", href: "/pos/reports", icon: BarChart3, roles: [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV] },
  { key: "pos-aud", name: "Activity Logs", href: "/pos/activity", icon: AlertTriangle, roles: [Role.ADMIN, Role.AUDITOR, Role.DEV] },
];

const AUDIT_ITEMS: SidebarItem[] = [
  { key: "aud-ovw", name: "Overview", href: "/audit", icon: LayoutGrid, roles: [Role.AUDITOR, Role.ADMIN, Role.DEV] },
  { key: "aud-logs", name: "Forensic Logs", href: "/audit/logs", icon: Fingerprint, roles: [Role.AUDITOR, Role.ADMIN, Role.DEV] },
  { key: "aud-app", name: "Approval Queue", href: "/audit/approvals", icon: Scale, roles: [Role.AUDITOR, Role.ADMIN, Role.MANAGER] },
  { key: "aud-stk", name: "Stock Audit", href: "/audit/stock-takes", icon: FileSearch, roles: [Role.AUDITOR, Role.ADMIN, Role.INVENTORY] },
  { key: "aud-rec", name: "Reconciliation", href: "/audit/reconciliation", icon: RefreshCcw, roles: [Role.AUDITOR, Role.ADMIN] },
  { key: "aud-ref", name: "Refund Monitor", href: "/terminal/refunds", icon: History, roles: [Role.AUDITOR, Role.ADMIN, Role.MANAGER] },
  { key: "aud-node", name: "Node Integrity", href: "/audit/nodes", icon: Landmark, roles: [Role.AUDITOR, Role.DEV] },
];

const SETTINGS_ITEMS: SidebarItem[] = [
  { key: "set-prof", name: "Profile", href: "/settings/profile", icon: User },
  { key: "set-notif", name: "Notifications", href: "/settings/notifications", icon: Bell },
  { key: "set-pref", name: "Preferences", href: "/settings/preferences", icon: Brush },
];

/* --------------------------------------------- */
/* Sidebar Item */
/* --------------------------------------------- */

interface ItemProps {
  item: SidebarItem;
  active: boolean;
  collapsed: boolean;
}

const SidebarItemLink = React.memo(function SidebarItemLink({ item, active, collapsed }: ItemProps) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`
        relative flex items-center rounded-md transition-all duration-200
        ${collapsed ? "h-9 w-9 justify-center mx-auto" : "px-3 py-2 gap-3"}
        ${active ? "bg-blue-600 text-white shadow-sm" : "text-gray-700 hover:bg-gray-100"}
      `}
    >
      <Icon className="w-[16px] h-[16px] flex-shrink-0" />
      {!collapsed && (
        <span className="text-[11px] font-medium truncate">
          {item.name}
        </span>
      )}
    </Link>
  );

  return collapsed ? <Tooltip side="right" content={item.name}>{link}</Tooltip> : link;
});

/* --------------------------------------------- */
/* Sidebar Section Header */
/* --------------------------------------------- */

const SectionHeader = ({ label, icon: Icon, collapsed }: { label: string; icon: React.ElementType; collapsed: boolean }) => (
  <div className={`flex items-center text-gray-400 px-3 py-2 transition-all duration-200 ${collapsed ? "justify-center" : "gap-2"}`}>
    <Icon className="w-4 h-4 flex-shrink-0" />
    {!collapsed && (
      <span className="text-[11px] font-bold uppercase tracking-wider truncate">
        {label}
      </span>
    )}
  </div>
);

/* --------------------------------------------- */
/* Sidebar */
/* --------------------------------------------- */

function Sidebar() {
  const pathname = usePathname() ?? "/";
  const { user } = usePermission();

  // Load instantly from localStorage before first paint to prevent layout jump
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar-collapsed") === "true";
    }
    return false; // Server-side default
  });

  const [mounted, setMounted] = useState(false);

  // 1. Sync Preference transparently with the backend
  useEffect(() => {
    setMounted(true);
    
    const fetchPreference = async () => {
      if (!user?.organizationId || !user?.branchId || !user?.id) return;
      try {
        const params = new URLSearchParams({
          organizationId: user.organizationId,
          branchId: user.branchId,
          personnelId: user.id,
          category: "LAYOUT",
          key: "sidebar-collapsed",
          target: "",
        });

        const res = await fetch(`/api/preferences?${params.toString()}`);
        const data = await res.json();

        if (data.success && data.preference !== undefined) {
          const backendState = Boolean(data.preference);
          if (backendState !== collapsed) {
            setCollapsed(backendState);
            localStorage.setItem("sidebar-collapsed", String(backendState));
          }
        }
      } catch (err) {
        console.error("Failed to fetch sidebar preference", err);
      }
    };

    fetchPreference();
  }, [user]); // Only fetch when the user session resolves

  // 2. Toggle & Save Preference
  const toggleCollapsed = async () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));

    if (!user?.organizationId || !user?.branchId || !user?.id) return;

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
          value: next,
          target: "",
        }),
      });
    } catch (err) {
      console.error("Failed to save sidebar preference", err);
    }
  };

  // 3. RBAC Filtering logic
  const hasAccess = useCallback((roles?: Role[]) => {
    if (!roles || roles.length === 0) return true;
    if (!user) return false;
    if (user.isOrgOwner) return true; // Superuser bypass natively mapped
    return roles.includes(user.role as Role);
  }, [user]);

  const visibleManagement = useMemo(() => MANAGEMENT_ITEMS.filter(item => hasAccess(item.roles)), [hasAccess]);
  const visibleInventory = useMemo(() => INVENTORY_ITEMS.filter(item => hasAccess(item.roles)), [hasAccess]);
  const visiblePOS = useMemo(() => POS_ITEMS.filter(item => hasAccess(item.roles)), [hasAccess]);
  const visibleAudit = useMemo(() => AUDIT_ITEMS.filter(item => hasAccess(item.roles)), [hasAccess]);
  const visibleSettings = useMemo(() => SETTINGS_ITEMS.filter(item => hasAccess(item.roles)), [hasAccess]);

  // 4. Active State Logic
  const activeKeys = useMemo(() => {
    const all = [
      ...MANAGEMENT_ITEMS,
      ...INVENTORY_ITEMS,
      ...POS_ITEMS,
      ...AUDIT_ITEMS,
      ...SETTINGS_ITEMS
    ];
    
    let longest = 0;
    let key: string | null = null;

    for (const item of all) {
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
        collapsed={collapsed}
      />
    ),
    [activeKeys, collapsed]
  );

  return (
    <motion.aside
      suppressHydrationWarning // Prevent initial mismatch errors since we use localstorage directly for jump-prevention
      initial={false}
      animate={{ width: collapsed ? 52 : 180 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="h-screen bg-white border-r border-gray-200 flex flex-col relative"
    >
      <button
        onClick={toggleCollapsed}
        className="absolute top-3 -right-3 z-[60] w-6 h-6 rounded-full border border-gray-200 bg-white shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
      >
        {/* Wait until mounted to render the correct icon, preventing server/client HTML mismatch */}
        {mounted && collapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {/* Global Style overrides just to hide the scrollbar UI entirely but keep functionality */}
      <style dangerouslySetInnerHTML={{ __html: `
        .sidebar-scroll-mask::-webkit-scrollbar {
          display: none;
        }
      `}} />

      <nav 
        className="sidebar-scroll-mask flex-1 px-2 py-3 space-y-1 overflow-y-auto overflow-x-hidden pb-6"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* We use 'mounted' flag to ensure child nodes map correctly post-render without layout flashing */}
        {mounted && (
          <>
            {visibleManagement.length > 0 && (
              <>
                <SectionHeader label="Management" icon={LayoutDashboard} collapsed={collapsed} />
                {visibleManagement.map(renderItem)}
              </>
            )}

            {visibleInventory.length > 0 && (
              <>
                <SectionHeader label="Inventory" icon={Boxes} collapsed={collapsed} />
                {visibleInventory.map(renderItem)}
              </>
            )}

            {visiblePOS.length > 0 && (
              <>
                <SectionHeader label="Point of Sale" icon={Store} collapsed={collapsed} />
                {visiblePOS.map(renderItem)}
              </>
            )}

            {visibleAudit.length > 0 && (
              <>
                <SectionHeader label="Audit" icon={ShieldCheck} collapsed={collapsed} />
                {visibleAudit.map(renderItem)}
              </>
            )}

            {visibleSettings.length > 0 && (
              <>
                <SectionHeader label="Settings" icon={Settings} collapsed={collapsed} />
                {visibleSettings.map(renderItem)}
              </>
            )}
          </>
        )}
      </nav>
    </motion.aside>
  );
}

export default React.memo(Sidebar);