"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";

// Components
import ContactForm from "@/core/components/shared/SupportForm";
import { ActivityLogsPanel } from "@/modules/audit/components/ActivityLogsPanel";

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
        <button type="button" onClick={onClose} className="flex-1 py-3 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">Cancel</button>
        <button 
          onClick={handleSave}
          disabled={isSubmitting || !isValid}
          className="flex-2 px-3 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-opacity disabled:opacity-20 hover:bg-slate-800"
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
        <p className="hidden md:block text-[13px] text-slate-500 mt-1 truncate">
          {profile.organization.name} • System Interface Signature
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button 
          onClick={onSupport} 
          title="Support"
          className="p-2 md:px-4 md:py-2 text-[12px] font-semibold border rounded-lg transition-colors flex items-center gap-2 bg-white border-black/5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 shadow-sm"
        >
          <i className="bx bx-help-circle text-base md:text-sm" />
          <span className="hidden md:inline whitespace-nowrap">Support</span>
        </button>
        <button 
          onClick={onLogs} 
          title="Audit Logs"
          className="p-2 md:px-5 md:py-2 bg-slate-900 text-white text-[12px] font-semibold rounded-lg shadow-sm hover:bg-slate-800 transition-all flex items-center gap-2"
        >
          <i className="bx bx-history text-base md:text-sm" />
          <span className="hidden md:inline whitespace-nowrap">Audit Logs</span>
        </button>
      </div>
    </div>

    <div className="mt-6 pt-4 border-t border-black/5">
      {/* flex-row: Always horizontal 
          md:justify-start: Align left on larger screens
          items-stretch: Ensures dividers are full height
      */}
      <div className="flex flex-row items-stretch md:justify-start w-full gap-0 md:gap-12">
        
        {/* Global Role - flex-1 on mobile to fill 1/3 of width */}
        <div className="flex flex-1 md:flex-none flex-col min-w-0">
          <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">
            Global Role
          </span>
          <span className="text-sm md:text-xl font-bold text-slate-800 truncate">
            {profile.role}
          </span>
        </div>

        {/* Divider (Mobile only) - subtle vertical line */}
        <div className="w-px bg-black/5 mx-2 md:hidden" />

        {/* Active Nodes */}
        <div className="flex flex-1 md:flex-none flex-col min-w-0 md:border-l md:border-black/5 md:pl-12">
          <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">
            Nodes
          </span>
          <span className="text-sm md:text-xl font-bold text-slate-800 truncate">
            {profile.assignments.length}
          </span>
        </div>

        {/* Divider (Mobile only) */}
        <div className="w-px bg-black/5 mx-2 md:hidden" />

        {/* Integrity Status */}
        <div className="flex flex-1 md:flex-none flex-col min-w-0 md:border-l md:border-black/5 md:pl-12">
          <span className={`text-[9px] md:text-[10px] font-black uppercase tracking-widest truncate ${
            profile.isLocked ? 'text-red-500' : 'text-emerald-500'
          }`}>
            Status
          </span>
          <span className="text-sm md:text-xl font-bold text-slate-800 truncate">
            {profile.isLocked ? "Locked" : "Active"}
          </span>
        </div>

      </div>
    </div>
  </header>
);

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const { dispatch } = useAlerts();
  const { openPanel, closePanel, resetToDefault } = useSidePanel();

  // Reference lock to prevent the auto-open effect from looping
  const hasAttemptedAutoOpen = useRef(false);

  // Close panel on unmount to match PersonnelOperations cleanup logic
  useEffect(() => {
    return () => closePanel();
  }, [closePanel]);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (!res.ok) throw new Error();
      setProfile(data.profile);
    } catch {
      dispatch({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Sync Failed", 
        message: "Error fetching personnel telemetry." 
      });
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  // Initial Data Fetch
  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Auto-Open Logs Logic: Evaluates only once per session/mount
  useEffect(() => {
    if (loading || !profile || hasAttemptedAutoOpen.current) return;

    const isDesktop = window.innerWidth >= 1024;
    const hasOpenedThisSession = sessionStorage.getItem('masa_logs_auto_opened');

    if (isDesktop && !hasOpenedThisSession) {
      openPanel(
        <ActivityLogsPanel 
          logs={profile.activityLogs} 
          onClose={resetToDefault} 
        />
      );
      sessionStorage.setItem('masa_logs_auto_opened', 'true');
    }

    hasAttemptedAutoOpen.current = true;
  }, [loading, profile, openPanel, resetToDefault]);

  const triggerEdit = (field: "name" | "email" | "password", initialValue: string) => {
    openPanel(
      <EditProfilePanel
        field={field}
        initialValue={initialValue}
        onClose={resetToDefault}
        onSuccess={() => {
          loadProfile();
          resetToDefault();
        }}
      />
    );
  };

  const triggerSupport = () => {
    if (!profile) return;
    openPanel(
      <ContactForm 
        user={profile} 
        onSuccess={resetToDefault} 
        onCancel={resetToDefault} 
      />
    );
  };

  const triggerLogs = () => {
    if (!profile) return;
    openPanel(
      <ActivityLogsPanel 
        logs={profile.activityLogs} 
        onClose={resetToDefault} 
      />
    );
  };

  if (loading || !profile) return (
    <div className="h-full w-full flex items-center justify-center bg-white relative z-0">
      <div className="flex flex-col items-center gap-4">
        <i className="bx bx-loader-alt animate-spin text-3xl text-slate-800" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Authenticating Session</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full bg-white relative z-0 overflow-hidden">
      {/* Profile Header matching the Management Header style */}
      <ProfileHeader 
        profile={profile}
        onSupport={triggerSupport}
        onLogs={triggerLogs}
      />

      {/* Critical Security Notices */}
      {(profile.isLocked || profile.requiresPasswordChange) && (
        <div className="px-4 py-2 bg-red-50/50 border-b border-red-100 shrink-0">
          <div className="text-[10px] font-bold text-red-600 uppercase tracking-tight flex items-center gap-2">
            <i className="bx bxs-error-alt text-base" /> 
            {profile.isLocked ? `Locked: ${profile.lockReason || "Security Violation"}` : "Password Change Required"}
          </div>
        </div>
      )}

      {/* Table-Style Header: Matched to PersonnelOperations */}
      <div className="px-4 md:px-8 py-2 shrink-0 flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-black/[0.04] bg-white overflow-hidden whitespace-nowrap">
        <div className="w-[140px] md:w-[180px] shrink-0 truncate">Credential Type</div>
        <div className="flex-1 min-w-[120px] truncate">Current Value / Status</div>
        <div className="w-[70px] md:w-[100px] shrink-0 text-right md:text-right">Update</div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white relative">
        <div className="divide-y divide-black/[0.02]">
          
          {/* Row: Name */}
          <div className="px-4 md:px-8 py-4 flex items-center hover:bg-slate-50/50 group cursor-pointer transition-colors" onClick={() => triggerEdit("name", profile.name || "")}>
            <div className="w-[140px] md:w-[180px] shrink-0 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600 border border-slate-100 shrink-0">
                <i className="bx bx-user text-lg" />
              </div>
              <span className="text-[11px] font-bold text-slate-500 uppercase truncate">Full Name</span>
            </div>
            <div className="flex-1 min-w-[120px]">
              <span className="text-[13px] font-medium text-slate-900 uppercase tracking-tight truncate block">{profile.name || "N/A"}</span>
            </div>
            <div className="w-[70px] md:w-[100px] shrink-0 text-right opacity-0 group-hover:opacity-100 transition-opacity">
               <i className="bx bx-edit-alt text-xl text-slate-400 hover:text-slate-900" />
            </div>
          </div>

          {/* Row: Email */}
          <div className="px-4 md:px-8 py-4 flex items-center hover:bg-slate-50/50 group cursor-pointer transition-colors" onClick={() => triggerEdit("email", profile.email)}>
            <div className="w-[140px] md:w-[180px] shrink-0 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100 shrink-0">
                <i className="bx bx-envelope text-lg" />
              </div>
              <span className="text-[11px] font-bold text-slate-500 uppercase truncate">Primary Email</span>
            </div>
            <div className="flex-1 flex flex-col min-w-[120px]">
              <span className="text-[13px] font-medium text-slate-900 truncate block">{profile.email}</span>
              {profile.pendingEmail && (
                <span className="text-[10px] text-blue-500 font-bold uppercase animate-pulse truncate block">Pending: {profile.pendingEmail}</span>
              )}
            </div>
            <div className="w-[70px] md:w-[100px] shrink-0 text-right opacity-0 group-hover:opacity-100 transition-opacity">
               <i className="bx bx-edit-alt text-xl text-slate-400 hover:text-slate-900" />
            </div>
          </div>

          {/* Row: Staff Code (Read Only) */}
          <div className="px-4 md:px-8 py-4 flex items-center hover:bg-slate-50/50 transition-colors">
            <div className="w-[140px] md:w-[180px] shrink-0 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600 border border-slate-100 shrink-0">
                <i className="bx bx-barcode-reader text-lg" />
              </div>
              <span className="text-[11px] font-bold text-slate-500 uppercase truncate">Staff Code</span>
            </div>
            <div className="flex-1 min-w-[120px] font-mono text-[13px] font-medium text-slate-900 truncate">{profile.staffCode ?? "UNASSIGNED"}</div>
            <div className="w-[70px] md:w-[100px] shrink-0 text-right">
               <i className="bx bx-lock-alt text-lg text-slate-300" />
            </div>
          </div>

          {/* Row: Security */}
          <div className="px-4 md:px-8 py-4 flex items-center hover:bg-slate-50/50 group cursor-pointer transition-colors" onClick={() => triggerEdit("password", "")}>
            <div className="w-[140px] md:w-[180px] shrink-0 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600 border border-purple-100 shrink-0">
                <i className="bx bx-shield-lock text-lg" />
              </div>
              <span className="text-[11px] font-bold text-slate-500 uppercase truncate">Security</span>
            </div>
            <div className="flex-1 min-w-[120px] font-mono tracking-[0.4em] text-slate-900 truncate">••••••••••••</div>
            <div className="w-[70px] md:w-[100px] shrink-0 text-right opacity-0 group-hover:opacity-100 transition-opacity">
               <i className="bx bx-edit-alt text-xl text-slate-400 hover:text-slate-900" />
            </div>
          </div>

          {/* Subsection: Branch Topology */}
          <div className="px-4 md:px-8 py-3 bg-slate-50/50 border-y border-black/[0.04] flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Branch Topology</h3>
          </div>

          {profile.assignments.map((a) => (
             <div key={a.id} className="px-4 md:px-8 py-4 flex items-center hover:bg-slate-50/50 transition-colors">
                <div className="w-[140px] md:w-[180px] shrink-0 flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${a.isPrimary ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-slate-200'}`} />
                  <span className="text-[11px] font-bold text-slate-500 uppercase truncate">{a.isPrimary ? "Primary" : "Secondary"}</span>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <p className="text-[13px] font-medium text-slate-900 truncate">{a.branchName}</p>
                </div>
                <div className="w-[70px] md:w-[100px] shrink-0 text-right">
                  <span className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase border tracking-widest bg-white text-slate-600 border-black/5`}>
                    {a.role}
                  </span>
                </div>
             </div>
          ))}
        </div>

        {/* Telemetry Footer matching the terminal aesthetic */}
        <div className="p-4 md:p-8 mt-4 border-t border-black/[0.03] grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
            <div className="lg:col-span-1 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Interface Signature</h4>
                <div className="p-5 bg-white rounded-2xl border border-black/[0.05] shadow-sm space-y-5">
                    <div className="flex justify-between items-end">
                        <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Network IP</span>
                            <span className="text-[13px] font-mono font-bold text-slate-900 leading-none">{profile.lastLoginIp || "::1"}</span>
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

            <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between px-1">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Environment Telemetry</h4>
                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        Active Terminal
                    </span>
                </div>
                <div className="p-5 bg-slate-900 rounded-2xl border border-black shadow-xl h-[108px] relative overflow-hidden group">
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