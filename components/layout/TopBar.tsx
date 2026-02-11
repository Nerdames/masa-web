"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import ConfirmModal from "@/components/modal/ConfirmModal";
import { NotificationsButton } from "@/components/shared/NotificationsButton";
import { Tooltip } from "@/components/feedback/Tooltip";

interface Notification {
  id: string;
  message: string;
  read: boolean;
}

export default function TopBar({ notifications }: { notifications?: Notification[] }) {
  const { data: session, status } = useSession({ required: false });
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const user = session?.user;

  const getInitials = (name?: string) => {
    if (!name) return "AP";
    const parts = name.trim().split(" ");
    return parts.length === 1
      ? parts[0][0].toUpperCase()
      : `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  };

  const safeNotifications = notifications || [];
  const unreadCount = safeNotifications.filter((n) => !n.read).length;

  if (status === "loading" || !user) {
    return (
      <header className="w-full h-10 flex items-center px-3 border-b border-gray-200 bg-white animate-pulse">
        <div className="w-6 h-6 bg-gray-200 rounded mr-2" />
        <div className="h-4 bg-gray-200 rounded flex-1" />
        <div className="w-6 h-6 bg-gray-200 rounded ml-2" />
      </header>
    );
  }

  return (
    <>
      <header className="w-full h-10 flex items-center px-3 border-b border-gray-200 bg-white">
        {/* Left: Logo + OrgName */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gray-900 text-white rounded flex items-center justify-center font-bold cursor-default text-xs">
            L
          </div>
          <span className="text-sm font-semibold">
            {user.organizationName} {user.branchName ? `(${user.branchName})` : ""}
          </span>
        </div>

        {/* Center */}
        <div className="flex-1 flex justify-center items-center gap-2 mx-6 min-w-0">
          {/* Back */}
          <Tooltip
            position="bottom"
            content={
              <span className="flex items-center gap-1">
                Go Back
                <kbd className="ml-1 rounded bg-[#3c3c3c] px-1 text-[10px] font-mono">
                  Alt+←
                </kbd>
              </span>
            }
          >
            <span>
              <button
                disabled
                className="px-2 py-1 rounded hover:bg-gray-100
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ←
              </button>
            </span>
          </Tooltip>

          {/* Forward */}
          <Tooltip
            side="bottom"
            content={
              <span className="flex items-center gap-1">
                Go Forward
                <kbd className="ml-1 rounded bg-[#3c3c3c] px-1 text-[10px] font-mono">
                  Alt+→
                </kbd>
              </span>
            }
          >
            <span>
              <button
                disabled
                className="px-2 py-1 rounded hover:bg-gray-100
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                →
              </button>
            </span>
          </Tooltip>

          <input
            type="text"
            placeholder="Search..."
            className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 rounded
                       focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          {/* Notifications */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="relative p-1 rounded hover:bg-gray-100 ml-2">
                <NotificationsButton />
                {unreadCount > 0 && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="bg-white border border-gray-200 rounded shadow-lg
                         w-80 max-h-64 overflow-y-auto p-2 z-50"
            >
              <div className="flex justify-between items-center px-2 py-1 mb-2 border-b">
                <span className="text-sm font-semibold">Notifications</span>
                <button className="text-xs text-blue-500 hover:underline">
                  Mark all read
                </button>
              </div>

              {safeNotifications.length === 0 ? (
                <div className="px-2 py-1 text-sm text-gray-500">
                  No notifications
                </div>
              ) : (
                safeNotifications.map((n) => (
                  <DropdownMenu.Item
                    key={n.id}
                    className={`px-2 py-2 text-sm rounded hover:bg-gray-100 cursor-pointer ${
                      !n.read ? "font-semibold" : "text-gray-600"
                    }`}
                  >
                    {n.message}
                  </DropdownMenu.Item>
                ))
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>

        {/* Right: Profile */}
        <div className="flex items-center gap-2">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="w-8 h-8 rounded-full bg-gray-900 text-white
                                 flex items-center justify-center text-xs
                                 font-semibold hover:bg-gray-700">
                {getInitials(user.name)}
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="bg-white border border-gray-200 rounded
                         shadow-lg w-48 p-2 z-50"
            >
              <div className="flex flex-col items-center gap-1 px-2 py-2 border-b mb-2">
                <div className="w-10 h-10 rounded-full bg-gray-900 text-white
                                flex items-center justify-center font-semibold text-sm">
                  {getInitials(user.name)}
                </div>
                <span className="text-sm font-medium">{user.name}</span>
                <span className="text-xs text-gray-500 truncate">{user.email}</span>
              </div>

              <DropdownMenu.Item asChild>
                <button
                  onClick={() => router.push("/dashboard/profile")}
                  className="w-full px-2 py-2 text-sm flex items-center gap-2
                             rounded hover:bg-gray-100"
                >
                  <i className="bx bx-user text-[16px]" />
                  Profile
                </button>
              </DropdownMenu.Item>

              <DropdownMenu.Item asChild>
                <button
                  onClick={() => router.push("/dashboard/settings")}
                  className="w-full px-2 py-2 text-sm flex items-center gap-2
                             rounded hover:bg-gray-100"
                >
                  <i className="bx bx-cog text-[16px]" />
                  Settings
                </button>
              </DropdownMenu.Item>

              <DropdownMenu.Item asChild>
                <button
                  onClick={() => setConfirmOpen(true)}
                  className="w-full px-2 py-2 text-sm flex items-center gap-2
                             rounded hover:bg-red-50 text-red-600"
                >
                  <i className="bx bx-log-out text-[16px]" />
                  Sign Out
                </button>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </header>

      <ConfirmModal
        open={confirmOpen}
        title="Confirm Sign Out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        destructive
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          setConfirmOpen(false);
          await signOut({ callbackUrl: "/" });
        }}
      />
    </>
  );
}
