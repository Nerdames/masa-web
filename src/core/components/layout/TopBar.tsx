"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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

  const [unreadCount, setUnreadCount] = useState(0);
  const [isDark, setIsDark] = useState(false);

  /**
   * Optimized Theme Logic
   * memoized to prevent unnecessary recalculations on every render
   */
  useEffect(() => {
    const handleTheme = () => {
      const hour = new Date().getHours();
      setIsDark(hour < 7 || hour >= 19);
    };
    
    handleTheme();
    const timer = setInterval(handleTheme, 60000);
    return () => clearInterval(timer);
  }, []);

  const handleUnreadChange = useCallback((count: number) => {
    setUnreadCount(count);
  }, []);

  // Use useMemo for initials to avoid recalculating on every re-render
  const userInitials = useMemo(() => getInitials(user?.name || ""), [user?.name]);

  /**
   * PERFORMANCE FIX: 
   * We only show the skeleton if we are explicitly loading OR if we don't have a session 
   * AND we are still fetching it. If status is "unauthenticated", we show the login button
   * instead of staying in a loading loop.
   */
  if (isLoading || status === "loading") {
    return (
      <header className="w-full h-12 flex items-center justify-between px-4 md:px-8 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-200 animate-pulse rounded-lg" />
          <div className="h-4 w-32 bg-slate-100 animate-pulse rounded" />
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-100 animate-pulse rounded-full" />
          <div className="w-24 h-8 bg-slate-100 animate-pulse rounded-full" />
        </div>
      </header>
    );
  }

  return (
    <header className={`sticky top-0 z-[100] w-full h-12 border-b backdrop-blur-md px-2 md:px-4 flex items-center justify-between transition-colors duration-1000
      ${isDark ? "bg-slate-900/50 border-slate-800" : "bg-white/80 border-slate-200"}`}>
      
      {/* 1. STATIC BRANDING SECTION */}
      <div className="flex items-center gap-4 select-none pointer-events-none">
        <div className={`flex items-center justify-center w-8 h-8 rounded-lg font-black text-xs text-white shadow-lg transition-colors
          ${unreadCount > 0 ? 'bg-blue-600 shadow-blue-500/20' : 'bg-slate-900 shadow-slate-900/20'}`}>
          M
        </div>
        <div className="hidden sm:block">
          <p className="text-[9px] font-bold tracking-[0.2em] uppercase opacity-40 leading-none mb-1">Operational Node</p>
          <h2 className={`text-xs font-black tracking-tight uppercase ${isDark ? "text-slate-200" : "text-slate-900"}`}>
            {user?.organizationName || "MASA"}
          </h2>
        </div>
      </div>

      {/* 2. ACTIONS & PROFILE SECTION */}
      <div className="flex items-center gap-3">
        {user ? (
          <>
            <div className="flex items-center gap-2 pr-3 border-r border-slate-200/50 mr-1">
               <NotificationsBell onUnreadChange={handleUnreadChange} />
            </div>

            <UserMenu
              trigger={
                <button className="flex items-center gap-2 cursor-pointer rounded-full py-0.5 pr-3 pl-0.5 bg-slate-50 hover:bg-slate-100 transition-all border border-transparent hover:border-slate-200">
                  <div className="w-7 h-7 rounded-full text-white flex-shrink-0 flex items-center justify-center font-bold text-[10px] bg-blue-600 shadow-sm">
                    {userInitials}
                  </div>

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
          <button
            onClick={() => router.push("/welcome")}
            className={`flex items-center gap-2 rounded-full py-1.5 px-4 transition-all text-[11px] font-black uppercase tracking-widest
              ${isDark ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-slate-900 text-white hover:bg-slate-800"}`}
          >
            Terminal Login
          </button>
        )}
      </div>

      <style jsx>{`
        .select-none {
          user-select: none;
        }
      `}</style>
    </header>
  );
}