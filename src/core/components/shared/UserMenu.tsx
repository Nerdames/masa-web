"use client";

import React, { useState, useCallback, useMemo } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { 
  User, 
  Settings, 
  LogOut, 
  MapPin, 
  ChevronDown, 
  Loader2, 
  CheckCircle2,
  Building2,
  ShieldCheck,
  LucideIcon
} from "lucide-react";
import ConfirmModal from "@/core/components/modal/ConfirmModal";
import { Role } from "@prisma/client";

/* ------------------------------------------
 * TYPES (Aligned with Auth Augmentation)
 * ------------------------------------------ */
interface AllowedBranch {
  id: string;
  name: string;
  role: Role;
}

interface ExtendedUser {
  id: string;
  name?: string | null;
  email?: string | null;
  staffCode: string | null;
  role: Role;
  isOrgOwner: boolean;
  organizationId: string;
  organizationName: string | null;
  branchId: string | null;
  branchName: string | null;
  lastLogin: string | null;
  lastActivityAt: string | null;
  disabled: boolean;
  locked: boolean;
  requiresPasswordChange: boolean;
  allowedBranches: AllowedBranch[];
  permissions: string[];
}

interface UserMenuProps {
  trigger?: React.ReactNode;
}

/* ------------------------------------------
 * COMPONENT
 * ------------------------------------------ */
export function UserMenu({ trigger }: UserMenuProps) {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const user = session?.user as ExtendedUser | undefined;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [showBranches, setShowBranches] = useState(false);
  const [open, setOpen] = useState(false);

  const initials = useMemo(() => {
    if (!user?.name) return "??";
    const parts = user.name.trim().split(/\s+/);
    if (parts.length === 0) return "??";
    return parts.length === 1
      ? parts[0][0].toUpperCase()
      : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }, [user?.name]);

  const handleSignOut = useCallback(async () => {
    try {
      setIsSwitching(true);
      await signOut({ callbackUrl: "/signin" });
    } catch (error) {
      console.error("[AUTH_SIGNOUT_ERROR]:", error);
    } finally {
      setIsSwitching(false);
      setConfirmOpen(false);
    }
  }, []);

  const handleBranchSwitch = async (branchId: string) => {
    if (!branchId || branchId === user?.branchId || isSwitching) return;

    try {
      setIsSwitching(true);
      
      const newSession = await update({
        action: "SWITCH_BRANCH",
        targetBranchId: branchId,
      });

      if (newSession?.user?.branchId === branchId) {
        setShowBranches(false);
        setOpen(false); 
        router.refresh();
      } else {
        console.error("[SECURITY] Branch switch rejected by server verification.");
      }
    } catch (error) {
      console.error("[BRANCH_SWITCH_ERROR]:", error);
    } finally {
      setIsSwitching(false);
    }
  };

  if (status === "loading") {
    return <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse border border-slate-200" />;
  }

  if (!user) {
    return (
      <button
        onClick={() => router.push("/signin")}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 transition-all active:scale-95"
      >
        <User size={14} />
        Sign in
      </button>
    );
  }

  const canSwitchBranches = user.allowedBranches && user.allowedBranches.length > 1;

  return (
    <>
      <DropdownMenu.Root 
        open={open} 
        onOpenChange={(v) => { 
          setOpen(v); 
          if(!v) setShowBranches(false); 
        }}
      >
        <DropdownMenu.Trigger asChild>
          {trigger ?? (
            <button
              aria-label="User account menu"
              className="group relative w-8 h-8 rounded-full transition-transform active:scale-95 p-0.5 border border-slate-200 bg-white"
            >
              <div className="w-full h-full rounded-full flex items-center justify-center bg-blue-600 text-white text-[10px] font-medium transition-colors hover:bg-blue-700">
                {initials}
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
                sideOffset={6}
                className="z-[100] outline-none"
              >
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.12, ease: "circOut" }}
                  className="bg-white border border-slate-200 rounded-xl shadow-xl w-64 overflow-hidden flex flex-col"
                >
                  {/* HEADER SECTION */}
                  <div className="p-3 bg-slate-50/80 border-b border-slate-100">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start justify-between">
                        <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-medium text-xs shadow-sm">
                          {initials}
                        </div>
                        {user.isOrgOwner && (
                          <div className="w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center shadow-sm" title="System Administrator">
                            <ShieldCheck size={10} className="text-white" />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {user.name}
                        </span>
                        {user.email && (
                          <span className="text-[10px] text-slate-500 truncate mb-1">
                            {user.email}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[9px] font-medium px-1 py-0.2 rounded uppercase tracking-wide ${user.isOrgOwner ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
                            {user.isOrgOwner ? "Owner" : user.role}
                          </span>
                          <span className="text-[9px] font-medium text-slate-400 font-mono">
                            #{user.staffCode ?? "SYS"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BRANCH SWITCHER LAYER */}
                  <div className="p-1 border-b border-slate-100 relative">
                    <button
                      disabled={isSwitching || !canSwitchBranches}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowBranches(!showBranches);
                      }}
                      className="w-full group flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors disabled:cursor-default"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-md bg-orange-50 flex items-center justify-center text-orange-600 flex-shrink-0">
                          {isSwitching ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
                        </div>
                        <div className="flex flex-col items-start min-w-0">
                          <span className="text-[8px] font-medium text-slate-400 uppercase tracking-wider leading-none mb-0.5">Branch</span>
                          <span className="text-[11px] font-medium text-slate-700 truncate max-w-[150px]">
                            {user.branchName || "Headquarters"}
                          </span>
                        </div>
                      </div>
                      {canSwitchBranches && (
                        <ChevronDown 
                          size={12} 
                          className={`text-slate-400 transition-transform duration-200 ${showBranches ? 'rotate-180' : ''}`} 
                        />
                      )}
                    </button>

                    <AnimatePresence>
                      {showBranches && canSwitchBranches && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="pt-1 pb-1 flex flex-col gap-0.5 max-h-36 overflow-y-auto custom-scrollbar">
                            {user.allowedBranches.map((branch) => (
                              <button
                                key={branch.id}
                                disabled={isSwitching || branch.id === user.branchId}
                                onClick={() => handleBranchSwitch(branch.id)}
                                className={`flex items-center justify-between px-2 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                                  branch.id === user.branchId 
                                    ? 'bg-blue-50/70 text-blue-700 font-semibold' 
                                    : 'text-slate-600 hover:bg-slate-100 active:scale-[0.99]'
                                }`}
                              >
                                <span className="truncate">{branch.name}</span>
                                {branch.id === user.branchId ? (
                                  <CheckCircle2 size={12} className="text-blue-600" />
                                ) : (
                                  <span className="text-[8px] text-slate-400 uppercase tracking-tight">
                                    {user.isOrgOwner ? "ADMIN" : branch.role}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* CORE MENU ACTIONS */}
                  <div className="p-1">
                    <MenuAction 
                      icon={User} 
                      label="My Profile" 
                      onClick={() => { setOpen(false); router.push("/settings/profile"); }} 
                    />
                    <MenuAction 
                      icon={Settings} 
                      label="System Preferences" 
                      onClick={() => { setOpen(false); router.push("/settings"); }} 
                    />
                    
                    <div className="my-1 border-t border-slate-100" />
                    
                    <button
                      disabled={isSwitching}
                      onClick={() => { setOpen(false); setConfirmOpen(true); }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      <LogOut size={14} />
                      Sign Out
                    </button>
                  </div>

                  {/* FOOTER / ORG INFO */}
                  <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Building2 size={10} className="text-slate-400" />
                      <span className="text-[8px] font-medium text-slate-400 uppercase tracking-wider truncate max-w-[140px]">
                        {user.organizationName}
                      </span>
                    </div>
                    {user.isOrgOwner && (
                      <div className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                    )}
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
        message="You are about to end your session. Any unsaved progress may be lost."
        confirmLabel="Sign Out"
        destructive
        loading={isSwitching}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSignOut}
      />
    </>
  );
}

const MenuAction = ({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) => (
  <DropdownMenu.Item
    onClick={onClick}
    className="flex items-center gap-2 px-2.5 py-2 text-[11px] font-medium text-slate-700 rounded-lg cursor-pointer outline-none hover:bg-slate-100 transition-all active:scale-[0.99] focus:bg-slate-100"
  >
    <Icon size={14} className="text-slate-400" />
    {label}
  </DropdownMenu.Item>
);