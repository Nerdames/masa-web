"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { NotificationsButton } from "@/components/shared/NotificationsButton";
import { Tooltip } from "@/components/feedback/Tooltip";
import { UserMenu } from "@/components/shared/UserMenu";
import { getInitials } from "@/lib/getInitials";

export default function TopBar() {
  const { data: session, status } = useSession({ required: false });
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();

  const user = session?.user;

  if (status === "loading") {
    return (
      <header className="w-full h-10 flex items-center px-3 border-b border-gray-200 bg-white animate-pulse">
        <div className="w-6 h-6 bg-gray-200 rounded mr-2" />
        <div className="h-4 bg-gray-200 rounded flex-1" />
        <div className="w-6 h-6 bg-gray-200 rounded ml-2" />
      </header>
    );
  }

  return (
    <header className="w-full h-10 flex items-center px-3 border-b border-gray-200 bg-white">

      {/* Left - Logo */}
      <div
        onClick={() => router.push(user ? "/dashboard" : "/")}
        className="flex items-center gap-2 flex-shrink-0 cursor-pointer group"
      >
        <div
          className="w-6 h-6 rounded flex items-center justify-center font-bold text-xs text-white
          bg-gradient-to-br from-[#FF6B35] via-[#2A9D8F] to-[#F4A261]
          transition-transform duration-200 group-hover:scale-105"
        >
          M
        </div>

        <span className="text-sm font-semibold truncate max-w-[220px] text-green-700 group-hover:text-orange-500 transition-colors">
          {user?.organizationName || "MASA"}
        </span>
      </div>

      {/* Center */}
      <div className="flex-1 flex justify-center px-4 min-w-0">
        <div className="flex items-center gap-2 w-full max-w-lg min-w-0">

          <Tooltip side="bottom" content="Search the dashboard">
            <input
              type="text"
              placeholder="Search..."
              className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 rounded
              focus:outline-none focus:ring-1 focus:ring-[#2A9D8F] transition"
            />
          </Tooltip>

          {user && (
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
          )}

        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {user ? (
          <UserMenu
            trigger={
              <div
                className="flex items-center gap-2 cursor-pointer rounded-full py-0.5 pr-3
                bg-gray-100 hover:bg-[#2A9D8F]/10 transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-full text-white
                  flex items-center justify-center font-semibold text-sm
                  bg-gradient-to-br from-[#FF6B35] via-[#2A9D8F] to-[#F4A261]"
                >
                  {getInitials(user.name)}
                </div>

                <div className="hidden sm:flex items-baseline gap-1">
                  <span className="text-sm font-medium truncate">
                    {user.name}
                  </span>

                  {user.role && (
                    <span className="text-xs text-orange-500 truncate capitalize">
                      ({user.role})
                    </span>
                  )}
                </div>
              </div>
            }
          />
        ) : (
          <button
            onClick={() => router.push("/auth/signin")}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-white
            bg-gradient-to-r from-[#FF6B35] via-[#2A9D8F] to-[#F4A261]
            hover:opacity-90 transition"
          >
            Sign in
          </button>
        )}
      </div>

    </header>
  );
}