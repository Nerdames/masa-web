"use client";

import React, { useState, useCallback, useMemo } from "react";
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
 * Optimized ExtendedUser type reflecting the MASA AuthorizedPersonnel schema.
 * Includes the staffCode for ERP-level identification.
 */
interface ExtendedUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role: Role;
  staffCode?: string | null; // Added missing Staff Code 
  organizationName?: string | null;
  branchName?: string | null;
  isOrgOwner: boolean;
}

export function UserMenu({ trigger }: UserMenuProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const user = session?.user as ExtendedUser | undefined;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Memoized initials to prevent recalculation on every render
  const initials = useMemo(() => {
    if (!user?.name) return "U";
    const parts = user.name.trim().split(/\s+/);
    return parts.length === 1
      ? parts[0][0].toUpperCase()
      : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }, [user?.name]);

  // Stable logout handler
  const handleSignOut = useCallback(async () => {
    try {
      setLoading(true);
      await signOut({ callbackUrl: "/signin" });
    } catch (error) {
      console.error("[AUTH_SIGNOUT_ERROR]:", error);
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  }, []);

  // Handle loading state with a stable shimmer
  if (status === "loading") {
    return <div className="w-9 h-9 rounded-full bg-slate-200 animate-pulse" />;
  }

  // Handle unauthenticated state
  if (!user) {
    return (
      <button
        onClick={() => router.push("/signin")}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-all active:scale-95"
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
              aria-label="User account menu"
              className="group relative w-9 h-9 rounded-full p-[2px] transition-transform active:scale-95 bg-gradient-to-tr from-[#FF6B35] via-[#2A9D8F] to-[#F4A261]"
            >
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-700 text-xs font-black group-hover:bg-slate-50 transition-colors">
                  {initials}
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
                sideOffset={10}
                className="z-[100] outline-none"
              >
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.1, ease: "circOut" }}
                  className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-72 overflow-hidden"
                >
                  {/* ERP Personnel Header */}
                  <div className="p-4 bg-slate-50/80 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-base shadow-sm">
                        {initials}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-black text-slate-900 truncate">
                          {user.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase tracking-tight">
                            {user.role}
                          </span>
                          {user.staffCode && (
                            <span className="text-[10px] font-medium text-slate-400 font-mono">
                              #{user.staffCode}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Organization Context */}
                    {(user.organizationName || user.branchName) && (
                      <div className="mt-4 space-y-2 pt-3 border-t border-slate-200/60">
                        {user.organizationName && (
                          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                            <i className="bx bx-buildings text-slate-400 text-sm" />
                            <span className="truncate uppercase tracking-widest">{user.organizationName}</span>
                          </div>
                        )}
                        {user.branchName && (
                          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
                            <i className="bx bx-map-alt text-slate-400 text-sm" />
                            <span className="truncate">{user.branchName}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Menu */}
                  <div className="p-2">
                    <MenuAction 
                      icon="bx-user" 
                      label="My Profile" 
                      onClick={() => { setOpen(false); router.push("/settings/profile"); }} 
                    />
                    <MenuAction 
                      icon="bx-cog" 
                      label="Preferences" 
                      onClick={() => { setOpen(false); router.push("/settings"); }} 
                    />
                    
                    <div className="my-1.5 border-t border-slate-100" />
                    
                    <button
                      onClick={() => { setOpen(false); setConfirmOpen(true); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-red-600 rounded-xl hover:bg-red-50 transition-colors"
                    >
                      <i className="bx bx-power-off text-base" />
                      Terminate Session
                    </button>
                  </div>
                </motion.div>
              </DropdownMenu.Content>
            )}
          </AnimatePresence>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ConfirmModal
        open={confirmOpen}
        title="Confirm Sign Out"
        message="You are about to end your session. Any unsaved progress in active terminals may be lost."
        confirmLabel="Sign Out"
        destructive
        loading={loading}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSignOut}
      />
    </>
  );
}

/**
 * Internal helper for menu items to ensure consistent styling and accessibility
 */
const MenuAction = ({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) => (
  <DropdownMenu.Item
    onClick={onClick}
    className="flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-slate-700 rounded-xl cursor-pointer outline-none hover:bg-slate-100 transition-all active:scale-[0.98]"
  >
    <i className={`bx ${icon} text-slate-400 text-lg`} />
    {label}
  </DropdownMenu.Item>
);