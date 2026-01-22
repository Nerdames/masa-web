"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import ConfirmModal from "@/components/modal/ConfirmModal";
import { Tooltip } from "@/components/feedback/Tooltip";

// ---------------- Types ----------------
export interface SidebarItem {
  key: string;
  name: string;
  href: string;
  icon: string;
  mode: "dashboard" | "settings";
  children?: SidebarItem[];
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  items: SidebarItem[];
  active: string;
  onClick: (item: SidebarItem) => void;
}

// ------------------ Skeleton ------------------
interface SidebarSkeletonProps {
  collapsed: boolean;
  navCount: number;
}

const SidebarSkeleton: React.FC<SidebarSkeletonProps> = ({ collapsed, navCount }) => (
  <div className="flex flex-col h-full animate-pulse">
    <div className="flex items-center h-12 px-4 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 bg-gray-200 rounded" />
        {!collapsed && <div className="h-4 w-20 bg-gray-200 rounded" />}
      </div>
    </div>

    {!collapsed && (
      <div className="sticky top-12 z-30 bg-white px-4 pt-4 pb-2">
        <div className="h-3 w-12 bg-gray-200 rounded" />
      </div>
    )}

    <nav className="flex-1 flex flex-col py-3 space-y-2 px-2">
      {Array.from({ length: navCount }).map((_, idx) => (
        <div key={idx} className="flex items-center gap-3 px-2 py-3">
          <div className="h-6 w-6 bg-gray-200 rounded" />
          {!collapsed && <div className="h-4 w-20 bg-gray-200 rounded" />}
        </div>
      ))}
    </nav>

    <div className="border-t px-4 py-4 bg-white">
      <div className="flex items-center gap-3">
        <div className="h-6 w-6 bg-gray-200 rounded" />
        {!collapsed && <div className="h-4 w-20 bg-gray-200 rounded" />}
      </div>
    </div>
  </div>
);

// ------------------ Sidebar ------------------
export default function Sidebar({
  open,
  onClose,
  items,
  active,
  onClick,
}: SidebarProps) {
  const pathname = usePathname() ?? "/";
  const { status } = useSession();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "true";
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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

  const handleSignOut = async () => {
    setConfirmOpen(false);
    setSigningOut(true);
    await signOut({ callbackUrl: "/" });
    setSigningOut(false);
  };

  // Helper to determine if item (or any child) is active
  const isItemActive = (item: SidebarItem): boolean => {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) return true;
    if (item.children) return item.children.some(isItemActive);
    return false;
  };

  // Recursive render for nested children
  const renderItem = (item: SidebarItem, level: number = 0) => {
    const activeItem = isItemActive(item);
    const padding = level * 12; // indent for submenus

    const link = (
      <Link
        key={item.key}
        href={item.href}
        onClick={() => onClick(item)}
        role="menuitem"
        aria-current={activeItem ? "page" : undefined}
        tabIndex={0}
        className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-all
          ${activeItem ? "bg-black text-white" : "text-gray-700 hover:bg-gray-100"}`}
        style={{ paddingLeft: `${padding + 16}px` }}
      >
        <i className={`bx ${item.icon} text-xl w-6`} />
        <span
          className={`transition-all duration-300 ${
            collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
          }`}
        >
          {item.name}
        </span>
      </Link>
    );

    return (
      <div key={item.key} className="pl-2 pr-4">
        {collapsed ? <Tooltip content={item.name}>{link}</Tooltip> : link}
        {item.children && (
          <div className="flex flex-col">
            {item.children.map((child) => renderItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <ConfirmModal
        open={confirmOpen}
        title="Confirm Sign Out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        destructive
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSignOut}
      />

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        role="navigation"
        aria-label="Main navigation"
        className={`fixed lg:static z-40 top-0 left-0 h-full bg-white border-r border-gray-200 shadow-sm
          flex flex-col transition-all duration-300
          ${collapsed ? "w-20" : "w-64"}
          ${open ? "translate-x-0" : "-translate-x-64 lg:translate-x-0"}`}
      >
        {status === "loading" ? (
          <SidebarSkeleton collapsed={collapsed} navCount={items.length} />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center h-12 px-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <i className="bx bx-bar-chart-alt-2 text-3xl w-6" />
                <span
                  className={`text-lg font-semibold transition-all duration-300 ${
                    collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                  }`}
                >
                  MASA
                </span>
              </div>
              <div className="ml-auto">
                <button
                  onClick={() => setCollapsed(!collapsed)}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  aria-expanded={!collapsed}
                  className="p-1 rounded hover:bg-gray-100 transition"
                >
                  <i
                    className={`bx text-2xl ${collapsed ? "bx-chevron-right" : "bx-chevron-left"}`}
                  />
                </button>
              </div>
            </div>

            {/* Menu label */}
            <div className="sticky top-12 bg-white px-4 pt-4 pb-2 text-gray-500 text-sm font-medium uppercase">
              Menu
            </div>

            {/* Navigation */}
            <nav role="menu" aria-label="Primary" className="flex-1 flex flex-col py-3 space-y-2">
              {items.map((item) => renderItem(item))}
            </nav>

            {/* Sign Out */}
            <div className="border-t px-4 py-4 bg-white">
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={signingOut}
                aria-label="Sign out"
                className="flex items-center gap-3 text-gray-700 hover:text-black transition"
              >
                <i className="bx bx-log-out text-xl w-6" />
                <span
                  className={`transition-all duration-300 ${
                    collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                  }`}
                >
                  {signingOut ? "Signing out..." : "Sign out"}
                </span>
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
