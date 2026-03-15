"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { UserMenu } from "@/components/shared/UserMenu";
import { NotificationsBell } from "@/components/shared/NotificationsBell"; // Adjust path as needed
import { getInitials } from "@/lib/getInitials";

export default function TopBar() {
  const { data: session, status } = useSession({ required: false });
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
    <header className="w-full h-10 flex justify-between items-center px-3 border-b border-gray-200 bg-white">
      
      {/* Left - Logo & Org Name */}
      <div
        onClick={() => router.push(user ? "/dashboard" : "/")}
        className="flex items-center gap-2 flex-shrink-0 cursor-pointer group"
      >
        <div
          className="w-6 h-6 rounded flex items-center justify-center font-bold text-xs text-white
          bg-black
          transition-transform duration-200 group-hover:scale-105"
        >
          M
        </div>

        <span className="text-sm font-semibold truncate max-w-[220px] text-black-700 group-hover:text-blue-500 transition-colors">
          {user?.organizationName || "MASA"}
        </span>
      </div>

      {/* Right - Actions & Profile */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {user ? (
          <>
            {/* Notifications Integrated Here */}
            <NotificationsBell />

            <UserMenu
              trigger={
                <div
                  className="flex items-center gap-2 cursor-pointer rounded-full py-0.5 pr-3
                  bg-gray-100 hover:bg-[#2A9D8F]/10 transition-colors"
                >
                  <div
                    className="w-8 h-8 rounded-full text-white
                    flex items-center justify-center font-semibold text-sm
                    bg-blue-600"
                  >
                    {getInitials(user.name)}
                  </div>

                  <div className="hidden sm:flex items-baseline gap-1">
                    <span className="text-sm font-medium truncate">
                      {user.name}
                    </span>

                    {user.role && (
                      <span className="text-xs text-blue-600 truncate capitalize">
                        ({user.role.toLowerCase()})
                      </span>
                    )}
                  </div>
                </div>
              }
            />
          </>
        ) : (
          <button
            onClick={() => router.push("/auth/signin")}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-white
            bg-black hover:bg-gray-900 transition"
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}