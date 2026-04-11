"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { UserMenu } from "@/core/components/shared/UserMenu";
import { NotificationsBell } from "@/core/components/shared/NotificationsBell";
import { getInitials } from "@/core/utils";
import { cn } from "@/core/utils";

interface TopBarProps {
  isLoading?: boolean;
}

export default function TopBar({ isLoading }: TopBarProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user;

  const [unreadCount, setUnreadCount] = useState(0);
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Harmonized Theme Logic
  useEffect(() => {
    const handleTheme = () => {
      const hour = new Date().getHours();
      setIsDark(hour < 7 || hour >= 19);
    };
    
    handleTheme();
    setMounted(true);
    const timer = setInterval(handleTheme, 60000);
    return () => clearInterval(timer);
  }, []);

  const handleUnreadChange = useCallback((count: number) => {
    setUnreadCount(count);
  }, []);

  const userInitials = useMemo(() => getInitials(user?.name || ""), [user?.name]);

  // 1. MODE-AWARE SKELETON (Prevents blinding white flashes in dark mode)
  if (!mounted || isLoading || status === "loading") {
    return (
      <header className={cn(
        "w-full h-12 flex items-center justify-between px-4 md:px-8 border-b transition-colors duration-1000",
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn("w-8 h-8 animate-pulse rounded-lg", isDark ? "bg-slate-800" : "bg-slate-200")} />
          <div className={cn("h-4 w-32 animate-pulse rounded", isDark ? "bg-slate-800" : "bg-slate-100")} />
        </div>
        <div className="flex items-center gap-3">
          <div className={cn("w-8 h-8 animate-pulse rounded-full", isDark ? "bg-slate-800" : "bg-slate-100")} />
          <div className={cn("w-24 h-8 animate-pulse rounded-full", isDark ? "bg-slate-800" : "bg-slate-100")} />
        </div>
      </header>
    );
  }

  return (
    <header className={cn(
      "sticky top-0 z-[100] w-full h-12 border-b backdrop-blur-md px-2 md:px-4 flex items-center justify-between transition-all duration-1000",
      isDark ? "bg-slate-900/50 border-slate-800" : "bg-white/80 border-slate-200"
    )}>
      
      {/* 1. BRANDING SECTION */}
      <div className="flex items-center gap-4 select-none pointer-events-none">
        <div className={cn(
          "flex items-center justify-center w-8 h-8 rounded-lg font-black text-xs text-white shadow-lg transition-all duration-500",
          unreadCount > 0 
            ? 'bg-blue-600 shadow-blue-500/20' 
            : (isDark ? 'bg-blue-500 shadow-blue-500/10' : 'bg-slate-900 shadow-slate-900/20')
        )}>
          M
        </div>
        <div className="hidden sm:block">
          <p className={cn("text-[9px] font-bold tracking-[0.2em] uppercase leading-none mb-1 transition-opacity", 
            isDark ? "opacity-60 text-blue-400" : "opacity-40 text-slate-900"
          )}>
            Operational Node
          </p>
          <h2 className={cn("text-xs font-black tracking-tight uppercase transition-colors", 
            isDark ? "text-slate-100" : "text-slate-900"
          )}>
            {user?.organizationName || "MASA"}
          </h2>
        </div>
      </div>

      {/* 2. ACTIONS & PROFILE SECTION */}
      <div className="flex items-center gap-3">
        {user ? (
          <>
            <div className={cn("flex items-center gap-2 pr-3 border-r mr-1 transition-colors", 
              isDark ? "border-slate-800" : "border-slate-200/50"
            )}>
               <NotificationsBell onUnreadChange={handleUnreadChange} />
            </div>

            <UserMenu
              trigger={
                <button className={cn(
                  "flex items-center gap-2 cursor-pointer rounded-full py-0.5 pr-3 pl-0.5 transition-all border",
                  isDark 
                    ? "bg-slate-800/50 hover:bg-slate-800 border-slate-700 hover:border-blue-500/50" 
                    : "bg-slate-50 hover:bg-slate-100 border-transparent hover:border-slate-200"
                )}>
                  <div className="w-7 h-7 rounded-full text-white flex-shrink-0 flex items-center justify-center font-bold text-[10px] bg-blue-600 shadow-sm">
                    {userInitials}
                  </div>

                  <div className="hidden sm:flex items-center gap-1 whitespace-nowrap">
                    <span className={cn("text-xs font-medium transition-colors", 
                      isDark ? "text-slate-300" : "text-slate-700"
                    )}>
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
            className={cn(
              "flex items-center gap-2 rounded-full py-1.5 px-4 transition-all text-[11px] font-black uppercase tracking-widest shadow-lg",
              isDark 
                ? "bg-blue-600 text-white hover:bg-blue-500 shadow-blue-900/20" 
                : "bg-slate-900 text-white hover:bg-slate-800 shadow-slate-900/20"
            )}
          >
            Terminal Login
          </button>
        )}
      </div>

      <style jsx>{`
        .select-none { user-select: none; }
      `}</style>
    </header>
  );
}