"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import AccessDenied from "@/components/feedback/AccessDenied";

const NAV_GROUPS = [
  {
    label: "General",
    roles: ["DEV", "ADMIN", "MANAGER", "SALES", "INVENTORY", "CASHIER"],
    items: [
      { label: "Profile", path: "/dashboard/settings/profile", icon: "bx-user" },
      { label: "Notifications", path: "/dashboard/settings/notifications", icon: "bx-bell" },
      { label: "Preferences", path: "/dashboard/settings/preferences", icon: "bx-cog" },
    ]
  },
  {
    label: "Organization",
    roles: ["DEV", "ADMIN", "MANAGER"],
    items: [
      { label: "Organizations", path: "/dashboard/settings/organizations", icon: "bx-buildings" },
      { label: "Branches", path: "/dashboard/settings/branches", icon: "bx-git-branch" },
      { label: "Personnels", path: "/dashboard/settings/personnels", icon: "bx-group" },
    ]
  },
  {
    label: "Inventory Hub",
    roles: ["DEV", "ADMIN", "MANAGER", "INVENTORY"],
    items: [
      { label: "Products", path: "/dashboard/settings/products", icon: "bx-package" },
      { label: "Vendors", path: "/dashboard/settings/vendors", icon: "bx-store" },
    ]
  },
  {
    label: "System",
    roles: ["DEV", "ADMIN"],
    items: [
      { label: "Audit Logs", path: "/dashboard/settings/logs", icon: "bx-list-ul" },
      { label: "Extensions", path: "/dashboard/settings/extensions", icon: "bx-plug" },
      { label: "Analytics", path: "/dashboard/settings/analytics", icon: "bx-bar-chart" },
    ]
  }
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const userRole = session?.user?.role;

  // Manage up to 2 expanded groups at once
  const [expandedGroups, setExpandedGroups] = useState<string[]>([NAV_GROUPS[0].label]);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      // If already open, close it
      if (prev.includes(label)) {
        return prev.filter((l) => l !== label);
      }
      
      // If we have 2 open and are opening a 3rd, drop the oldest (first in array)
      const newGroups = [...prev, label];
      if (newGroups.length > 2) {
        return newGroups.slice(1);
      }
      
      return newGroups;
    });
  };

  if (status === "loading") return <CenteredLoader />;
  if (!userRole) return <AccessDenied />;

  const visibleGroups = NAV_GROUPS
    .map(group => ({
      ...group,
      items: group.items.filter(() => group.roles.includes(userRole))
    }))
    .filter(group => group.items.length > 0);

  const ALL_ROUTES = NAV_GROUPS.flatMap(group =>
    group.items.map(item => ({ path: item.path, roles: group.roles }))
  );

  const matchedRoute = ALL_ROUTES.find(route => pathname.startsWith(route.path));
  const isAuthorized = matchedRoute ? matchedRoute.roles.includes(userRole) : true;

  if (!isAuthorized) return <AccessDenied />;

  return (
    <div className="flex max-w-7xl mx-auto h-screen overflow-hidden bg-white dark:bg-black">

      {/* SIDEBAR */}
      <aside className="w-44 bg-white dark:bg-black border-r border-gray-100 dark:border-white/10 flex flex-col select-none h-full overflow-hidden">
        
        {/* TOP TITLE & DESCRIPTION */}
        <div className="px-6 pt-8 pb-2">
          <h2 className="text-[13px] font-bold text-gray-900 dark:text-white tracking-tight">
            Settings
          </h2>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed mt-1">
            Configure your workspace and personal account.
          </p>
        </div>

        {/* Scrollable Nav Area */}
        <div className="flex-1 overflow-y-auto pt-6 pb-10 scrollbar-hide">
          <div className="flex flex-col gap-6">
            {visibleGroups.map((group) => {
              const isOpen = expandedGroups.includes(group.label);

              return (
                <div key={group.label} className="flex flex-col">
                  {/* Collapsible Label */}
                  <button 
                    onClick={() => toggleGroup(group.label)}
                    className="px-6 flex items-center justify-between group mb-1.5 w-full text-left"
                  >
                    <h3 className={`text-[10px] font-black uppercase tracking-[0.15em] transition-colors duration-200 ${
                      isOpen ? "text-blue-500" : "text-gray-900 dark:text-white"
                    }`}>
                      {group.label}
                    </h3>
                    <i className={`bx bx-chevron-down text-gray-300 transition-transform duration-300 ${isOpen ? "" : "-rotate-90"}`} />
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.nav 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="flex flex-col overflow-hidden"
                      >
                        {group.items.map((item) => {
                          const active = pathname.startsWith(item.path);

                          return (
                            <Link
                              key={item.path}
                              href={item.path}
                              className={`group relative flex items-center gap-3 py-2.5 pl-4 overflow-hidden transition-all duration-300
                                ${active 
                                  ? "bg-gray-900 dark:bg-white text-white dark:text-black rounded-l-[28px] z-10" 
                                  : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5"
                                }
                              `}
                            >
                              {active && (
                                <>
                                  <div className="absolute right-0 -top-[20px] w-[20px] h-[20px] bg-gray-900 dark:bg-white pointer-events-none 
                                    after:content-[''] after:absolute after:inset-0 after:bg-white dark:after:bg-black after:rounded-br-[20px]" />
                                  <div className="absolute right-0 -bottom-[20px] w-[20px] h-[20px] bg-gray-900 dark:bg-white pointer-events-none 
                                    after:content-[''] after:absolute after:inset-0 after:bg-white dark:after:bg-black after:rounded-tr-[20px]" />
                                </>
                              )}

                              <i className={`bx ${item.icon} text-[17px] transition-colors ${
                                active ? "text-blue-400 dark:text-blue-600" : "text-gray-400 group-hover:text-gray-600"
                              }`} />

                              <span className={`text-[11px] tracking-tight whitespace-nowrap ${
                                active ? "font-bold" : "font-semibold"
                              }`}>
                                {item.label}
                              </span>

                              {active && (
                                <div className="absolute -right-[1px] top-0 bottom-0 w-[1px] bg-gray-900 dark:bg-white z-20" />
                              )}
                            </Link>
                          );
                        })}
                      </motion.nav>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 bg-white dark:bg-black h-full overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

function CenteredLoader() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-white dark:bg-black">
      <i className="bx bx-loader-alt bx-spin text-gray-300 dark:text-white/20 text-3xl" />
    </div>
  );
}