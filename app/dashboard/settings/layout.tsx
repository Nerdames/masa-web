"use client";

import { ReactNode, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import clsx from "clsx";

/* -------------------------------------------------------------------------- */
/*                                Navigation                                  */
/* -------------------------------------------------------------------------- */

type Role = "DEV" | "ADMIN" | "MANAGER" | "SALES" | "INVENTORY" | "CASHIER";

type NavItem = {
  name: string;
  href: string;
  roles?: Role[]; // if omitted → visible to all authenticated users
};

const SETTINGS_NAV: NavItem[] = [
  {
    name: "General",
    href: "/dashboard/settings/general",
  },
  {
    name: "Organization",
    href: "/dashboard/settings/organization",
    roles: ["DEV", "ADMIN"],
  },
  {
    name: "Branches",
    href: "/dashboard/settings/branches",
    roles: ["DEV", "ADMIN", "MANAGER"],
  },
  {
    name: "Users & Roles",
    href: "/dashboard/settings/users",
    roles: ["DEV", "ADMIN"],
  },
  {
    name: "Preferences",
    href: "/dashboard/settings/preferences",
  },
  {
    name: "Notifications",
    href: "/dashboard/settings/notifications",
  },
];

/* -------------------------------------------------------------------------- */
/*                                  Layout                                    */
/* -------------------------------------------------------------------------- */

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const role = session?.user?.role as Role | undefined;

  const visibleNav = useMemo(() => {
    return SETTINGS_NAV.filter((item) => {
      if (!item.roles) return true;
      if (!role) return false;
      return item.roles.includes(role);
    });
  }, [role]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-7xl">
        {/* ------------------------------------------------------------------ */}
        {/* Sidebar                                                            */}
        {/* ------------------------------------------------------------------ */}
        <aside className="hidden w-64 shrink-0 border-r bg-white md:block">
          <div className="px-6 py-5">
            <h1 className="text-base font-semibold text-gray-900">Settings</h1>
            <p className="mt-1 text-xs text-gray-500">
              Manage account & system configuration
            </p>
          </div>

          <nav className="px-3 pb-6">
            <ul className="space-y-1">
              {visibleNav.map((item) => {
                const active = pathname === item.href;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={clsx(
                        "flex items-center rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-gray-100 font-medium text-gray-900"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        {/* ------------------------------------------------------------------ */}
        {/* Main Content                                                       */}
        {/* ------------------------------------------------------------------ */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
