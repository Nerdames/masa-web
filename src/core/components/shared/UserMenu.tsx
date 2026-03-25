"use client";

import React, { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import ConfirmModal from "@/core/components/modal/ConfirmModal";
import { Role } from "@prisma/client"; 

interface UserMenuProps {
  trigger?: React.ReactNode;
}

/**
 * Extended Session User type to match the AuthorizedPersonnel model 
 */
interface ExtendedUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: Role; 
  organizationName?: string;
  branchName?: string;
  isOrgOwner: boolean; 
}

export function UserMenu({ trigger }: UserMenuProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const user = session?.user as ExtendedUser | undefined;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    const parts = name.trim().split(/\s+/);
    return parts.length === 1
      ? parts[0][0].toUpperCase()
      : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const handleSignOut = async () => {
    try {
      setLoading(true);
      await signOut({ callbackUrl: "/auth/signin" });
    } catch (error) {
      console.error("Sign out failed:", error);
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  if (status === "loading") return <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />;

  if (!user) {
    return (
      <button
        onClick={() => router.push("/auth/signin")}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white
        bg-slate-900 hover:bg-slate-800 transition-all shadow-sm active:scale-95"
      >
        <i className="bx bx-user text-lg" />
        Sign in
      </button>
    );
  }

  return (
    <>
      <DropdownMenu.Root open={open} onOpenChange={setOpen}>
        <DropdownMenu.Trigger asChild>
          {trigger ?? (
            <button
              aria-label="Open user menu"
              className="group relative w-9 h-9 rounded-full p-[2px] transition-transform active:scale-95
              bg-gradient-to-tr from-[#FF6B35] via-[#2A9D8F] to-[#F4A261] hover:shadow-md"
            >
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-700 text-xs font-bold group-hover:bg-slate-50 transition-colors">
                  {getInitials(user.name)}
                </div>
              </div>
            </button>
          )}
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal forceMount>
          <AnimatePresence>
            {open && (
              <DropdownMenu.Content
                asChild
                align="end"
                sideOffset={8}
                className="z-[100] outline-none"
              >
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-64 overflow-hidden"
                >
                  {/* User Profile Header */}
                  <div className="p-4 bg-slate-50/50 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-inner">
                        {getInitials(user.name)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-slate-900 truncate">
                          {user.name}
                        </span>
                        <span className="text-xs text-slate-500 truncate">
                          {user.email}
                        </span>
                      </div>
                    </div>

                    {/* Org & Branch Context */}
                    {(user.organizationName || user.branchName) && (
                      <div className="mt-3 space-y-1.5 pt-3 border-t border-slate-100">
                        {user.organizationName && (
                          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
                            <i className="bx bx-building-house text-slate-400" />
                            <span className="truncate uppercase tracking-wider">{user.organizationName}</span>
                          </div>
                        )}
                        {user.branchName && (
                          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
                            <i className="bx bx-map-pin text-slate-400" />
                            <span className="truncate">{user.branchName}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-[11px] font-bold text-blue-600">
                          <i className="bx bx-shield-quarter" />
                          <span>{user.role}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Menu Items */}
                  <div className="p-1.5">
                    <DropdownMenu.Item
                      className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 rounded-lg cursor-pointer outline-none hover:bg-slate-100 transition-colors"
                      onClick={() => {
                        setOpen(false);
                        router.push("/dashboard/settings/profile");
                      }}
                    >
                      <i className="bx bx-user text-slate-400 text-base" />
                      View Profile
                    </DropdownMenu.Item>

                    <DropdownMenu.Item
                      className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 rounded-lg cursor-pointer outline-none hover:bg-slate-100 transition-colors"
                      onClick={() => {
                        setOpen(false);
                        router.push("/dashboard/settings");
                      }}
                    >
                      <i className="bx bx-cog text-slate-400 text-base" />
                      Account Settings
                    </DropdownMenu.Item>

                    <div className="my-1.5 border-t border-slate-100" />

                    <DropdownMenu.Item
                      className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 font-medium rounded-lg cursor-pointer outline-none hover:bg-red-50 transition-colors"
                      onClick={() => {
                        setOpen(false);
                        setConfirmOpen(true);
                      }}
                    >
                      <i className="bx bx-log-out text-base" />
                      Sign Out
                    </DropdownMenu.Item>
                  </div>
                </motion.div>
              </DropdownMenu.Content>
            )}
          </AnimatePresence>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ConfirmModal
        open={confirmOpen}
        title="Sign Out"
        message="Are you sure you want to end your current session?"
        confirmLabel="Sign Out"
        destructive
        loading={loading}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSignOut}
      />
    </>
  );
}