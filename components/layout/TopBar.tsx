"use client";

import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import ConfirmModal from "@/components/modal/ConfirmModal";
import { NotificationsButton } from "@/components/shared/NotificationsButton";
import { Tooltip } from "@/components/feedback/Tooltip";
import { UserMenu } from "@/components/shared/UserMenu";
import { getInitials } from "@/lib/getInitials";

export default function TopBar() {
  const { data: session, status } = useSession({ required: false });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const user = session?.user;

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
        
        {/* Left */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-6 h-6 bg-gray-900 text-white rounded flex items-center justify-center font-bold text-xs">
            L
          </div>
          <span className="text-sm font-semibold truncate max-w-[200px]">
            {user.organizationName}
          </span>
        </div>

        {/* Center */}
        <div className="flex-1 flex justify-center px-4 min-w-0">
          <div className="flex items-center gap-2 w-full max-w-lg min-w-0">
            
            {/* Search */}
            <Tooltip side="bottom" content="Search the dashboard">
              <input
                type="text"
                placeholder="Search..."
                className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 rounded
                           focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </Tooltip>

            {/* Notifications with Dynamic Tooltip */}
            <Tooltip
              side="bottom"
              content={
                unreadCount === 0
                  ? "No new notifications"
                  : unreadCount === 1
                  ? "1 unread notification"
                  : `${unreadCount} unread notifications`
              }
            >
              <div className="ml-2">
                <NotificationsButton onUnreadChange={setUnreadCount} />
              </div>
            </Tooltip>

          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Tooltip side="bottom" content="Profile">
            <div>
<UserMenu
  trigger={
    <div
      className="flex items-center gap-2 cursor-pointer rounded-full  py-0.5 pr-3
                 bg-[#f5f5f5] hover:bg-[#1aacbc]/20 transition-colors"
    >
      {/* Avatar with 2-letter initials */}
      <div
        className="w-8 h-8 rounded-full bg-gray-900 text-white
                   flex items-center justify-center font-semibold text-sm
                   transition-colors group-hover:bg-[#1aacbc]"
      >
        {getInitials(user.name)}
      </div>

      {/* Name + Role (single-line, MASA accent role) */}
      <div className="hidden sm:flex items-baseline gap-1">
        <span className="text-sm font-medium truncate">{user.name}</span>
        {user.role && (
          <span className="text-xs text-[#1aacbc] truncate capitalize">
            ({user.role})
          </span>
        )}
      </div>
    </div>
  }
/>
            </div>
          </Tooltip>
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
