"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { motion } from "framer-motion";
import { Tooltip } from "@/core/components/feedback/Tooltip";
import { useSession } from "next-auth/react";

/* --------------------------------------------- */
/* Types */
/* --------------------------------------------- */

export interface SidebarItem {
  key: string;
  name: string;
  href: string;
  icon: string;
}

/* --------------------------------------------- */
/* Navigation Config */
/* --------------------------------------------- */

const ADMIN_ITEMS: SidebarItem[] = [
  { key: "overview", name: "Overview", href: "/admin/overview", icon: "bx-doughnut-chart" },
  { key: "branches", name: "Branches", href: "/admin/branches", icon: "bx-buildings" },
  { key: "personnels", name: "Personnels", href: "/admin/personnels", icon: "bx-group" },
];

const AUDIT_ITEMS: SidebarItem[] = [
  { key: "logs", name: "Logs", href: "/audit/logs", icon: "bx-list-ul" },
  { key: "reports", name: "Reports", href: "/audit/reports", icon: "bx-file-find" },
];

const SETTINGS_ITEMS: SidebarItem[] = [
  { key: "profile", name: "Profile", href: "/settings/profile", icon: "bx-user" },
  { key: "notifications", name: "Notifications", href: "/settings/notifications", icon: "bx-bell" },
  { key: "preferences", name: "Preferences", href: "/settings/preferences", icon: "bx-brush" },
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
      <i className={`bx ${item.icon} text-[18px] flex-shrink-0`} />
      {!collapsed && (
        <span className="text-[13px] font-medium truncate">
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

const SectionHeader = ({ label, icon, collapsed }: { label: string; icon: string; collapsed: boolean }) => (
  <div className={`flex items-center text-gray-400 px-3 pt-6 pb-2 transition-all duration-200 ${collapsed ? "justify-center" : "gap-2"}`}>
    <i className={`bx ${icon} text-[16px] flex-shrink-0`} />
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
  const { data: session } = useSession();
  const user = session?.user;

  const [collapsed, setCollapsed] = useState<boolean | null>(null);
  const isCollapsed = collapsed ?? false;

  // 1. Fetch Preference (Preserved)
  useEffect(() => {
    const fetchPreference = async () => {
      if (!user?.organizationId || !user?.branchId || !user?.id) {
        const saved = localStorage.getItem("sidebar-collapsed");
        if (saved) setCollapsed(saved === "true");
        return;
      }

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

        if (data.success) {
          setCollapsed(Boolean(data.preference));
          localStorage.setItem("sidebar-collapsed", String(data.preference));
        } else {
          const saved = localStorage.getItem("sidebar-collapsed");
          if (saved) setCollapsed(saved === "true");
        }
      } catch {
        const saved = localStorage.getItem("sidebar-collapsed");
        if (saved) setCollapsed(saved === "true");
      }
    };

    fetchPreference();
  }, [user]);

  // 2. Toggle & Save Preference (Preserved)
  const toggleCollapsed = async () => {
    const next = !isCollapsed;
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

  // 3. Active State Logic
  const activeKeys = useMemo(() => {
    const all = [...ADMIN_ITEMS, ...AUDIT_ITEMS, ...SETTINGS_ITEMS];
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
        collapsed={isCollapsed}
      />
    ),
    [activeKeys, isCollapsed]
  );

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 52 : 180 }}
      transition={{ duration: 0.2, ease: "easeInOut" }} // Removed heavy spring physics
      className="h-screen bg-white border-r border-gray-200 flex flex-col relative"
    >
      <button
        onClick={toggleCollapsed}
        className="absolute top-3 -right-3 z-[60] w-6 h-6 rounded-full border border-gray-200 bg-white shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
      >
        <i className={`bx ${isCollapsed ? "bx-chevron-right" : "bx-chevron-left"} text-gray-500`} />
      </button>

      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto overflow-x-hidden pb-6">
        <SectionHeader label="Management" icon="bx-grid-alt" collapsed={isCollapsed} />
        {ADMIN_ITEMS.map(renderItem)}

        <SectionHeader label="Audit" icon="bx-shield-quarter" collapsed={isCollapsed} />
        {AUDIT_ITEMS.map(renderItem)}

        <SectionHeader label="Settings" icon="bx-cog" collapsed={isCollapsed} />
        {SETTINGS_ITEMS.map(renderItem)}
      </nav>
      
      {/* Account Bottom Section entirely removed */}
    </motion.aside>
  );
}

export default React.memo(Sidebar);