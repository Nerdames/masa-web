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
import { Tooltip } from "@/core/components/feedback/Tooltip";
import { useSession, signOut } from "next-auth/react";
import { getInitials } from "@/core/utils";
import ConfirmModal from "@/core/components/modal/ConfirmModal";
import { Role } from "@prisma/client"

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
/* Navigation Config (Mapped to Folder Tree) */
/* --------------------------------------------- */

const ADMIN_ITEMS: SidebarItem[] = [
  { key: "dashboard", name: "Dashboard", href: "/admin/dashboard", icon: "bx-grid-alt" },
  { key: "branches", name: "Branches", href: "/admin/branches", icon: "bx-buildings", roles: [Role.ADMIN] },
  { key: "personnels", name: "Personnels", href: "/admin/personnels", icon: "bx-user-circle", roles: [Role.ADMIN] },
];

const AUDIT_ITEMS: SidebarItem[] = [
  { key: "logs", name: "Logs", href: "/audit/logs", icon: "bx-list-ul", roles: [Role.AUDITOR, Role.DEV, Role.ADMIN] },
  { key: "reports", name: "Reports", href: "/audit/reports", icon: "bx-file-find", roles: [Role.AUDITOR, Role.DEV] },
];

const SETTINGS_ITEMS: SidebarItem[] = [
  { key: "profile", name: "Profile", href: "/settings/profile", icon: "bx-user" },
  { key: "notifications", name: "Notifications", href: "/settings/notifications", icon: "bx-bell" },
  { key: "preferences", name: "Preferences", href: "/settings/preferences", icon: "bx-cog" },
];

/* --------------------------------------------- */
/* Motion */
/* --------------------------------------------- */

const SIDEBAR_MOTION = {
  expanded: { width: 200 },
  collapsed: { width: 52 },
};

/* --------------------------------------------- */
/* Sidebar Item */
/* --------------------------------------------- */

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
      aria-current={active ? "page" : undefined}
      className={`
      relative flex items-center rounded-md
      ${collapsed ? "h-9 w-9 justify-center mx-auto" : "px-3 py-2 gap-3"}
      text-[13px] font-medium transition-colors
      ${active ? "text-white" : "text-gray-700 hover:bg-gray-100"}
      `}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-md bg-blue-600"
          transition={{ type: "spring", stiffness: 480, damping: 38 }}
        />
      )}

      <i className={`bx ${item.icon} text-[18px] relative z-10`} />

      {!collapsed && (
        <span className="truncate relative z-10">{item.name}</span>
      )}
    </Link>
  );

  return collapsed ? <Tooltip side="right" content={item.name}>{link}</Tooltip> : link;
});

/* --------------------------------------------- */
/* Dropdown Menu */
/* --------------------------------------------- */

interface MenuItem {
  label: string;
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
  containerRef: React.RefObject<HTMLDivElement>;
}) => {
  useEffect(() => {
    if (!show) return;

    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setShow(false);
      }
    };

    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShow(false);
    };

    document.addEventListener("mousedown", handler);
    window.addEventListener("keydown", esc);

    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", esc);
    };
  }, [show, containerRef, setShow]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          style={{ left: parentWidth }}
          className="absolute bottom-0 mb-14 w-56 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50"
        >
          <div className="absolute left-0 top-4 -ml-2 w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-r-[8px] border-r-white" />

          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => {
                item.action?.();
                setShow(false);
              }}
              className={`w-full px-4 py-2 text-[13px] flex items-center gap-3 hover:bg-gray-100
              ${item.destructive ? "text-red-600 hover:bg-red-50" : "text-gray-700"}
              `}
            >
              {item.icon && <i className={`bx ${item.icon} text-[16px]`} />}
              {item.label}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* --------------------------------------------- */
/* Sidebar */
/* --------------------------------------------- */

function Sidebar() {
  const pathname = usePathname() ?? "/";
  const { data: session } = useSession();
  const user = session?.user;

  const [collapsed, setCollapsed] = useState<boolean | null>(null);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const accountRef = useRef<HTMLDivElement>(null);

  const isCollapsed = collapsed ?? false;
  const sidebarWidth = isCollapsed ? 52 : 180;

  useEffect(() => {
    const fetchPreference = async () => {
      if (!user?.organizationId || !user?.branchId || !user?.id) {
        const saved = localStorage.getItem("sidebar-collapsed");
        setCollapsed(saved === "true");
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
          setCollapsed(saved === "true");
        }
      } catch {
        const saved = localStorage.getItem("sidebar-collapsed");
        setCollapsed(saved === "true");
      }
    };

    fetchPreference();
  }, [user]);

  const toggleCollapsed = async () => {
    const next = !isCollapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));

    if (!user?.organizationId || !user?.branchId || !user?.id) return;

    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

  const accountMenu: MenuItem[] = user
    ? [
        {
          label: "Profile",
          icon: "bx-user",
          action: () => (window.location.href = "/dashboard/settings/profile"),
        },
        {
          label: "Preferences",
          icon: "bx-cog",
          action: () => (window.location.href = "/dashboard/settings/preferences"),
        },
        {
          label: "Log out",
          icon: "bx-log-out",
          destructive: true,
          action: () => setShowLogoutConfirm(true),
        },
      ]
    : [];

  return (
    <motion.aside
      initial={true}
      animate={isCollapsed ? "collapsed" : "expanded"}
      variants={SIDEBAR_MOTION}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="h-screen bg-white border-r border-gray-200 flex flex-col relative"
    >
      <button
        onClick={toggleCollapsed}
        className="absolute top-3 -right-3 z-[60] w-6 h-6 rounded-full border border-gray-200 bg-white shadow flex items-center justify-center hover:bg-gray-100"
      >
        <i className={`bx ${isCollapsed ? "bx-chevron-right" : "bx-chevron-left"}`} />
      </button>

      <nav className="flex-1 px-2 py-3 space-y-1">
        {!isCollapsed && (
          <div className="text-[12px] text-gray-400 px-3 pt-3 pb-3 uppercase">
            Management
          </div>
        )}
        {ADMIN_ITEMS.map(renderItem)}

        {!isCollapsed && (
          <div className="text-[12px] text-gray-400 px-3 pt-3 pb-3 uppercase">
            Audit
          </div>
        )}

        {AUDIT_ITEMS.map(renderItem)}

        {!isCollapsed && (
          <div className="text-[12px] text-gray-400 px-3 pt-3 pb-3 uppercase">
            Settings
          </div>
        )}

        {SETTINGS_ITEMS.map(renderItem)}
      </nav>

      <div className="border-t border-gray-200 p-2">
        <div ref={accountRef} className="relative">

          {!user && (
            <Link
              href="/signin"
              className={`flex items-center rounded-md hover:bg-gray-100
              ${isCollapsed ? "h-9 w-9 justify-center mx-auto" : "px-3 py-2 gap-3"}
              `}
            >
              <i className="bx bx-log-in text-[18px]" />

              {!isCollapsed && (
                <span className="text-[13px] font-medium">
                  Sign In
                </span>
              )}
            </Link>
          )}

          {user && (
            <button
              onClick={() => setShowAccountMenu((p) => !p)}
              className={`flex items-center w-full rounded-md hover:bg-gray-100
              ${isCollapsed ? "h-9 w-9 justify-center mx-auto" : "px-3 py-2 gap-3"}
              `}
            >
              <div className="w-7 h-7 rounded-full bg-black text-white flex items-center justify-center text-[12px] font-semibold">
                {getInitials(user.name)}
              </div>

              {!isCollapsed && (
                <div className="flex flex-col text-left truncate">
                  <span className="text-[13px] font-medium text-gray-900 truncate">
                    {user.name}
                  </span>

                  <span className="text-[11px] text-gray-500 truncate">
                    {user.email}
                  </span>
                </div>
              )}
            </button>
          )}

          {user && (
            <DropdownMenu
              items={accountMenu}
              show={showAccountMenu}
              setShow={setShowAccountMenu}
              parentWidth={sidebarWidth}
              containerRef={accountRef}
            />
          )}

        </div>
      </div>

      <ConfirmModal
        open={showLogoutConfirm}
        title="Log out"
        message="Are you sure you want to log out of your account?"
        confirmLabel="Log out"
        destructive
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={async () => {
          await signOut({ callbackUrl: "/" });
        }}
      />
    </motion.aside>
  );
}

export default React.memo(Sidebar);