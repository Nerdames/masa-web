"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

export function UserMenu() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;

  const getInitials = (name?: string | null) => {
    if (!name) return "AP";
    const parts = name.trim().split(" ");
    return parts.length === 1
      ? parts[0][0].toUpperCase()
      : `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  };

  if (!user) return null;

  const { name, email, organizationName, branchName, role } = user;

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/" });
  };

  return (
    <DropdownMenu.Root>
      {/* Trigger: small circular avatar */}
      <DropdownMenu.Trigger asChild>
        <button
          aria-label="User menu"
          className="w-8 h-8 rounded-full bg-gray-900 text-white
                     flex items-center justify-center text-sm font-semibold
                     hover:bg-gray-800 transition-colors"
        >
          {getInitials(name)}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 outline-none"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -2 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -2 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="bg-white border border-gray-200 rounded-2xl shadow-lg w-60 p-0 overflow-hidden"
          >
            {/* User Card */}
            <div
              className="flex flex-col items-start gap-2 p-4 mb-2 rounded-xl bg-gray-50
                         hover:bg-gray-100 cursor-pointer transition-colors"
              onClick={() => router.push("/dashboard/profile")}
            >
              {/* Avatar + Name/Email */}
              <div className="flex items-center gap-3 w-full">
                <div
                  className="w-12 h-12 rounded-full bg-gray-900 text-white
                             flex items-center justify-center font-semibold text-lg"
                >
                  {getInitials(name)}
                </div>
                <div className="flex flex-col truncate">
                  <span className="text-sm font-medium truncate transition-colors">{name}</span>
                  <span className="text-xs text-gray-500 truncate transition-colors">{email}</span>
                </div>
              </div>

              {/* Org / Branch / Role with Boxicons */}
              <div className="mt-2 flex flex-col text-xs text-gray-500 space-y-1">
                {organizationName && (
                  <div className="flex items-center gap-1 transition-colors">
                    <i className="bx bx-building text-gray-400" />
                    <span className="truncate">{organizationName}</span>
                  </div>
                )}
                {branchName && (
                  <div className="flex items-center gap-1 transition-colors">
                    <i className="bx bx-map text-gray-400" />
                    <span className="truncate">{branchName}</span>
                  </div>
                )}
                {role && (
                  <div className="flex items-center gap-1 transition-colors">
                    <i className="bx bx-id-card text-gray-400" />
                    <span className="italic truncate">{role}</span>
                  </div>
                )}
              </div>
            </div>

            <DropdownMenu.Separator className="my-1 h-px bg-gray-200" />

            {/* Menu Actions */}
            <DropdownMenu.Item asChild>
              <button
                className="w-full text-left px-4 py-2 text-sm rounded hover:bg-gray-100 flex items-center gap-2 transition-colors"
                onClick={() => router.push("/dashboard/profile")}
              >
                <i className="bx bx-user text-[16px]" />
                Manage your profile
              </button>
            </DropdownMenu.Item>

            <DropdownMenu.Item asChild>
              <button
                className="w-full text-left px-4 py-2 text-sm rounded hover:bg-gray-100 flex items-center gap-2 transition-colors"
                onClick={() => router.push("/dashboard/settings")}
              >
                <i className="bx bx-cog text-[16px]" />
                Settings
              </button>
            </DropdownMenu.Item>

            <DropdownMenu.Separator className="my-1 h-px bg-gray-200" />

            <DropdownMenu.Item asChild>
              <button
                onClick={handleSignOut}
                className="w-full text-left px-4 py-2 text-sm rounded hover:bg-red-50 text-red-600 flex items-center gap-2 transition-colors"
              >
                <i className="bx bx-log-out text-[16px]" />
                Sign Out
              </button>
            </DropdownMenu.Item>
          </motion.div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
