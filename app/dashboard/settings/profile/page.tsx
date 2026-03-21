"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAlerts } from "@/components/feedback/AlertProvider";
import { useSidePanel } from "@/components/layout/SidePanelContext";

// Components
import ContactForm from "@/components/forms/ContactForm";
import { ActivityLogsPanel } from "@/components/logs/ActivityLogsPanel";

/* ================= TYPES ================= */

type Role = "ADMIN" | "MANAGER" | "SALES" | "INVENTORY" | "CASHIER" | "DEV";

interface BranchAssignmentDTO {
  id: string;
  branchId: string;
  branchName: string;
  branchLocation: string | null;
  role: Role;
  isPrimary: boolean;
}

interface ActivityLogDTO {
  id: string;
  action: string;
  critical: boolean;
  createdAt: string;
  ipAddress: string;
  deviceInfo: string;
  metadata: any;
}

interface ProfileDTO {
  id: string;
  name: string | null;
  email: string;
  staffCode: string | null;
  role: Role;
  isOrgOwner: boolean;
  disabled: boolean;
  isLocked: boolean;
  lockReason: string | null;
  requiresPasswordChange: boolean;
  lastLogin: string | null;
  lastActivityAt: string | null;
  lastLoginIp: string;
  lastLoginDevice: string;
  pendingEmail: string | null;
  pendingPassword: string | null;
  organization: { id: string; name: string };
  assignments: BranchAssignmentDTO[];
  activityLogs: ActivityLogDTO[];
}

/* ================= UTILS & ANIMATIONS ================= */

const getRoleStyles = (role: Role): string => {
  const styles: Record<string, string> = {
    ADMIN: "bg-purple-50 text-purple-700 border-purple-100",
    DEV: "bg-slate-900 text-white border-transparent",
    MANAGER: "bg-blue-50 text-blue-700 border-blue-100",
    SALES: "bg-emerald-50 text-emerald-700 border-emerald-100",
    INVENTORY: "bg-orange-50 text-orange-700 border-orange-100",
    CASHIER: "bg-cyan-50 text-cyan-700 border-cyan-100",
  };
  return styles[role] || "bg-slate-50 text-slate-600 border-slate-200";
};

const panelVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25, ease: "easeOut" } },
  exit: { opacity: 0, x: 10, transition: { duration: 0.2, ease: "easeIn" } }
};

/* ================= EDIT PANEL COMPONENT ================= */

const EditProfilePanel = ({ 
  field, 
  initialValue, 
  onClose, 
  onSuccess 
}: { 
  field: "name" | "email" | "password"; 
  initialValue: string; 
  onClose: () => void; 
  onSuccess: () => void;
}) => {
  const [value, setValue] = useState(field === "password" ? "" : initialValue);
  const [confirmValue, setConfirmValue] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  
  const { dispatch } = useAlerts();

  const passwordsMatch = useMemo(() => {
    if (field !== "password") return true;
    return value === confirmValue && value.length > 0;
  }, [value, confirmValue, field]);

  const passwordStrength = useMemo(() => {
    if (field !== "password" || !value) return 0;
    let score = 0;
    if (value.length >= 8) score += 25;
    if (/[A-Z]/.test(value)) score += 25;
    if (/[0-9]/.test(value)) score += 25;
    if (/[^A-Za-z0-9]/.test(value)) score += 25;
    return score;
  }, [value, field]);

  const isValid = useMemo(() => {
    if (!value) return false;
    if (field === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && currentPassword.length > 0;
    if (field === "password") {
      return passwordStrength >= 75 && passwordsMatch && currentPassword.length > 0;
    }
    return value.trim().length >= 2;
  }, [field, value, currentPassword, passwordStrength, passwordsMatch]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setIsSubmitting(true);

    try {
      const body: any = {};
      if (field === "name") body.name = value;
      if (field === "email") {
        body.email = value;
        body.currentPassword = currentPassword;
      }
      if (field === "password") {
        body.newPassword = value;
        body.currentPassword = currentPassword;
      }

      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update protocol failed.");

      dispatch({ 
        kind: "TOAST", 
        type: data.requiresApproval ? "WARNING" : "SUCCESS", 
        title: data.requiresApproval ? "Approval Queued" : "Protocol Success", 
        message: data.message || "Profile data synchronized." 
      });

      onSuccess();
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Security Halt", message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div variants={panelVariants} initial="hidden" animate="visible" exit="exit" className="h-full flex flex-col bg-white">
      {/* HEADER */}
      <div className="p-6 border-b border-black/[0.04] flex justify-between items-center">
        <div>
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Update Sequence</h2>
          <p className="text-lg font-bold text-slate-900 capitalize">{field} Configuration</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
          <i className="bx bx-x text-xl text-slate-400" />
        </button>
      </div>

      <form onSubmit={handleSave} className="flex-1 p-6 space-y-6 overflow-y-auto">
        <div className="space-y-4">
          
          {/* PRIMARY FIELD RENDERING */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
              {field === "name" ? "Full Legal Name" : field === "email" ? "New Email Address" : "New Password"}
            </label>
            <div className="relative">
              <input
                autoFocus
                type={field === "password" ? (showNewPass ? "text" : "password") : field === "email" ? "email" : "text"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={field === "email" ? "new.email@masa.com" : field === "name" ? "Enter full name" : ""}
                className="w-full px-4 py-3 bg-slate-50 border border-black/[0.05] rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-slate-900/5 outline-none transition-all pr-12"
              />
              {field === "password" && (
                <button type="button" onClick={() => setShowNewPass(!showNewPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-900">
                  <i className={`bx ${showNewPass ? 'bx-hide' : 'bx-show'} text-lg`} />
                </button>
              )}
            </div>
            
            {field === "password" && value.length > 0 && (
              <div className="px-1 pt-2 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Entropy Level</span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-900">{passwordStrength}%</span>
                </div>
                <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                  <motion.div animate={{ width: `${passwordStrength}%` }} className={`h-full ${passwordStrength < 75 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                </div>
              </div>
            )}
          </div>

          {/* EMAIL HELPER TEXT */}
          {field === "email" && (
            <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100/50">
              <p className="text-[11px] text-blue-700 leading-relaxed font-medium">
                Changing your primary email requires administrative approval. Your current email will remain active until approved.
              </p>
            </div>
          )}

          {/* PASSWORD CONFIRMATION */}
          {field === "password" && (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Confirm Password</label>
                {confirmValue.length > 0 && (
                  <span className={`text-[9px] font-black uppercase tracking-widest ${passwordsMatch ? 'text-emerald-500' : 'text-red-500'}`}>
                    {passwordsMatch ? "Match" : "Mismatch"}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showConfirmPass ? "text" : "password"}
                  value={confirmValue}
                  onChange={(e) => setConfirmValue(e.target.value)}
                  className={`w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm font-bold text-slate-900 focus:ring-2 outline-none transition-all pr-12 ${
                    confirmValue.length > 0 && !passwordsMatch ? 'border-red-200 focus:ring-red-500/10' : 'border-black/[0.05] focus:ring-slate-900/5'
                  }`}
                />
                <button type="button" onClick={() => setShowConfirmPass(!showConfirmPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-900">
                  <i className={`bx ${showConfirmPass ? 'bx-hide' : 'bx-show'} text-lg`} />
                </button>
              </div>
            </div>
          )}

          {/* SECURITY CHALLENGE */}
          {(field === "email" || field === "password") && (
            <div className="pt-4 border-t border-black/[0.04] space-y-1.5">
              <label className="text-[10px] font-bold text-red-500 uppercase tracking-widest px-1">Security Challenge (Current Password)</label>
              <div className="relative">
                <input
                  type={showCurrentPass ? "text" : "password"}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-red-100 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-red-500/20 outline-none transition-all pr-12"
                />
                <button type="button" onClick={() => setShowCurrentPass(!showCurrentPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-red-500">
                  <i className={`bx ${showCurrentPass ? 'bx-hide' : 'bx-show'} text-lg`} />
                </button>
              </div>
            </div>
          )}
        </div>
      </form>

      {/* FOOTER */}
      <div className="p-6 border-t border-black/[0.04] bg-slate-50/50 flex gap-3">
        <button type="button" onClick={onClose} className="flex-1 py-3 text-sm font-bold text-slate-500">Cancel</button>
        <button 
          onClick={handleSave}
          disabled={isSubmitting || !isValid}
          className="flex-2 px-8 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-opacity disabled:opacity-20"
        >
          {isSubmitting ? <i className="bx bx-loader-alt animate-spin" /> : <i className="bx bx-check-shield" />}
          Commit Changes
        </button>
      </div>
    </motion.div>
  );
};

/* ================= SUB-COMPONENTS ================= */

const ProfileHeader = ({ profile, onSupport, onLogs }: { profile: ProfileDTO, onSupport: () => void, onLogs: () => void }) => (
  <header className="px-4 py-4 shrink-0 border-b border-black/[0.04] bg-white">
    <div className="flex items-center justify-between gap-4">
      <div className="px-2 truncate">
        <h1 className="text-lg md:text-2xl font-semibold tracking-tight text-slate-900 truncate">Personnel Profile</h1>
        <p className="text-[13px] text-slate-500 mt-1 truncate font-medium uppercase tracking-tight">
          {profile.organization.name} • System Interface Signature
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onSupport} className="p-2 md:px-4 md:py-2 text-[12px] font-semibold border rounded-lg bg-white border-black/5 text-slate-500 hover:bg-slate-50 shadow-sm flex items-center gap-2">
          <i className="bx bx-help-circle text-base md:text-sm" />
          <span className="hidden md:inline">Support</span>
        </button>
        <button onClick={onLogs} className="p-2 md:px-5 md:py-2 bg-slate-900 text-white text-[12px] font-semibold rounded-lg shadow-sm hover:bg-slate-800 flex items-center gap-2">
          <i className="bx bx-history text-base md:text-sm" />
          <span className="hidden md:inline">Audit Logs</span>
        </button>
      </div>
    </div>

    <div className="flex gap-4 md:gap-8 mt-6 pt-4 border-t border-black/5 overflow-x-auto no-scrollbar">
      <div className="flex flex-col shrink-0">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Role</span>
        <span className="text-lg font-medium text-slate-800">{profile.role}</span>
      </div>
      <div className="w-px h-8 bg-black/5 self-center" />
      <div className="flex flex-col shrink-0">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Nodes</span>
        <span className="text-lg font-medium text-slate-800">{profile.assignments.length}</span>
      </div>
      <div className="w-px h-8 bg-black/5 self-center" />
      <div className="flex flex-col shrink-0">
        <span className={`text-[10px] font-bold uppercase tracking-widest ${profile.isLocked ? 'text-red-500' : 'text-emerald-500'}`}>Integrity Status</span>
        <span className="text-lg font-medium text-slate-800">{profile.isLocked ? "Suspended" : "Operational"}</span>
      </div>
    </div>
  </header>
);

/* ================= MAIN PROFILE PAGE ================= */

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const { dispatch } = useAlerts();
  const { openPanel, closePanel } = useSidePanel();

  // Reference lock to prevent the auto-open effect from looping
  const hasAttemptedAutoOpen = useRef(false);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (!res.ok) throw new Error();
      setProfile(data.profile);
    } catch {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Sync Failed", message: "Error fetching personnel telemetry." });
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  // FIX 1: Removed `loadProfile` from dependency array to prevent the fetch-loop 
  // if `dispatch` (inside loadProfile) isn't strictly memoized.
  useEffect(() => { 
    loadProfile(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FIX 2: Added a strict `useRef` lock so this effect logic literally can only ever evaluate once
  // preventing context functions (`openPanel`) from causing continuous re-evaluations.
  useEffect(() => {
    if (loading || !profile || hasAttemptedAutoOpen.current) return;

    const isDesktop = window.innerWidth >= 1024;
    const hasOpenedThisSession = sessionStorage.getItem('masa_logs_auto_opened');

    if (isDesktop && !hasOpenedThisSession) {
      openPanel(<ActivityLogsPanel logs={profile.activityLogs} onClose={closePanel} />);
      sessionStorage.setItem('masa_logs_auto_opened', 'true');
    }

    hasAttemptedAutoOpen.current = true;
  }, [closePanel, loading, openPanel, profile]); 

  const triggerEdit = (field: "name" | "email" | "password", initialValue: string) => {
    openPanel(
      <EditProfilePanel 
        field={field} 
        initialValue={initialValue} 
        onClose={closePanel} 
        onSuccess={() => { loadProfile(); closePanel(); }} 
      />
    );
  };

  if (loading || !profile) return (
    <div className="h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <i className="bx bx-loader-alt animate-spin text-3xl text-slate-800" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Authenticating Session</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full bg-white relative z-0 overflow-hidden">
      <ProfileHeader 
        profile={profile}
        onSupport={() => openPanel(<ContactForm user={profile} onSuccess={closePanel} onCancel={closePanel} />)}
        onLogs={() => openPanel(<ActivityLogsPanel logs={profile.activityLogs} onClose={closePanel} />)}
      />

      {(profile.isLocked || profile.requiresPasswordChange) && (
        <div className="px-4 py-2 bg-red-50/50 border-b border-red-100">
          {profile.isLocked && (
            <div className="text-[10px] font-bold text-red-600 uppercase tracking-tight flex items-center gap-2">
              <i className="bx bxs-error-alt" /> Locked: {profile.lockReason || "Security Violation"}
            </div>
          )}
        </div>
      )}

      {/* Table-Style Header */}
      <div className="px-4 md:px-8 py-2 shrink-0 flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-black/[0.04] bg-slate-50/30">
        <div className="w-[140px] shrink-0">Credential Type</div>
        <div className="flex-1">Current Value / Status</div>
        <div className="w-[100px] text-right">Update</div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
        <div className="divide-y divide-black/[0.02]">
          
          {/* Name Row */}
          <div className="px-4 md:px-8 py-4 flex items-center hover:bg-slate-50/50 group cursor-pointer" onClick={() => triggerEdit("name", profile.name || "")}>
            <div className="w-[140px] shrink-0 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600 border border-slate-100">
                <i className="bx bx-user text-lg" />
              </div>
              <span className="text-[11px] font-bold text-slate-400 uppercase">Full Name</span>
            </div>
            <div className="flex-1">
              <span className="text-[13px] font-bold text-slate-900 uppercase tracking-tight">{profile.name || "N/A"}</span>
            </div>
            <div className="w-[100px] shrink-0 text-right opacity-0 group-hover:opacity-100 transition-opacity">
               <i className="bx bx-edit-alt text-xl text-slate-400" />
            </div>
          </div>

          {/* Email Row */}
          <div className="px-4 md:px-8 py-4 flex items-center hover:bg-slate-50/50 group cursor-pointer" onClick={() => triggerEdit("email", profile.email)}>
            <div className="w-[140px] shrink-0 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
                <i className="bx bx-envelope text-lg" />
              </div>
              <span className="text-[11px] font-bold text-slate-400 uppercase">Primary Email</span>
            </div>
            <div className="flex-1 flex flex-col">
              <span className="text-[13px] font-bold text-slate-900">{profile.email}</span>
              {profile.pendingEmail && (
                <span className="text-[10px] text-blue-500 font-bold uppercase animate-pulse">Pending Approval: {profile.pendingEmail}</span>
              )}
            </div>
            <div className="w-[100px] text-right opacity-0 group-hover:opacity-100 transition-opacity">
               <i className="bx bx-edit-alt text-xl text-slate-400" />
            </div>
          </div>

          {/* Personnel Code Row */}
          <div className="px-4 md:px-8 py-4 flex items-center hover:bg-slate-50/50 group">
            <div className="w-[140px] shrink-0 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600 border border-slate-100">
                <i className="bx bx-barcode-reader text-lg" />
              </div>
              <span className="text-[11px] font-bold text-slate-400 uppercase">Staff Code</span>
            </div>
            <div className="flex-1 font-mono text-[13px] font-bold text-slate-900">{profile.staffCode ?? "UNASSIGNED"}</div>
            <div className="w-[100px] text-right">
               <i className="bx bx-lock-alt text-lg text-slate-300" />
            </div>
          </div>

          {/* Security Row */}
          <div className="px-4 md:px-8 py-4 flex items-center hover:bg-slate-50/50 group cursor-pointer" onClick={() => triggerEdit("password", "")}>
            <div className="w-[140px] shrink-0 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600 border border-purple-100">
                <i className="bx bx-shield-lock text-lg" />
              </div>
              <span className="text-[11px] font-bold text-slate-400 uppercase">Security</span>
            </div>
            <div className="flex-1 font-mono tracking-[0.4em] text-slate-900">••••••••••••</div>
            <div className="w-[100px] text-right opacity-0 group-hover:opacity-100 transition-opacity">
               <i className="bx bx-edit-alt text-xl text-slate-400" />
            </div>
          </div>

          {/* Branch Topology Section */}
          <div className="px-4 md:px-8 py-3 bg-slate-50/50 border-y border-black/[0.04] flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Branch Topology</h3>
          </div>

          {profile.assignments.map((a) => (
             <div key={a.id} className="px-4 md:px-8 py-4 flex items-center hover:bg-slate-50/50">
                <div className="w-[140px] shrink-0 flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full ${a.isPrimary ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-slate-200'}`} />
                  <span className="text-[11px] font-bold text-slate-400 uppercase">{a.isPrimary ? "Primary" : "Secondary"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-slate-900 truncate">{a.branchName}</p>
                </div>
                <div className="w-[120px] text-right">
                  <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border tracking-widest ${getRoleStyles(a.role)}`}>
                    {a.role}
                  </span>
                </div>
             </div>
          ))}
        </div>

        {/* Telemetry Footer */}
        <div className="p-8 bg-slate-50/50 border-t border-black/[0.03] grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Interface Signature */}
            <div className="md:col-span-1 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Interface Signature</h4>
                <div className="p-5 bg-white rounded-2xl border border-black/[0.05] shadow-sm space-y-5">
                    <div className="flex justify-between items-end">
                        <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Network IP</span>
                            <span className="text-[13px] font-mono font-bold text-slate-900 leading-none">
                                {profile.lastLoginIp || "::1"}
                            </span>
                        </div>
                        <i className="bx bx-broadcast text-slate-200 text-xl" />
                    </div>
                    
                    <div className="h-px bg-black/[0.04] w-full" />
                    
                    <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Auth Timestamp</span>
                        <span className="text-[12px] font-bold text-slate-700">
                            {new Date(profile.lastLogin || "").toLocaleString()}
                        </span>
                    </div>
                </div>
            </div>

            {/* Environment / User Agent */}
            <div className="md:col-span-2 space-y-4">
                <div className="flex items-center justify-between px-1">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Environment Telemetry</h4>
                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                        <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                        Active Terminal
                    </span>
                </div>
                <div className="p-5 bg-slate-900 rounded-2xl border border-black shadow-xl h-[108px] relative overflow-hidden group">
                    {/* Terminal Background Decoration */}
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none">
                        <i className="bx bx-terminal text-6xl text-white" />
                    </div>
                    
                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div className="flex gap-1.5 mb-2">
                            <div className="w-2 h-2 rounded-full bg-red-500/20" />
                            <div className="w-2 h-2 rounded-full bg-amber-500/20" />
                            <div className="w-2 h-2 rounded-full bg-emerald-500/20" />
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono leading-relaxed line-clamp-2 break-all italic">
                            <span className="text-emerald-500 mr-2">$</span>
                            {profile.lastLoginDevice || "Unknown Terminal / Null_Agent"}
                        </p>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}