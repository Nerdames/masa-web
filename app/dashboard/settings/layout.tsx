"use client";

import { ReactNode, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import clsx from "clsx";

/* -------------------------------------------------------------------------- */
/*                                Navigation                                  */
/* -------------------------------------------------------------------------- */

type NavItem = {
  name: string;
  href: string;
  visible: (caps: Capabilities) => boolean;
};

type Capabilities = {
  isDev: boolean;
  isOrgOwner: boolean;
  isAdmin: boolean;
  isManager: boolean;
};

const SETTINGS_NAV: NavItem[] = [
  { name: "General", href: "/dashboard/settings/general", visible: () => true },
  { name: "Organizations", href: "/dashboard/settings/organizations", visible: ({ isDev }) => isDev },
  {
    name: "Branches",
    href: "/dashboard/settings/branches",
    visible: ({ isDev, isOrgOwner, isAdmin }) => isDev || isOrgOwner || isAdmin,
  },
  {
    name: "Personnels & Roles",
    href: "/dashboard/settings/personnels",
    visible: ({ isDev, isOrgOwner, isAdmin }) => isDev || isOrgOwner || isAdmin,
  },
  { name: "Notifications", href: "/dashboard/settings/notifications", visible: () => true },
];

/* -------------------------------------------------------------------------- */
/*                                  Layout                                    */
/* -------------------------------------------------------------------------- */

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const caps = useMemo<Capabilities>(() => {
    const roles = session?.user?.roles ?? [];
    return {
      isDev: roles.includes("DEV"),
      isOrgOwner: Boolean(session?.user?.isOrgOwner),
      isAdmin: roles.includes("ADMIN"),
      isManager: roles.includes("MANAGER"),
    };
  }, [session]);

  const visibleNav = useMemo(
    () => SETTINGS_NAV.filter(item => item.visible(caps)),
    [caps]
  );

  const renderNavItem = (item: NavItem) => {
    const active = pathname.startsWith(item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={clsx(
            "flex items-center rounded-md px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            active
              ? "bg-gray-100 font-medium text-gray-900"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          )}
        >
          {item.name}
        </Link>
      </li>
    );
  };

  return (
    // 🔒 Lock viewport scroll here
    <div className="h-screen overflow-hidden bg-gray-50">
      <div className="mx-auto flex h-full max-w-7xl">
        {/* Sidebar */}
        <aside className="hidden h-full w-52 shrink-0 border-r bg-white md:flex md:flex-col">
          <div className="px-6 py-5">
            <h1 className="text-base font-semibold text-gray-900">Settings</h1>
            <p className="mt-1 text-xs text-gray-500">
              Manage account, organization & branch configuration
            </p>
          </div>

          <nav className="flex-1 px-3 pb-6">
            <ul className="space-y-1">{visibleNav.map(renderNavItem)}</ul>
          </nav>
        </aside>

        {/* Main Content (ONLY scrollable area) */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
