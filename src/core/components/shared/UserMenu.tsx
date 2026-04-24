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
 * TYPES (Perfectly Aligned with Auth Augmentation)
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

  // Memoized Initials
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

  /**
   * ALIGNED BRANCH SWITCH LOGIC
   * Triggers the dynamic DB verification and context shift in auth.ts
   */
  const handleBranchSwitch = async (branchId: string) => {
    if (branchId === user?.branchId || isSwitching) return;

    try {
      setIsSwitching(true);
      
      // The update call triggers the 'jwt' callback in authOptions.
      // Our backend now verifies the branch in the DB and returns 
      // updated permissions and allowedBranches.
      const response = await update({
        action: "SWITCH_BRANCH",
        targetBranchId: branchId,
      });

      if (response) {
        setShowBranches(false);
        // router.refresh forces Next.js to re-fetch Server Component data 
        // using the new branchId in the session cookie.
        router.refresh();
      } else {
        // This would only happen if the JWT callback returned the original token (rejected)
        console.warn("[SECURITY] Branch switch rejected by server.");
      }
    } catch (error) {
      console.error("[BRANCH_SWITCH_ERROR]:", error);
    } finally {
      setIsSwitching(false);
    }
  };

  if (status === "loading") {
    return <div className="w-9 h-9 rounded-full bg-slate-200 animate-pulse border border-slate-300" />;
  }

  if (!user) {
    return (
      <button
        onClick={() => router.push("/signin")}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-all active:scale-95"
      >
        <User size={18} />
        Sign in
      </button>
    );
  }

  // Logic: OrgOwners get all branches from DB; Staff get assigned ones.
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
              className="group relative w-9 h-9 rounded-full p-[2px] transition-transform active:scale-95 bg-gradient-to-tr from-[#FF6B35] via-[#2A9D8F] to-[#F4A261] shadow-md"
            >
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-700 text-[10px] font-black group-hover:bg-slate-50 transition-colors">
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
                  transition={{ duration: 0.15, ease: "circOut" }}
                  className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-80 overflow-hidden flex flex-col"
                >
                  {/* HEADER SECTION */}
                  <div className="p-4 bg-slate-50/80 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-base shadow-sm">
                          {initials}
                        </div>
                        {user.isOrgOwner && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm" title="System Administrator">
                            <ShieldCheck size={10} className="text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-black text-slate-900 truncate">
                          {user.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tight ${user.isOrgOwner ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                            {user.isOrgOwner ? "Owner" : user.role}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400 font-mono">
                            #{user.staffCode ?? "SYS"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BRANCH SWITCHER LAYER */}
                  <div className="p-2 border-b border-slate-100 relative">
                    <button
                      disabled={isSwitching || !canSwitchBranches}
                      onClick={() => setShowBranches(!showBranches)}
                      className="w-full group flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors disabled:cursor-default"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600">
                          {isSwitching ? <Loader2 size={18} className="animate-spin" /> : <MapPin size={18} />}
                        </div>
                        <div className="flex flex-col items-start min-w-0">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Active Branch</span>
                          <span className="text-xs font-bold text-slate-700 truncate max-w-[140px]">
                            {user.branchName || "Organization Head"}
                          </span>
                        </div>
                      </div>
                      {canSwitchBranches && (
                        <ChevronDown 
                          size={16} 
                          className={`text-slate-400 transition-transform duration-300 ${showBranches ? 'rotate-180' : ''}`} 
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
                          <div className="pt-2 pb-1 flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar">
                            {user.allowedBranches.map((branch) => (
                              <button
                                key={branch.id}
                                disabled={isSwitching || branch.id === user.branchId}
                                onClick={() => handleBranchSwitch(branch.id)}
                                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${
                                  branch.id === user.branchId 
                                    ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                                    : 'text-slate-600 hover:bg-slate-100 active:scale-[0.98]'
                                }`}
                              >
                                <span className="truncate">{branch.name}</span>
                                {branch.id === user.branchId ? (
                                  <CheckCircle2 size={14} />
                                ) : (
                                  <span className="text-[9px] opacity-50 uppercase tracking-tighter">
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
                  <div className="p-2">
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
                    
                    <div className="my-1.5 border-t border-slate-100" />
                    
                    <button
                      disabled={isSwitching}
                      onClick={() => { setOpen(false); setConfirmOpen(true); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-red-600 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      <LogOut size={18} />
                      Terminate Session
                    </button>
                  </div>

                  {/* FOOTER / ORG INFO */}
                  <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                     <div className="flex items-center gap-2 min-w-0">
                       <Building2 size={12} className="text-slate-400" />
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[200px]">
                         {user.organizationName}
                       </span>
                     </div>
                     {user.isOrgOwner && (
                       <div className="flex items-center gap-1">
                         <span className="text-[8px] font-bold text-emerald-600 uppercase">Enterprise</span>
                         <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                       </div>
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
        message="You are about to end your session. Any unsaved progress in active terminals may be lost."
        confirmLabel="Sign Out"
        destructive
        loading={isSwitching}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSignOut}
      />
    </>
  );
}

/**
 * Standardized Menu Item component utilizing Lucide icons with strict typing
 */
const MenuAction = ({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) => (
  <DropdownMenu.Item
    onClick={onClick}
    className="flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-slate-700 rounded-xl cursor-pointer outline-none hover:bg-slate-100 transition-all active:scale-[0.98] focus:bg-slate-100"
  >
    <Icon size={18} className="text-slate-400" />
    {label}
  </DropdownMenu.Item>
);