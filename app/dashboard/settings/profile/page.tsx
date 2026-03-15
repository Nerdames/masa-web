"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/feedback/ToastProvider";
import { getInitials } from "@/lib/getInitials";

// Modals & Forms
import EmailChangeModal from "@/components/modal/EmailChangeModal";
import PasswordChangeModal from "@/components/modal/PasswordChangeModal";
import ContactForm from "@/components/forms/ContactForm";

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
  ipAddress?: string;
  deviceInfo?: string;
  personnel?: { name: string | null };
  branch?: { name: string | null };
  approvalId?: string;
  metadata?: Record<string, unknown> | string | null;
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
  lastLogin: string | null;
  lastActivityAt: string | null;
  lastLoginIp: string | null;
  lastLoginDevice: string | null;
  pendingEmail: string | null;
  pendingPassword: string | null;
  organization: { id: string; name: string };
  assignments: BranchAssignmentDTO[];
  activityLogs: ActivityLogDTO[];
}

interface InfoRowProps {
  icon: string;
  label: string;
  value: React.ReactNode;
  onEdit?: () => void;
  onCopy?: () => void;
  badge?: React.ReactNode;
  subValue?: string;
}

/* ================= UTILS ================= */

const formatDate = (date: string | null) =>
  date ? new Date(date).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Never";

const formatMetadata = (metadata: unknown): string | null => {
  if (!metadata) return null;
  if (typeof metadata === "string") return metadata;
  
  if (typeof metadata === "object" && metadata !== null) {
    const metaRecord = metadata as Record<string, unknown>;
    const relevantInfo = metaRecord.reason || metaRecord.details || metaRecord.description;
    
    if (typeof relevantInfo === "string") return relevantInfo;
    
    if (metaRecord.changes && typeof metaRecord.changes === "object" && metaRecord.changes !== null) {
      return `Modified: ${Object.keys(metaRecord.changes as Record<string, unknown>).join(", ")}`;
    }
  }
  return null;
};

const getRoleStyles = (role: Role): string => {
  const styles: Record<string, string> = {
    ADMIN: "bg-purple-50/50 text-purple-700/80 border-purple-100/50",
    DEV: "bg-gray-900/80 text-white/90 border-transparent",
    MANAGER: "bg-blue-50/50 text-blue-700/80 border-blue-100/50",
    SALES: "bg-emerald-50/50 text-emerald-700/80 border-emerald-100/50",
    INVENTORY: "bg-orange-50/50 text-orange-700/80 border-orange-100/50",
    CASHIER: "bg-cyan-50/50 text-cyan-700/80 border-cyan-100/50",
  };
  return styles[role] || "bg-gray-50/50 text-gray-600/80";
};

const panelVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.2, ease: "easeOut" } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.15, ease: "easeIn" } }
};

/* ================= SUB-COMPONENTS ================= */

const InfoRow = ({ icon, label, value, onEdit, onCopy, badge, subValue }: InfoRowProps) => (
  <div className="group flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-gray-100/50 hover:bg-gray-50/30 transition-all gap-4">
    <div className="flex items-center gap-4 min-w-0">
      <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50/50 text-gray-400 group-hover:bg-white group-hover:shadow-sm transition-all shrink-0">
        <i className={`bx ${icon} text-lg`} />
      </div>
      <div className="flex flex-col min-w-0 text-left">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-gray-400/80 font-black">{label}</span>
          {badge}
        </div>
        <span className="text-sm text-gray-800 font-bold truncate">{value}</span>
        {subValue && <span className="text-[10px] text-gray-400/80 font-medium">{subValue}</span>}
      </div>
    </div>

    {/* Right Action Area */}
    <div className="flex items-center gap-1 self-end sm:self-auto shrink-0">
      {onCopy && (
        <button 
          onClick={onCopy}
          className="p-2 text-gray-300 hover:text-slate-500 hover:bg-gray-50/50 rounded-lg transition-all"
          title="Copy to clipboard"
        >
          <i className="bx bx-copy-alt text-lg" />
        </button>
      )}
      
      {onEdit && (
        <button 
          onClick={onEdit} 
          className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50/50 rounded-lg transition-all"
        >
          <i className="bx bx-edit-alt text-lg" />
        </button>
      )}
    </div>
  </div>
);

function LogFilter({ active, onFilterChange }: { active: string; onFilterChange: (action: string) => void }) {
  const actions = ["ALL_ACTIONS", "PROVISION", "SECURITY", "UPDATE", "ACCOUNT_LOCKED"];
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
      <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
      {actions.map(a => (
        <button
          key={a}
          onClick={() => onFilterChange(a)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-tighter transition-all border ${
            active === a 
              ? "bg-slate-800/90 text-white/90 border-slate-800/90 shadow-sm" 
              : "bg-white/50 text-black/30 border-black/5 hover:border-black/10 hover:text-black/50"
          }`}
        >
          {a.replace(/_/g, " ")}
        </button>
      ))}
    </div>
  );
}

function ActivityLogsPanel({ logs }: { logs: ActivityLogDTO[] }) {
  const [filter, setFilter] = useState("ALL_ACTIONS");

  const filteredLogs = useMemo(() => {
    if (filter === "ALL_ACTIONS") return logs;
    return logs.filter(l => {
      const action = l.action.toUpperCase();
      if (filter === "SECURITY") return action.includes("LOCK") || action.includes("ACCESS") || action.includes("LOGIN") || action.includes("PASSWORD");
      if (filter === "PROVISION") return action.includes("CREATE") || action.includes("ASSIGN");
      if (filter === "UPDATE") return action.includes("UPDATE") || action.includes("PATCH") || action.includes("EDIT");
      if (filter === "ACCOUNT_LOCKED") return action.includes("LOCKED");
      return action.includes(filter);
    });
  }, [logs, filter]);

  return (
    <motion.div variants={panelVariants} initial="hidden" animate="visible" exit="exit" className="h-full flex flex-col w-full absolute inset-0 bg-[#FAFAFC]/80">
      <div className="p-4 border-b border-black/5 bg-white/80 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/30 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400/80 shadow-[0_0_8px_rgba(16,185,129,0.3)] animate-pulse" /> 
            Live_Audit_Trail
          </h2>
          <span className="text-[9px] font-bold text-slate-400/80 bg-slate-50/80 px-2 py-0.5 rounded border border-slate-100/50 tabular-nums">
            {filteredLogs.length}
          </span>
        </div>
        <LogFilter active={filter} onFilterChange={setFilter} />
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-black/5">
        {filteredLogs.map((log) => {
          const performer = log.personnel?.name || "System Core";
          const metaDetail = formatMetadata(log.metadata);
          
          return (
            <motion.div 
              key={log.id} 
              initial={{ opacity: 0, x: -5 }} 
              animate={{ opacity: 1, x: 0 }}
              className="bg-white/80 border border-black/[0.02] rounded-xl p-4 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] font-black uppercase tracking px-2 py-1 rounded ${
                      log.critical ? 'bg-red-50/50 text-red-500/80' : 'bg-blue-50/50 text-blue-500/80'
                    }`}>
                      {log.action.replace(/_/g, " ")}
                    </span>
                    {log.approvalId && (
                      <span className="text-[8px] font-bold bg-amber-50/50 text-amber-600/80 px-1.5 py-0.5 rounded border border-amber-100/50">
                        VERIFIED_BY_ADMIN
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-700/90 text-left">
                    {metaDetail || `Executed by ${performer}`}
                  </p>
                </div>
                <span className="text-[9px] font-bold text-nowrap text-slate-400/80 tabular-nums">
                  {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 py-3 border-y border-black/[0.02] my-3">
                <div className="space-y-1 text-left">
                  <label className="text-[8px] font-black text-black/20 uppercase tracking-tighter">Initiator</label>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-slate-50 flex items-center justify-center text-[8px] font-bold text-slate-400">
                      {performer.charAt(0)}
                    </div>
                    <span className="text-[10px] font-bold text-slate-500/90 truncate">{performer}</span>
                  </div>
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-[8px] font-black text-black/20 uppercase tracking-tighter">Location Context</label>
                  <p className="text-[10px] font-bold text-slate-500/90 flex items-center gap-1 truncate">
                    <i className="bx bx-map-alt text-slate-300" />
                    {log.branch?.name || "Global / Root"}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between opacity-50 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <i className="bx bx-shield-quarter text-slate-300 text-xs" />
                    <span className="text-[9px] font-mono text-slate-400/80">{log.ipAddress || "0.0.0.0"}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <i className="bx bx-laptop text-slate-300 text-xs" />
                    <span className="text-[9px] font-mono text-slate-400/80 truncate max-w-[100px]">
                      {log.deviceInfo || "System"}
                    </span>
                  </div>
                </div>
                <i className="bx bx-chevron-right text-slate-200" />
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

function InspectorPanel({ profile, onClose, onUpdate }: { profile: ProfileDTO; onClose: () => void; onUpdate: () => void }) {
  const [name, setName] = useState(profile.name || "");
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/profile`, { // Corrected endpoint from `/api/personnel/${profile.id}`
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if(!res.ok) throw new Error();
      addToast({ type: 'success', message: 'Identity updated successfully' });
      onUpdate();
      onClose();
    } catch {
      addToast({ type: 'error', message: 'Failed to update identity' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div variants={panelVariants} initial="hidden" animate="visible" exit="exit" className="h-full flex flex-col w-full absolute inset-0 bg-white/95 text-left">
      <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-[#FAFAFC]/50">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-blue-500/80">Personnel Inspector</h2>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100/80 rounded-full transition-colors shrink-0">
          <i className="bx bx-x text-xl text-gray-400" />
        </button>
      </div>
      <div className="p-6 space-y-8 flex-1 overflow-y-auto">
        <div className="space-y-3">
          <label className="text-[10px] font-black text-gray-400/80 uppercase tracking-widest">Public Display Name</label>
          <input 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter full name"
            className="w-full bg-gray-50/50 border border-gray-200/50 rounded-xl px-4 py-3.5 focus:bg-white focus:border-blue-400/50 focus:ring-4 focus:ring-blue-50/30 outline-none transition-all text-sm font-bold text-gray-700/90"
          />
          <p className="text-[10px] text-gray-400/70 leading-relaxed">
            This name will be visible on invoices, sales receipts, and activity logs across the organization.
          </p>
        </div>
        
        <div className="p-4 bg-blue-50/30 rounded-2xl border border-blue-100/30">
          <h4 className="text-[10px] font-black text-blue-600/70 uppercase mb-3">System Metadata</h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-blue-500/50 font-bold uppercase tracking-wider">Internal ID</span>
              <span className="text-blue-800/80 font-mono bg-white/60 px-2 py-1 rounded border border-blue-100/50 shadow-sm">{profile.id}</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-blue-500/50 font-bold uppercase tracking-wider">Staff Code</span>
              <span className="text-blue-800/80 font-mono bg-white/60 px-2 py-1 rounded border border-blue-100/50 shadow-sm">{profile.staffCode || 'UNASSIGNED'}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-6 border-t border-gray-50 bg-gray-50/20">
        <button 
          onClick={handleSave}
          disabled={saving || name === profile.name}
          className="w-full bg-slate-800/90 text-white/90 font-black py-4 rounded-xl text-[10px] uppercase tracking-widest hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-gray-200/50 transition-all active:scale-[0.98]"
        >
          {saving ? "Processing..." : "Commit Changes"}
        </button>
      </div>
    </motion.div>
  );
}

/* ================= MAIN PAGE ================= */

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<"logs" | "inspector">("logs");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const { addToast } = useToast();

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (!res.ok) throw new Error();
      setProfile(data.profile);
    } catch {
      addToast({ type: "error", message: "Failed to sync profile data" });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const primaryBranchId = useMemo(() => 
    profile?.assignments.find(a => a.isPrimary)?.branchId || profile?.assignments[0]?.branchId || null
  , [profile]);

  if (loading || !profile) return (
    <div className="h-screen flex items-center justify-center bg-white/95">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="w-12 h-12 bg-gray-50/80 rounded-full" />
        <div className="h-2 w-24 bg-gray-50/80 rounded" />
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#F8F9FC]/80 overflow-hidden">
      
      <main className="flex-1 overflow-y-auto px-2 pb-10 no-scrollbar">
        <div className="max-w-5xl mx-auto space-y-6">
        <header className="px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between sticky top-0 bg-white/80 backdrop-blur-xl z-10 border-b border-black/[0.02] gap-4">
          <h1 className="text-2xl font-bold tracking-tight text-slate-800/90">Profile</h1>
        </header>
          
          {/* HERO SECTION */}
          <section className="bg-white/90 rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-100/50 flex items-center justify-between gap-4 overflow-hidden">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="relative shrink-0">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-slate-700/90 to-slate-800/90 flex items-center justify-center text-white/90 text-xl sm:text-2xl font-black shadow-sm">
                  {getInitials(profile.name || "Welcome")}
                </div>
                {profile.isLocked && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-red-400 border-2 border-white rounded-full flex items-center justify-center text-white">
                    <i className="bx bxs-error-circle text-[8px]" />
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-lg sm:text-2xl font-black text-gray-800/90 tracking-tight truncate">
                  {profile.name || "Personnel"}
                </h1>
                
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`px-2 py-0.5 rounded text-[8px] sm:text-[9px] font-black border uppercase tracking-wider ${getRoleStyles(profile.role)}`}>
                    {profile.role}
                  </span>
                  {profile.isOrgOwner && (
                    <span className="px-2 py-0.5 bg-amber-50/50 text-amber-600/80 text-[8px] sm:text-[9px] font-black rounded border border-amber-100/50 flex items-center gap-1 tracking-widest uppercase">
                      <i className="bx bxs-crown text-[10px]" /> OWNER
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0 whitespace-nowrap">
              {profile.isLocked ? (
                <span className="px-2 sm:px-3 py-1 bg-red-50/50 text-red-600/80 text-[8px] sm:text-[10px] font-black rounded-lg border border-red-100/50 flex items-center gap-1 tracking-widest uppercase">
                  <i className="bx bxs-error-circle" /> LOCKED
                </span>
              ) : (
                <span className={`px-2 sm:px-3 py-1 text-[8px] sm:text-[10px] font-black rounded-lg border tracking-widest uppercase ${profile.disabled ? "bg-gray-50/80 text-gray-400/80 border-gray-100/80" : "bg-emerald-50/50 text-emerald-500/80 border-emerald-100/50"}`}>
                  {profile.disabled ? "DISABLED" : "ACTIVE"}
                </span>
              )}
            </div>
          </section>

          {/* IDENTITY SECTION */}
          <section className="bg-white/90 rounded-2xl shadow-sm border border-gray-100/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50/50 bg-gray-50/20 text-left">
              <h3 className="font-black text-gray-400/70 text-[10px] tracking-[0.2em] uppercase">Identity & Contact</h3>
            </div>

            {/* Display Name Row */}
            <InfoRow 
              icon="bx-user" 
              label="Display Name" 
              value={profile.name ?? "Not Set"} 
              onEdit={() => setPanel("inspector")} 
              onCopy={() => {
                navigator.clipboard.writeText(profile.name ?? "");
                addToast({ type: "success", message: "Name copied" });
              }}
            />

            {/* Primary Email Row */}
            <InfoRow 
              icon="bx-envelope" 
              label="Primary Email" 
              value={profile.email} 
              onEdit={() => setShowEmailModal(true)}
              onCopy={() => {
                navigator.clipboard.writeText(profile.email);
                addToast({ type: "success", message: "Email copied" });
              }}
              badge={profile.pendingEmail && (
                <span className="text-[8px] px-1.5 py-0.5 bg-blue-50/80 text-blue-500/80 border border-blue-100/50 rounded-full font-black animate-pulse">
                  PENDING UPDATE
                </span>
              )}
              subValue={profile.pendingEmail ? `Updating to: ${profile.pendingEmail}` : undefined}
            />

            {/* Staff Code Row */}
            <InfoRow 
              icon="bx-barcode" 
              label="Personnel Staff Code" 
              value={profile.staffCode ?? "UNASSIGNED"} 
              onCopy={() => {
                if (profile.staffCode) {
                  navigator.clipboard.writeText(profile.staffCode);
                  addToast({ type: "success", message: "Staff code copied" });
                }
              }}
              badge={
                <span className="text-[8px] px-1.5 py-0.5 bg-slate-50/80 text-slate-400/80 border border-slate-100/80 rounded font-black uppercase tracking-tighter">
                  System ID
                </span>
              }
              subValue="Unique personnel identifier"
            />
          </section>

          {/* SECURITY SECTION */}
          <section className="bg-white/90 rounded-2xl shadow-sm border border-gray-100/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50/50 bg-gray-50/20 text-left">
              <h3 className="font-black text-gray-400/70 text-[10px] tracking-[0.2em] uppercase">Security & Verification</h3>
            </div>
            <InfoRow 
                icon="bx-shield-quarter" 
                label="Authentication" 
                value="••••••••••••" 
                onEdit={() => setShowPasswordModal(true)} 
                badge={profile.pendingPassword && <span className="text-[8px] px-1.5 py-0.5 bg-orange-50/80 text-orange-500/80 border border-orange-100/50 rounded-full font-black">APPROVAL REQ</span>}
            />
            <div className="px-6 py-5 bg-gray-50/10 grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-gray-100/50">
              <div className="flex flex-col text-left gap-1">
                <span className="text-[9px] text-gray-400/70 font-black tracking-widest uppercase">Last Login Signature</span>
                <span className="text-xs text-gray-600/90 font-bold">{formatDate(profile.lastLogin)}</span>
                <span className="text-[10px] text-gray-400/80 flex items-center gap-1">
                    <i className="bx bx-globe" /> {profile.lastLoginIp || "Unknown IP"} • {profile.lastLoginDevice || "Device"}
                </span>
              </div>
              <div className="flex flex-col text-left gap-1">
                <span className="text-[9px] text-gray-400/70 font-black tracking-widest uppercase">Latest Activity</span>
                <span className="text-xs text-gray-600/90 font-bold">{formatDate(profile.lastActivityAt)}</span>
                <span className="text-[10px] text-emerald-400/90 font-bold flex items-center gap-1 uppercase">
                    <span className="w-1.5 h-1.5 bg-emerald-400/80 rounded-full animate-ping" /> Synchronized
                </span>
              </div>
            </div>
          </section>

          {/* BRANCHES & SUPPORT */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <section className="bg-white/90 rounded-2xl shadow-sm border border-gray-100/50 overflow-hidden text-left h-full">
              <div className="px-6 py-4 border-b border-gray-50/50 bg-gray-50/20 flex justify-between items-center">
                <h3 className="font-black text-gray-400/70 text-[10px] tracking-[0.2em] uppercase">Branch Assignments</h3>
                <span className="text-[9px] font-bold text-blue-500/80 bg-blue-50/50 border border-blue-100/30 px-2 py-0.5 rounded-md">
                  {profile.assignments.length} Total
                </span>
              </div>
              <div className="divide-y divide-gray-50/50">
                {profile.assignments.map((a) => (
                  <div key={a.id} className="flex justify-between items-center px-6 py-4 hover:bg-gray-50/30 group transition-colors">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${a.isPrimary ? "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.4)]" : "bg-gray-200/80"}`} />
                      <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-gray-800/90 truncate">{a.branchName}</span>
                              {a.isPrimary && <span className="text-[8px] font-black text-blue-500/80 uppercase tracking-tighter">Primary</span>}
                          </div>
                          <span className="text-[11px] text-gray-400/80 flex items-center gap-1 mt-0.5 truncate">
                              <i className="bx bx-map-pin" /> {a.branchLocation || "Remote"}
                          </span>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-[9px] font-black tracking-widest border shrink-0 ${getRoleStyles(a.role)}`}>
                      {a.role}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white/90 rounded-2xl shadow-sm border border-gray-100/50 overflow-hidden h-fit">
                <ContactForm 
                  user={{
                    id: profile.id,
                    organizationId: profile.organization.id,
                    branchId: primaryBranchId,
                    isAdmin: profile.role === "ADMIN" || profile.role === "DEV"
                  }}
                  onSuccess={() => addToast({ type: "success", message: "Support protocol initiated." })}
                  onCancel={() => {}}
                />
            </section>
          </div>
        </div>
      </main>

      {/* SIDEBAR PANEL */}
      <aside className="hidden lg:flex w-[340px] h-full bg-white/95 border-l border-black/[0.02] flex-col shadow-[-10px_0_20px_rgba(0,0,0,0.01)] z-20 shrink-0 relative">
        <AnimatePresence mode="wait">
          {panel === "logs" ? (
            <ActivityLogsPanel key="logs" logs={profile.activityLogs} />
          ) : (
            <InspectorPanel key="inspector" profile={profile} onClose={() => setPanel("logs")} onUpdate={loadProfile} />
          )}
        </AnimatePresence>
      </aside>

      {/* MODALS */}
      <EmailChangeModal 
        isOpen={showEmailModal} 
        onClose={() => setShowEmailModal(false)} 
        personnelId={profile.id}
        organizationId={profile.organization.id}
        branchId={primaryBranchId}
      />

      <PasswordChangeModal 
        isOpen={showPasswordModal} 
        onClose={() => setShowPasswordModal(false)} 
        personnelId={profile.id}
        organizationId={profile.organization.id}
        branchId={primaryBranchId}
      />
    </div>
  );
}