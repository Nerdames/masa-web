"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { UserMenu } from "@/components/shared/UserMenu";
import { NotificationsBell } from "@/components/shared/NotificationsBell";
import { getInitials } from "@/lib/getInitials";

interface TopBarProps {
  isLoading?: boolean;
}

export default function TopBar({ isLoading }: TopBarProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user;

  // Render skeleton if parent says loading OR internal status is loading
  if (isLoading || status === "loading") {
    return (
      <header className="w-full h-10 flex items-center justify-between px-4 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gray-200 animate-pulse rounded" />
          <div className="h-4 w-24 bg-gray-100 animate-pulse rounded" />
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-gray-100 animate-pulse rounded-full" />
          <div className="w-24 h-7 bg-gray-100 animate-pulse rounded-full" />
        </div>
      </header>
    );
  }

  return (
    <header className="w-full h-10 flex justify-between items-center px-4 bg-white">
      
      {/* Left - Logo & Org Name */}
      <div
        onClick={() => router.push(user ? "/dashboard" : "/")}
        className="flex items-center gap-2 flex-shrink-0 cursor-pointer group"
      >
        <div className="w-6 h-6 rounded flex items-center justify-center font-bold text-[10px] text-white bg-black transition-transform duration-200 group-hover:scale-110">
          M
        </div>

        <span className="text-sm font-semibold truncate max-w-[200px] text-slate-800 group-hover:text-blue-600 transition-colors">
          {user?.organizationName || "MASA"}
        </span>
      </div>

      {/* Right - Actions & Profile */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {user ? (
          <>
            <NotificationsBell />

            <UserMenu
              trigger={
                <button className="flex items-center gap-2 cursor-pointer rounded-full py-0.5 pr-3 pl-0.5 bg-gray-50 hover:bg-slate-100 transition-all border border-transparent hover:border-slate-200">
                  <div className="w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-[10px] bg-blue-600 shadow-sm">
                    {getInitials(user.name)}
                  </div>

                  <div className="hidden sm:flex items-center gap-1">
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
            onClick={() => router.push("/auth/signin")}
            className="px-3 py-1 rounded-md text-xs font-medium text-white bg-black hover:bg-slate-800 transition shadow-sm"
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}