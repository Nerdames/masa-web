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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleUnreadChange = useCallback((count: number) => {
    setUnreadCount(count);
  }, []);

  const userInitials = useMemo(() => getInitials(user?.name || ""), [user?.name]);

  // 1. COMPACT SKELETON (Matched to new slim structure)
  if (!mounted || isLoading || status === "loading") {
    return (
      <header className="w-full h-9 flex items-center justify-between px-3 bg-white border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 animate-pulse rounded-full bg-slate-100" />
          <div className="w-16 h-6 animate-pulse rounded-full bg-slate-100" />
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-[100] w-full h-9  bg-white backdrop-blur-md px-3 flex items-center justify-between transition-all duration-300">
      
      {/* 1. BRANDING SECTION */}
      <div className="flex items-center gap-2 select-none pointer-events-none">
        <div className={cn(
          "flex items-center justify-center w-6 h-6 rounded font-black text-[10px] text-white shadow-sm transition-all duration-500 bg-blue-600",
          unreadCount > 0 && 'shadow-blue-500/20'
        )}>
          M
        </div>
        <div className="block">
          <h2 className="text-[10px] font-black tracking-tight uppercase text-slate-800">
            {user?.organizationName || "MASA"}
          </h2>
        </div>
      </div>

      {/* 2. ACTIONS & PROFILE SECTION */}
      <div className="flex items-center gap-2">
        {user ? (
          <>
            <div className="flex items-center gap-1.5 pr-2 border-r border-slate-100 mr-0.5">
              <NotificationsBell onUnreadChange={handleUnreadChange} />
            </div>

            <UserMenu
              trigger={
                <button className="flex items-center gap-1.5 cursor-pointer rounded-full py-0.5 pr-2 pl-0.5 transition-all border border-transparent bg-slate-50 hover:bg-slate-100 hover:border-slate-200">
                  <div className="w-6 h-6 rounded-full text-white flex-shrink-0 flex items-center justify-center font-bold text-[9px] bg-blue-600 shadow-sm">
                    {userInitials}
                  </div>

                  <div className="hidden sm:flex items-center gap-1 whitespace-nowrap">
                    <span className="text-[10px] font-medium text-slate-700">
                      {user.name?.split(" ")[0]}
                    </span>
                    {user.role && (
                      <span className="text-[9px] font-bold text-blue-500 uppercase tracking-tighter">
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
            className="flex items-center gap-1.5 rounded-full py-1 px-3 transition-all text-[9px] font-black uppercase tracking-wider bg-slate-900 text-white hover:bg-slate-800 shadow-sm shadow-slate-900/10"
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