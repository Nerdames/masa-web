"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { motion } from "framer-motion";
import { Role } from "@prisma/client";

// Import core UI and hooks from centralized shared layers
import { Tooltip } from "@/shared/ui/Tooltip";
import { usePermission } from "@/shared/hooks/usePermission";

// Lucide React Icons
import { 
  // Admin & Layout Icons
  Network,          // Admin Overview
  Building2,        // Organization
  MapPin,           // Branches
  Users,            // Personnel (Internal Team)
  ChevronLeft,      // Sidebar Collapse Trigger
  ChevronRight,     // Sidebar Expand Trigger
  LayoutDashboard,  // Main Platform Shell Dashboard
  Settings,         // Settings Module Root
  ShieldCheck,      // Core Access Permissions Indicator
  Store,            // Terminal Module Root
  
  // Inventory System Icons
  Warehouse,        // Inventory Overview
  Box,              // Stock Levels / Fortress
  Database,         // Product Registry
  Truck,            // Procurement (Supplier Shipping)
  FileCheck2,       // Inventory Approvals Guard
  Boxes,            // Stock Takes (Physical count)
  ArrowLeftRight,   // Stock Transfers
  TrendingUp,       // Inventory Valuations & Reports
  Undo2,            // Vendor Inventory Returns
  Contact,          // B2B Suppliers / Vendors
  
  // POS System Icons
  MonitorPlay,      // POS Terminal Dashboard Overview
  ShoppingCart,     // Live Retail POS Terminal
  Activity,         // Active Shift POS Sessions
  FileEdit,         // In-Progress Sales Drafts
  PackageCheck,     // Standard Invoices
  UserCheck,        // Retail Customers
  Coins,            // POS Cash Refunds & Customer Returns
  Receipt,          // POS Financial Reports
  Terminal,         // Terminal System Logs
  
  // Auditing & Security Icons
  ShieldAlert,      // Auditing Master Overview
  Fingerprint,      // Forensic Log Audits
  Scale,            // Auditing Compliance/Approval Queue
  FileSearch,       // Forensic Stock Cross-examination
  RefreshCcw,       // Transaction Reconciliation Engine
  History,          // Historic Refund Watchdog Monitor
  Landmark,         // Node Integrity System Decentralization
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

/* --------------------------------------------- */
/* 1. MANAGEMENT ITEMS (src/app/(dashboard)/admin/*) */
/* --------------------------------------------- */
export const MANAGEMENT_ITEMS: SidebarItem[] = [
  { key: "admin-ovw", name: "Overview", href: "/admin/overview", icon: Network, roles: [Role.ADMIN, Role.DEV, Role.MANAGER] },
  { key: "org", name: "Org & Defaults", href: "/admin/myorg", icon: Building2, roles: [Role.ADMIN, Role.DEV] },
  { key: "branches", name: "Branches", href: "/admin/branches", icon: MapPin, roles: [Role.ADMIN, Role.DEV] },
  { key: "personnels", name: "Personnel", href: "/admin/personnels", icon: Users, roles: [Role.ADMIN, Role.DEV] },
];

/* --------------------------------------------- */
/* 2. INVENTORY ITEMS (src/app/(terminal)/inventory/*) */
/* --------------------------------------------- */
export const INVENTORY_ITEMS: SidebarItem[] = [
  { key: "inv-ovw", name: "Overview", href: "/inventory", icon: Warehouse, roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.AUDITOR, Role.DEV] },
  { key: "inv-fortress", name: "Stock Levels", href: "/inventory/fortress", icon: Box, roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.AUDITOR, Role.DEV] },
  { key: "inv-registry", name: "Product Registry", href: "/inventory/products", icon: Database, roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.DEV] },
  { key: "inv-proc", name: "Procurement", href: "/inventory/procurement", icon: Truck, roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.DEV] },
  { key: "inv-app", name: "Approvals", href: "/inventory/approvals", icon: FileCheck2, roles: [Role.ADMIN, Role.MANAGER, Role.DEV] },
  { key: "inv-stock", name: "Stock Take", href: "/inventory/stock-takes", icon: Boxes, roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.DEV] },
  { key: "inv-trans", name: "Transfers", href: "/inventory/transfers", icon: ArrowLeftRight, roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.DEV] },
  { key: "inv-rep", name: "Reports", href: "/inventory/reports", icon: TrendingUp, roles: [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV] },
  { key: "inv-ref", name: "Returns & Claims", href: "/inventory/refunds", icon: Undo2, roles: [Role.ADMIN, Role.MANAGER, Role.DEV] }, 
  { key: "inv-ven", name: "Vendors", href: "/inventory/vendors", icon: Contact, roles: [Role.ADMIN, Role.MANAGER, Role.DEV] },
];

/* --------------------------------------------- */
/* 3. POS TERMINAL ITEMS (src/app/(terminal)/pos/*) */
/* --------------------------------------------- */
export const POS_ITEMS: SidebarItem[] = [
  { key: "pos-ovw", name: "Overview", href: "/pos", icon: MonitorPlay, roles: [Role.ADMIN, Role.MANAGER, Role.SALES, Role.CASHIER, Role.DEV] },
  { key: "pos-term", name: "Sales Terminal", href: "/pos/terminal", icon: ShoppingCart, roles: [Role.ADMIN, Role.MANAGER, Role.SALES, Role.CASHIER, Role.DEV] },
  { key: "pos-sess", name: "POS Sessions", href: "/pos/sessions", icon: Activity, roles: [Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.DEV] },
  { key: "pos-drafts", name: "Draft Sales", href: "/pos/drafts", icon: FileEdit, roles: [Role.ADMIN, Role.MANAGER, Role.SALES, Role.CASHIER, Role.DEV] },
  { key: "pos-inv", name: "Invoices", href: "/pos/invoices", icon: PackageCheck, roles: [Role.ADMIN, Role.MANAGER, Role.SALES, Role.CASHIER, Role.AUDITOR, Role.DEV] },
  { key: "pos-cust", name: "Customers", href: "/pos/customers", icon: UserCheck, roles: [Role.ADMIN, Role.MANAGER, Role.SALES, Role.CASHIER, Role.DEV] },
  { key: "pos-ref", name: "Customer Returns", href: "/pos/refunds", icon: Coins, roles: [Role.ADMIN, Role.MANAGER, Role.DEV] }, 
  { key: "pos-rep", name: "POS Reports", href: "/pos/reports", icon: Receipt, roles: [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV] },
  { key: "pos-aud", name: "Terminal Logs", href: "/pos/activity", icon: Terminal, roles: [Role.ADMIN, Role.AUDITOR, Role.DEV] },
];

/* --------------------------------------------- */
/* 4. FORENSIC AUDITING ITEMS (src/app/(dashboard)/audit/*) */
/* --------------------------------------------- */
export const AUDIT_ITEMS: SidebarItem[] = [
  { key: "aud-ovw", name: "Overview", href: "/audit", icon: ShieldAlert, roles: [Role.AUDITOR, Role.ADMIN, Role.DEV] },
  { key: "aud-logs", name: "Forensic Logs", href: "/audit/logs", icon: Fingerprint, roles: [Role.AUDITOR, Role.ADMIN, Role.DEV] },
  { key: "aud-app", name: "Approval Queue", href: "/audit/approvals", icon: Scale, roles: [Role.AUDITOR, Role.ADMIN, Role.MANAGER] },
  { key: "aud-stk", name: "Stock Audit", href: "/audit/stock-takes", icon: FileSearch, roles: [Role.AUDITOR, Role.ADMIN, Role.INVENTORY] },
  { key: "aud-rec", name: "Reconciliation", href: "/audit/reconciliation", icon: RefreshCcw, roles: [Role.AUDITOR, Role.ADMIN] },
  { key: "aud-ref", name: "Refund Monitor", href: "/audit/refunds", icon: History, roles: [Role.AUDITOR, Role.ADMIN, Role.MANAGER] },
  { key: "aud-node", name: "Node Integrity", href: "/audit/nodes", icon: Landmark, roles: [Role.AUDITOR, Role.DEV] },
];

/* --------------------------------------------- */
/* Sidebar Item Component */
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
/* Sidebar Section Header Component */
/* --------------------------------------------- */

const SectionHeader = React.memo(function SectionHeader({ label, icon: Icon, collapsed }: { label: string; icon: React.ElementType; collapsed: boolean }) {
  return (
    <div className={`flex items-center text-gray-400 px-3 py-2 transition-all duration-200 ${collapsed ? "justify-center" : "gap-2"}`}>
      <Icon className="w-4 h-4 flex-shrink-0" />
      {!collapsed && (
        <span className="text-[11px] font-bold uppercase tracking-wider truncate">
          {label}
        </span>
      )}
    </div>
  );
});

/* --------------------------------------------- */
/* Main Sidebar Shell Component */
/* --------------------------------------------- */

function Sidebar() {
  const pathname = usePathname() ?? "/";
  const { user } = usePermission();

  // 1. Uniform Environment Initialization to secure perfect server-client HTML matching
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  // 2. Generate a stable primitive hash token for session profiling tracking
  const userKey = user?.id && user?.organizationId && user?.branchId 
    ? `${user.id}-${user.organizationId}-${user.branchId}` 
    : null;

  // 3. Hydrate state instantly on mount from local storage to prevent layout flashes
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const localState = localStorage.getItem("sidebar-collapsed");
      if (localState !== null) {
        setCollapsed(localState === "true");
      }
    }
  }, []);

  // 4. Sync State with Database Preference Table safely
  useEffect(() => {
    if (!userKey || !user) return;

    let isCurrentFetch = true;

    const fetchPreference = async () => {
      try {
        const params = new URLSearchParams({
          organizationId: user.organizationId!,
          branchId: user.branchId!,
          personnelId: user.id!,
          category: "LAYOUT",
          key: "sidebar-collapsed",
          target: "",
        });

        const res = await fetch(`/api/preferences?${params.toString()}`);
        if (!res.ok) return;
        
        const data = await res.json();

        if (isCurrentFetch && data.success && data.preference !== undefined) {
          const backendState = Boolean(data.preference);
          
          // Verify if the local state has shifted away from remote storage before triggering updates
          if (backendState !== (localStorage.getItem("sidebar-collapsed") === "true")) {
            setCollapsed(backendState);
            localStorage.setItem("sidebar-collapsed", String(backendState));
          }
        }
      } catch (err) {
        console.error("Failed to fetch sidebar layout configurations:", err);
      }
    };

    fetchPreference();

    return () => {
      isCurrentFetch = false;
    };
  }, [userKey, user]);

  // 5. Toggle State Action Guard
  const toggleCollapsed = async () => {
    const nextState = !collapsed;
    setCollapsed(nextState);
    localStorage.setItem("sidebar-collapsed", String(nextState));

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
          value: nextState,
          target: "",
        }),
      });
    } catch (err) {
      console.error("Failed to persist sidebar runtime preferences:", err);
    }
  };

  // 6. Native Role-Based Access Control Filtering Engine
  const hasAccess = useCallback((roles?: Role[]) => {
    if (!roles || roles.length === 0) return true;
    if (!user) return false;
    if (user.isOrgOwner) return true; // Global superuser elevation pass
    return roles.includes(user.role as Role);
  }, [user]);

  const visibleManagement = useMemo(() => MANAGEMENT_ITEMS.filter(item => hasAccess(item.roles)), [hasAccess]);
  const visibleInventory = useMemo(() => INVENTORY_ITEMS.filter(item => hasAccess(item.roles)), [hasAccess]);
  const visiblePOS = useMemo(() => POS_ITEMS.filter(item => hasAccess(item.roles)), [hasAccess]);
  const visibleAudit = useMemo(() => AUDIT_ITEMS.filter(item => hasAccess(item.roles)), [hasAccess]);

  // 7. Deterministic Longest Matching Route Verification Layer
  const activeKeys = useMemo(() => {
    const allItems = [
      ...MANAGEMENT_ITEMS,
      ...INVENTORY_ITEMS,
      ...POS_ITEMS,
      ...AUDIT_ITEMS,
    ];
    
    let longestMatchLength = 0;
    let selectedItemKey: string | null = null;

    for (const item of allItems) {
      // Explicit exact match or nested sub-route tracking validation
      const isMatch = pathname === item.href || pathname.startsWith(item.href + "/");
      if (isMatch && item.href.length > longestMatchLength) {
        longestMatchLength = item.href.length;
        selectedItemKey = item.key;
      }
    }

    return selectedItemKey ? new Set([selectedItemKey]) : new Set<string>();
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
      suppressHydrationWarning
      initial={false}
      animate={{ width: collapsed ? 52 : 180 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="h-screen bg-white border-r border-gray-200 flex flex-col relative"
    >
      <button
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute top-3 -right-3 z-[60] w-6 h-6 rounded-full border border-gray-200 bg-white shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
      >
        {mounted && collapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </button>

      <style dangerouslySetInnerHTML={{ __html: `
        .sidebar-scroll-mask::-webkit-scrollbar {
          display: none;
        }
      `}} />

      <nav 
        className="sidebar-scroll-mask flex-1 px-2 py-3 space-y-1 overflow-y-auto overflow-x-hidden pb-6"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
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
          </>
        )}
      </nav>
    </motion.aside>
  );
}

export default React.memo(Sidebar);