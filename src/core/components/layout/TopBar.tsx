"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { UserMenu } from "@/core/components/shared/UserMenu";
import { NotificationsBell } from "@/core/components/shared/NotificationsBell";
import { getInitials } from "@/core/utils";

interface TopBarProps {
  isLoading?: boolean;
}

export default function TopBar({ isLoading }: TopBarProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user;

  // Track unread count for the logo badge
  const [unreadCount, setUnreadCount] = useState(0);


  /**
   * Memoized change handler to prevent infinite loops 
   */
  const handleUnreadChange = useCallback((count: number) => {
    setUnreadCount(count);
  }, []);

  // Render skeleton during loading states
  if (isLoading || status === "loading") {
    return (
      <header className="w-full h-10 flex items-center justify-between px-4 bg-white border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-slate-200 animate-pulse rounded" />
          <div className="h-4 w-24 bg-slate-100 animate-pulse rounded" />
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-slate-100 animate-pulse rounded-full" />
          <div className="w-6 h-6 bg-slate-100 animate-pulse rounded-full" />
          <div className="w-24 h-7 bg-slate-100 animate-pulse rounded-full" />
        </div>
      </header>
    );
  }

  return (
    <header className="w-full h-10 flex justify-between items-center px-4 bg-white border-b border-slate-100">
      
      {/* Left Section: Logo & Navigation */}
      <div
        onClick={() => router.push(user ? "/admin/overview" : "/")}
        className="flex items-center gap-2 flex-shrink-0 cursor-pointer group"
      >
        <div 
          className={`w-6 h-6 rounded flex items-center justify-center font-bold text-[10px] text-white transition-all duration-300 group-hover:scale-110 
          ${unreadCount > 0 ? 'bg-blue-600 shadow-sm shadow-blue-200' : 'bg-black'}`}
        >
          M
        </div>
        <span className="text-sm font-semibold truncate max-w-[200px] text-slate-800 group-hover:text-blue-600 transition-colors whitespace-nowrap">
          {user?.organizationName || "MASA"}
        </span>
      </div>

      {/* Right Section: Actions & Profile */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {user ? (
          <>
            <div className="flex items-center gap-1 border-r border-slate-100 pr-2 mr-1">
              {/* Notification System */}
              <NotificationsBell onUnreadChange={handleUnreadChange} />
              

            </div>

            {/* User Profile Menu */}
            <UserMenu
              trigger={
                <button className="flex items-center gap-2 cursor-pointer rounded-full py-0.5 pr-3 pl-0.5 bg-slate-50 hover:bg-slate-100 transition-all border border-transparent hover:border-slate-200">
                  <div className="w-7 h-7 rounded-full text-white flex-shrink-0 flex items-center justify-center font-bold text-[10px] bg-blue-600 shadow-sm">
                    {getInitials(user.name)}
                  </div>

                  {/* Hidden on Mobile: Only initials displayed */}
                  <div className="hidden sm:flex items-center gap-1 whitespace-nowrap">
                    <span className="text-xs font-medium text-slate-700">
                      {user.name?.split(" ")[0]}
                    </span>
                    {user.role && (
                      <span className="text-[10px] font-bold text-blue-500 uppercase tracking-tighter">
                        {user.role}
                      </span>
                    )}
                  </div>
                </button>
              }
            />
          </>
        ) : (
          /* Sign In Button: Identical shape/style to UserMenu trigger */
          <button
            onClick={() => router.push("/signin")}
            className="flex items-center gap-2 cursor-pointer rounded-full py-0.5 pr-3 pl-0.5 bg-slate-50 hover:bg-slate-100 transition-all border border-slate-100 hover:border-slate-200 shadow-sm"
          >
            <div className="w-7 h-7 rounded-full text-white flex-shrink-0 flex items-center justify-center bg-black shadow-sm">
              <i className="bx bx-log-in-circle text-[14px]" />
            </div>
            {/* Hidden on Mobile for consistency with Profile behavior */}
            <span className="hidden sm:inline text-xs font-bold text-blue-700 uppercase tracking-tight whitespace-nowrap">
              Sign In
            </span>
          </button>
        )}
      </div>

      <style jsx global>{`
        .animate-pulse-subtle {
          animation: pulse-subtle 2s infinite ease-in-out;
        }
        @keyframes pulse-subtle {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </header>
  );
}