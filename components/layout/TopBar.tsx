"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import ConfirmModal from "@/components/modal/ConfirmModal";
import { Role } from "@prisma/client";
import { useState } from "react";
import { NotificationsButton } from "@/components/shared/NotificationsButton"; // <-- your new component

/* ---------------------------------------------
 * Role helpers
 * ------------------------------------------- */
const rolePriority: Record<Role, number> = {
  DEV: 4,
  ADMIN: 3,
  MANAGER: 2,
  SALES: 1,
  INVENTORY: 1,
  CASHIER: 1,
};

/* ---------------------------------------------
 * Helpers
 * ------------------------------------------- */
function getInitials(name?: string) {
  if (!name) return "AP";
  const parts = name.trim().split(" ");
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

/* ---------------------------------------------
 * Skeleton Component
 * ------------------------------------------- */
const TopBarSkeleton: React.FC = () => (
  <header className="w-full h-12 flex items-center px-4 border-b bg-white animate-pulse">
    <div className="h-4 bg-gray-200 rounded w-48" />
    <div className="flex-1" />
    <div className="w-8 h-8 bg-gray-200 rounded-full mr-3" />
    <div className="w-7 h-7 rounded-full bg-gray-200 mr-2" />
    <div className="h-4 w-24 bg-gray-200 rounded" />
    <div className="w-4 h-4 bg-gray-200 rounded ml-2" />
  </header>
);

/* ---------------------------------------------
 * TopBar Component
 * ------------------------------------------- */
export default function TopBar() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const user = session?.user;

  // Ensure organizationName fallback
  const orgName = user?.organizationName || "Organization";
  const branchName = user?.branchName;
  const role = user?.role;

  const canAccessSettings =
    user && rolePriority[user.role] >= rolePriority.MANAGER;

  const dashboardTitle = `Dashboard · ${orgName}`;

  // ---------------- Loading / guard ----------------
  if (status === "loading" || !user) {
    return <TopBarSkeleton />;
  }

  const handleSignOut = async () => {
    setConfirmOpen(false);
    await signOut({ callbackUrl: "/" });
  };

  return (
    <>
      <header className="w-full h-12 flex items-center px-4 py-2 border-b border-gray-200 bg-white">
        {/* Dashboard Title */}
        <span className="text-lg font-semibold tracking-wide">
          {dashboardTitle}
        </span>

        <div className="flex-1" />

        <div className="flex items-center gap-3">
          {/* ---------------- Notifications ---------------- */}
          <NotificationsButton />

          {/* ---------------- User Dropdown ---------------- */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer">
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-semibold">
                  {getInitials(user.name || undefined)}
                </div>

                <span className="text-sm font-medium">{user.name}</span>

                <i className="bx bx-chevron-down text-[14px] text-gray-500" />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="bg-white border border-gray-200 rounded shadow-lg w-56 p-2 z-50"
            >
              {/* -------- Organization / Branch / Role -------- */}
              <div className="px-2 py-2 border-b mb-2 text-sm space-y-1">
                <div className="flex items-center gap-2 font-semibold text-gray-800">
                  <i className="bx bx-buildings text-[16px]" />
                  {orgName}
                </div>

                {branchName && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <i className="bx bx-git-branch text-[16px]" />
                    {branchName}
                  </div>
                )}

                {role && (
                  <div className="flex items-center gap-2 text-gray-500 italic">
                    <i className="bx bx-shield text-[16px]" />
                    {role}
                  </div>
                )}
              </div>

              {/* -------- Settings -------- */}
              {canAccessSettings && (
                <DropdownMenu.Item asChild>
                  <button
                    onClick={() => router.push("/dashboard/settings")}
                    className="w-full px-2 py-2 text-sm flex items-center gap-3 rounded hover:bg-gray-100"
                  >
                    <i className="bx bx-cog text-[16px]" />
                    Settings
                  </button>
                </DropdownMenu.Item>
              )}

              {/* -------- Logout -------- */}
              <DropdownMenu.Item asChild>
                <button
                  onClick={() => setConfirmOpen(true)}
                  className="w-full px-2 py-2 text-sm flex items-center gap-3 rounded hover:bg-red-50 text-red-600"
                >
                  <i className="bx bx-log-out text-[16px]" />
                  Sign Out
                </button>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </header>

      {/* ---------------- Sign Out Modal ---------------- */}
      <ConfirmModal
        open={confirmOpen}
        title="Confirm Sign Out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        destructive
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSignOut}
      />
    </>
  );
}
