"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Role } from "@prisma/client";
import { useToast } from "@/components/feedback/ToastProvider";

/* ================= TYPES ================= */

interface BranchAssignment {
  branchId: string;
  role: Role;
  isPrimary: boolean;
  branch: { id: string; name: string; };
}

interface Personnel {
  id: string;
  name: string;
  email: string;
  staffCode: string | null;
  role: Role;
  disabled: boolean;
  isLocked: boolean;
  lockReason: string | null;
  isOrgOwner: boolean;
  lastActivityAt: string | null;
  branchId: string | null;
  branch?: { name: string };
  branchAssignments: BranchAssignment[];
}

interface Summary {
  total: number;
  active: number;
  disabled: number;
  locked: number;
  [key: string]: number; 
}

interface ActivityLog {
  id: string;
  action: string;
  personnelName?: string;
  performedBy?: string;
  personnel?: { name: string; email: string };
  createdAt: string | Date;
  time?: string;
  details?: string;
  metadata?: Record<string, unknown>;
  critical: boolean;
}

interface ProvisionPayload {
  name: string;
  email: string;
  role: Role;
  branchId: string;
}

interface UpdatePayload extends Partial<Personnel> {
  action?: string;
}

interface DetailsPanelProps {
  personnel: Personnel;
  onClose: () => void;
  onUpdate: (id: string, updates: UpdatePayload) => Promise<Personnel | void>;
  viewerCanResendOTP: boolean;
}

interface ProvisionPanelProps {
  onClose: () => void;
  onCreate: (data: ProvisionPayload) => Promise<void>;
  branches: { id: string; name: string }[];
}

/* ================= MAIN COMPONENT ================= */

export default function PersonnelMissionControl() {
  const [personnels, setPersonnels] = useState<Personnel[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "active" | "locked" | "disabled">("all");
  const [selectedPersonnel, setSelectedPersonnel] = useState<Personnel | null>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  // Mocked for client context - replace with actual session hook
  const isViewerAdminOrOwner = true; 

  const fetchPersonnels = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        status: activeTab !== "all" ? activeTab : "",
      });
      const res = await fetch(`/api/personnels?${params.toString()}`);
      const result = await res.json();

      if (res.ok) {
        setPersonnels(result.data);
        setSummary(result.summary);
        setActivityLogs(result.recentLogs || []);
        setBranches(result.branchSummaries || []);
      }
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [search, activeTab]);

  useEffect(() => {
    const timer = setTimeout(fetchPersonnels, 300);
    return () => clearTimeout(timer);
  }, [fetchPersonnels]);

  const handleUpdate = async (id: string, updates: UpdatePayload) => {
    try {
      const res = await fetch(`/api/personnels`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updates, id }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Update failed");

      setPersonnels((prev) => prev.map((p) => (p.id === id ? { ...p, ...result } : p)));
      if (selectedPersonnel?.id === id) setSelectedPersonnel((prev) => ({ ...prev!, ...result }));
      
      fetchPersonnels();
      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      addToast({ type: "error", title: "Action Denied", message: msg });
      throw error;
    }
  };

  const handleCreate = async (newStaff: ProvisionPayload) => {
    try {
      const res = await fetch("/api/personnels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newStaff),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Provisioning failed");

      addToast({ type: "success", title: "Staff Provisioned", message: `${result.name} added. OTP sent to email.` });
      setIsProvisioning(false);
      fetchPersonnels();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      addToast({ type: "error", title: "Provisioning Error", message: msg });
      throw error;
    }
  };

  const handleExport = (type: "CSV" | "PDF") => {
    addToast({ type: "success", title: "Export Started", message: `Generating ${type} audit report...` });
  };

  const openDetails = (p: Personnel) => {
    setIsProvisioning(false);
    setSelectedPersonnel(prev => (prev?.id === p.id ? null : p));
  };

  return (
    <div className="flex h-screen bg-[#F2F2F7] overflow-hidden text-[#1d1d1f] font-sans">
      <main className="flex-1 flex flex-col min-w-0 bg-white relative">
        <header className="px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between sticky top-0 bg-white/90 backdrop-blur-xl z-10 border-b border-black/5 gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Personnels</h1>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="relative group flex-1 sm:flex-none">
              <i className="bx bx-search absolute left-4 top-1/2 -translate-y-1/2 text-black/30 text-lg group-focus-within:text-blue-500 transition-colors" />
              <input 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or staff code..." 
                className="pl-11 pr-4 py-2.5 bg-[#F2F2F7] border-transparent rounded-2xl text-sm w-full sm:w-72 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all outline-none font-medium"
              />
            </div>
            <button 
              onClick={() => { setSelectedPersonnel(null); setIsProvisioning(true); }}
              className={`h-10 px-5 rounded-2xl text-xs font-bold shadow-lg transition-all whitespace-nowrap ${isProvisioning ? "bg-blue-600 text-white shadow-blue-500/20" : "bg-slate-900 text-white hover:bg-blue-600 shadow-black/10"}`}
            >
              + Provision Staff
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="w-10 h-10 flex items-center justify-center rounded-2xl border border-black/10 hover:bg-[#F2F2F7] transition-all shrink-0">
              <i className="bx bx-cog text-xl text-black/60" />
            </button>
          </div>
        </header>

        <div className="px-8 pt-4 flex flex-wrap justify-between items-end border-b border-black/5 bg-white/50 relative z-0 gap-4">
          <div className="flex gap-6 overflow-x-auto no-scrollbar">
            {(["all", "active", "locked", "disabled"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-[11px] font-black uppercase tracking-widest pb-3 transition-all relative flex items-center gap-2 whitespace-nowrap ${activeTab === tab ? "text-blue-600" : "text-black/30 hover:text-black/60"}`}
              >
                {tab}
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-black ${activeTab === tab ? "bg-blue-600 text-white" : "bg-black/5 text-black/40"}`}>
                  {tab === "all" ? summary?.total || 0 : summary?.[tab] || 0}
                </span>
                {activeTab === tab && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />}
              </button>
            ))}
          </div>
          <div className="flex gap-4 pb-3">
            <button onClick={() => handleExport("CSV")} className="text-[10px] font-black uppercase tracking-widest text-black/30 hover:text-slate-900 flex items-center gap-1.5 transition-colors"><i className="bx bx-export text-sm" /> CSV</button>
            <button onClick={() => handleExport("PDF")} className="text-[10px] font-black uppercase tracking-widest text-black/30 hover:text-red-600 flex items-center gap-1.5 transition-colors"><i className="bx bxs-file-pdf text-sm" /> PDF</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-8 pt-6 custom-scrollbar bg-[#FAFAFC]">
          {loading ? (
            <div className="flex items-center justify-center h-full text-black/10 font-black uppercase text-2xl tracking-widest">Loading...</div>
          ) : (
            <div className="flex flex-col gap-3 max-w-5xl mx-auto pb-10"> 
              <AnimatePresence mode="popLayout">
                {personnels.map((p) => (
                  <PersonnelCard key={p.id} personnel={p} isSelected={selectedPersonnel?.id === p.id} onClick={() => openDetails(p)} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      <aside className="hidden lg:flex w-[340px] h-full  bg-white border-l border-black/5 flex-col shadow-[-10px_0_20px_rgba(0,0,0,0.02)] z-20 shrink-0 relative">
        <AnimatePresence mode="wait">
          {isProvisioning ? (
            <ProvisionPanel key="provision" onClose={() => setIsProvisioning(false)} onCreate={handleCreate} branches={branches} />
          ) : selectedPersonnel ? (
            <DetailsPanel key="details" personnel={selectedPersonnel} onClose={() => setSelectedPersonnel(null)} onUpdate={handleUpdate} viewerCanResendOTP={isViewerAdminOrOwner} />
          ) : (
            <ActivityLogsPanel key="logs" logs={activityLogs} />
          )}
        </AnimatePresence>
      </aside>

      <AnimatePresence>{isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}</AnimatePresence>
    </div>
  );
}

/* ================= SUB-COMPONENTS ================= */

function PersonnelCard({ personnel, isSelected, onClick }: { personnel: Personnel, isSelected: boolean, onClick: () => void }) {
  const { addToast } = useToast();
  const status = personnel.isLocked ? "locked" : personnel.disabled ? "disabled" : "active";

  const copyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if(personnel.staffCode) {
      navigator.clipboard.writeText(personnel.staffCode);
      addToast({ type: "success", title: "Copied", message: "Staff code copied to clipboard." });
    }
  };

  return (
    <motion.div
      layoutId={`person-${personnel.id}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      onClick={onClick}
      className={`group w-full bg-white rounded-2xl p-4 sm:p-5 transition-all cursor-pointer border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
        isSelected ? "border-blue-500 shadow-lg shadow-blue-500/5 bg-blue-50/30" : "border-black/[0.04] hover:border-blue-500/20 hover:shadow-md"
      }`}
    >
      <div className="flex items-center gap-4 flex-1">
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white font-bold text-base sm:text-lg shrink-0 transition-colors ${isSelected ? "bg-blue-600" : "bg-slate-900"}`}>
          {personnel.name?.charAt(0) || "U"}
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-sm sm:text-[15px] text-slate-900 truncate group-hover:text-blue-600 transition-colors">
            {personnel.name || "Unknown User"}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-[10px] text-black/40 font-black uppercase tracking-widest truncate">{personnel.staffCode || "NO-CODE"}</p>
            {personnel.staffCode && <button onClick={copyCode} className="text-black/20 hover:text-blue-600"><i className="bx bx-copy text-[10px]" /></button>}
          </div>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-8 flex-1">
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase text-black/30 tracking-tighter">Role</span>
          <RoleBadge role={personnel.role} isOwner={personnel.isOrgOwner} />
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase text-black/30 tracking-tighter">Primary Branch</span>
          <span className="text-xs font-bold text-slate-600 truncate max-w-[120px] mt-0.5">
            {personnel.branch?.name || "Unassigned"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-none pt-3 sm:pt-0">
        <div className="flex items-center gap-3">
          <span className="sm:hidden text-[10px] font-bold text-black/30">Status:</span>
          <StatusBadge status={status} />
        </div>
        <i className={`bx bx-chevron-right text-xl transition-transform ${isSelected ? "translate-x-1 text-blue-500" : "text-black/20 group-hover:translate-x-1"}`} />
      </div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: "active" | "locked" | "disabled" }) {
  const styles = {
    active: "bg-emerald-50 text-emerald-600 border-emerald-100",
    locked: "bg-amber-50 text-amber-600 border-amber-200",
    disabled: "bg-[#F2F2F7] text-black/40 border-black/10",
  };
  return (
    <span className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${styles[status]}`}>
      {status}
    </span>
  );
}

function RoleBadge({ role, isOwner }: { role: string, isOwner: boolean }) {
  return (
    <div className="flex gap-1.5 mt-0.5">
      {isOwner && <span className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded-md text-[9px] font-black uppercase tracking-widest">Owner</span>}
      <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[9px] font-black uppercase tracking-widest">{role}</span>
    </div>
  );
}

/* ================= SIDE PANELS ================= */

const panelVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.2, ease: "easeOut" } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.15, ease: "easeIn" } }
};

function LogFilter({ onFilterChange }: { onFilterChange: (action: string) => void }) {
  const actions = ["ALL_ACTIONS", "PROVISION", "SECURITY", "UPDATE", "ACCOUNT_LOCKED"];
  const [active, setActive] = useState("ALL_ACTIONS");

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
      <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
      {actions.map(a => (
        <button
          key={a}
          onClick={() => { setActive(a); onFilterChange(a); }}
          className={`shrink-0 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-tighter transition-all border ${
            active === a ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white text-black/40 border-black/5 hover:border-black/20"
          }`}
        >
          {a.replace(/_/g, " ")}
        </button>
      ))}
    </div>
  );
}

function ActivityLogsPanel({ logs }: { logs: ActivityLog[] }) {
  const [filter, setFilter] = useState("ALL_ACTIONS");
  const filteredLogs = filter === "ALL_ACTIONS" ? logs : logs.filter(l => l.action.includes(filter) || (filter === "SECURITY" && (l.action.includes("LOCK") || l.action.includes("ACCESS"))));

  return (
    <motion.div variants={panelVariants} initial="hidden" animate="visible" exit="exit" className="h-full flex flex-col w-full absolute inset-0 bg-white">
      <div className="p-6 border-b border-black/5 bg-[#FAFAFC] space-y-4">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-black/50 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" /> Live_Audit_Trail
        </h2>
        <LogFilter onFilterChange={setFilter} />
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-[#FAFAFC]">
        {(!filteredLogs || filteredLogs.length === 0) && (
          <div className="flex flex-col items-center justify-center h-40 text-center space-y-2">
            <i className="bx bx-receipt text-3xl text-black/10" />
            <p className="text-[10px] font-bold text-black/30 tracking-widest uppercase">No Records Found</p>
          </div>
        )}

        {filteredLogs.map((log) => {
          const performerName = log.personnel?.name ?? "System";
          const targetName = log.personnelName ?? (log.metadata?.targetName as string) ?? "N/A";

          return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={log.id} className="p-4 bg-white border border-black/[0.04] rounded-2xl shadow-sm hover:border-blue-500/20 hover:shadow-md transition-all relative overflow-hidden group">
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${log.critical ? 'bg-amber-400' : 'bg-blue-500'} opacity-50 group-hover:opacity-100 transition-opacity`} />
              <div className="pl-1">
                <div className="flex justify-between items-center mb-3 border-b border-black/5 pb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${log.critical ? 'bg-amber-600' : 'bg-blue-600'}`}>
                      {performerName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[10px] font-bold text-slate-800">{performerName}</span>
                  </div>
                  <span className="text-[9px] font-black tracking-widest uppercase text-black/30">
                    {log.time ?? new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div>
                  <span className={`inline-block mb-1.5 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${log.critical ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>
                    {log.action.replace(/_/g, " ")}
                  </span>
                  <p className="text-xs font-medium text-slate-600 leading-relaxed mb-1">{(log.details || log.metadata?.details) as string || "Audit entry recorded."}</p>
                  <p className="text-[10px] font-bold text-black/40">Target: <span className="text-slate-800">{targetName}</span></p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

function DetailsPanel({ personnel, onClose, onUpdate, viewerCanResendOTP }: DetailsPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { addToast } = useToast();
  
  const [form, setForm] = useState({ name: personnel.name, email: personnel.email, role: personnel.role });

  const isPrivileged = personnel.role === Role.ADMIN || personnel.isOrgOwner;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    addToast({ type: "success", title: "Copied", message: "Saved to clipboard." });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate(personnel.id, { name: form.name, email: form.email, role: form.role });
      addToast({ type: "success", title: "Saved", message: "Profile updated successfully." });
      setIsEditing(false);
    } finally { setIsSaving(false); }
  };

  const toggleSecurity = async (key: keyof UpdatePayload, val: boolean) => {
    await onUpdate(personnel.id, { [key]: val });
    addToast({ type: "success", title: "Security Updated", message: `Account status changed.` });
  };

  const handleResendOTP = async () => {
    try {
      await onUpdate(personnel.id, { action: "RESEND_OTP" }); 
      addToast({ type: "success", title: "Token Sent", message: "A new verification OTP has been emailed." });
    } catch (err) {
      // Error handled in handleUpdate
    }
  };

  return (
    <motion.div variants={panelVariants} initial="hidden" animate="visible" exit="exit" className="h-full flex flex-col w-full absolute inset-0 bg-white z-10 border-l border-black/5">
      <div className="p-6 border-b border-black/5 flex justify-between items-center sticky top-0 bg-white z-10">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-black/40">Inspector_v2</h2>
        <div className="flex gap-2">
          {!isEditing && <button onClick={() => setIsEditing(true)} className="h-8 px-3 rounded-full bg-[#F2F2F7] text-[9px] font-black uppercase transition-colors hover:bg-blue-600 hover:text-white"><i className="bx bx-pencil mr-1"/> Edit</button>}
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 transition-colors flex items-center justify-center"><i className="bx bx-x text-lg" /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-8">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-3xl bg-slate-900 text-white flex items-center justify-center text-3xl font-black shadow-xl shrink-0">
            {personnel.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <h3 className="text-2xl font-black text-slate-900 truncate leading-tight">{personnel.name}</h3>
            <div className="flex flex-col gap-1 mt-1.5">
              <RoleBadge role={personnel.role} isOwner={personnel.isOrgOwner} />
              <span className="text-[9px] font-black text-black/30 uppercase tracking-widest mt-0.5 truncate">
                Last Seen: {personnel.lastActivityAt ? new Date(personnel.lastActivityAt).toLocaleString() : "Never Active"}
              </span>
            </div>
          </div>
        </div>

        <section className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase text-black/40 pl-1">Full Name</label>
            <input 
              readOnly={!isEditing} 
              value={form.name} 
              onChange={e => setForm({...form, name: e.target.value})} 
              className={`w-full px-4 py-3.5 rounded-2xl text-sm font-bold outline-none transition-all ${isEditing ? "bg-[#F2F2F7] focus:bg-white ring-2 ring-blue-500/10" : "bg-transparent cursor-default"}`} 
            />
          </div>
          <div className="space-y-1.5 group">
            <label className="text-[9px] font-black uppercase text-black/40 pl-1 flex justify-between items-center">
              Email Address
              {!isEditing && <button onClick={() => handleCopy(form.email)} className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-600 hover:text-blue-800"><i className="bx bx-copy" /> Copy</button>}
            </label>
            <input 
              readOnly={!isEditing} 
              value={form.email} 
              onChange={e => setForm({...form, email: e.target.value})} 
              className={`w-full px-4 py-3.5 rounded-2xl text-sm font-bold outline-none transition-all ${isEditing ? "bg-[#F2F2F7] focus:bg-white ring-2 ring-blue-500/10" : "bg-transparent cursor-default"}`} 
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 group">
              <label className="text-[9px] font-black uppercase text-black/40 pl-1 flex justify-between items-center">
                Staff Code
                {personnel.staffCode && <button onClick={() => handleCopy(personnel.staffCode!)} className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-600 hover:text-blue-800"><i className="bx bx-copy" /> Copy</button>}
              </label>
              <div className="px-4 py-3.5 bg-black/5 rounded-2xl text-xs font-mono font-bold text-black/40 truncate">{personnel.staffCode || "PENDING"}</div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase text-black/40 pl-1">Role</label>
              <select 
                disabled={!isEditing} 
                value={form.role} 
                onChange={e => setForm({...form, role: e.target.value as Role})} 
                className={`w-full px-4 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none transition-all ${isEditing ? "bg-[#F2F2F7] cursor-pointer" : "bg-transparent appearance-none cursor-default"}`}
              >
                {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {isEditing && (
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} disabled={isSaving} className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all">
                {isSaving ? "Syncing..." : "Apply Changes"}
              </button>
              <button onClick={() => setIsEditing(false)} className="flex-1 py-4 bg-[#F2F2F7] text-slate-600 rounded-2xl text-[10px] font-black uppercase hover:bg-black/5 transition-all">Cancel</button>
            </div>
          )}
        </section>

        <section className="pt-6 border-t border-black/5">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-black/30 mb-4">Access_Security</h4>
          
          {viewerCanResendOTP && !personnel.lastActivityAt && (
             <button onClick={handleResendOTP} className="w-full py-3.5 mb-3 bg-blue-50 text-blue-600 border border-blue-100 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-colors flex items-center justify-center gap-2">
               <i className="bx bx-mail-send text-sm" /> Resend Verification OTP
             </button>
          )}

          {isPrivileged ? (
            <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl text-[9px] font-black uppercase tracking-widest border border-amber-100 flex items-center gap-3">
              <i className="bx bx-shield-quarter text-lg" /> Privileged account cannot be restricted.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => toggleSecurity("isLocked", !personnel.isLocked)}
                className={`py-4 rounded-2xl text-[10px] font-black uppercase transition-all ${personnel.isLocked ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100"}`}
              >
                {personnel.isLocked ? "Unlock Access" : "Lock Account"}
              </button>
              <button 
                onClick={() => toggleSecurity("disabled", !personnel.disabled)}
                className={`py-4 rounded-2xl text-[10px] font-black uppercase transition-all ${personnel.disabled ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100"}`}
              >
                {personnel.disabled ? "Enable Account" : "Disable Account"}
              </button>
            </div>
          )}
        </section>
      </div>
    </motion.div>
  );
}

function ProvisionPanel({ onClose, onCreate, branches }: ProvisionPanelProps) {
  const [form, setForm] = useState<ProvisionPayload>({ name: "", email: "", role: Role.CASHIER, branchId: "" });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.branchId || !form.name || !form.email) return alert("Please fill all required fields.");
    setIsSaving(true);
    try { await onCreate(form); } finally { setIsSaving(false); }
  };

  return (
    <motion.div variants={panelVariants} initial="hidden" animate="visible" exit="exit" className="h-full flex flex-col w-full absolute inset-0 bg-white z-20 border-l border-black/5">
      <div className="p-6 border-b border-black/5 flex justify-between items-center sticky top-0 bg-white z-10">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-blue-600 flex items-center gap-2">
          <i className="bx bx-user-plus text-sm" /> Provision_New_Staff
        </h2>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 transition-colors flex items-center justify-center"><i className="bx bx-x text-lg" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
        <div className="p-4 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100 flex gap-3">
          <i className="bx bx-shield-check text-xl shrink-0" />
          <p className="text-[10px] font-bold leading-relaxed">
            Password generation is fully automated. Upon creation, a secure verification token (OTP) will be sent to the user's email for their first login.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase text-black/40 pl-1">Full Name</label>
            <input placeholder="Ex: John Doe" onChange={e => setForm({...form, name: e.target.value})} className="w-full px-4 py-4 bg-[#F2F2F7] rounded-2xl text-sm font-bold focus:bg-white ring-blue-500/10 focus:ring-4 outline-none transition-all" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase text-black/40 pl-1">Email Address</label>
            <input placeholder="john@company.com" onChange={e => setForm({...form, email: e.target.value})} className="w-full px-4 py-4 bg-[#F2F2F7] rounded-2xl text-sm font-bold focus:bg-white ring-blue-500/10 focus:ring-4 outline-none transition-all" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase text-black/40 pl-1">System Role</label>
              <select onChange={e => setForm({...form, role: e.target.value as Role})} className="w-full px-4 py-4 bg-[#F2F2F7] rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer">
                {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase text-black/40 pl-1">Branch Link</label>
              <select onChange={e => setForm({...form, branchId: e.target.value})} className="w-full px-4 py-4 bg-[#F2F2F7] rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer">
                <option value="">Select Branch</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-black/5 bg-[#FAFAFC]">
        <button onClick={handleSubmit} disabled={isSaving} className="w-full py-5 bg-blue-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
          {isSaving ? "Provisioning..." : "Initialize Account"}
        </button>
      </div>
    </motion.div>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-[40px] w-full max-w-lg p-10 text-center shadow-2xl">
        <i className="bx bx-shield-quarter text-5xl text-blue-600 mb-4" />
        <h2 className="text-3xl font-black tracking-tighter mb-3">Security Policies</h2>
        <p className="text-black/40 font-medium mb-8 text-sm">Global configurations for automated lockouts, password rotation, and MFA enforcement are configured at the backend.</p>
        <button onClick={onClose} className="px-10 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-600 transition-colors">Close</button>
      </div>
    </motion.div>
  );
}