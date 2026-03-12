"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Role } from "@prisma/client";
import { useToast } from "@/components/feedback/ToastProvider";

/* ================= TYPES ================= */

interface BranchAssignment {
  branchId: string;
  role: Role;
  branch: { name: string };
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
}

interface ActivityLog {
  id: string;
  action: string;
  personnelName: string;
  performedBy: string;
  time: string;
  details: string;
  critical: boolean;
}

/* ================= MAIN COMPONENT ================= */

export default function PersonnelMissionControl() {
  const [personnels, setPersonnels] = useState<Personnel[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  
  // UI State
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "active" | "locked" | "disabled">("all");
  
  // Side Panel State Management
  const [selectedPersonnel, setSelectedPersonnel] = useState<Personnel | null>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Activity Logs
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  /* -------------------------------------------------------
     DATA FETCHING
  ------------------------------------------------------- */
  
  const fetchPersonnels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/personnels?${new URLSearchParams({
        search,
        status: activeTab !== "all" ? activeTab : "",
      }).toString()}`);
      
      const result = await res.json();
      
      if (res.ok) {
        setPersonnels(result.data);
        setSummary(result.summary);
        if (result.recentLogs) {
          setActivityLogs(result.recentLogs);
        }
      }
    } catch (error) {
      console.error("Failed to fetch personnels", error);
    } finally {
      setLoading(false);
    }
  }, [search, activeTab]);

  useEffect(() => {
    const debounceTimer = setTimeout(fetchPersonnels, 300);
    return () => clearTimeout(debounceTimer);
  }, [fetchPersonnels]);

  /* -------------------------------------------------------
     ACTION HANDLERS
  ------------------------------------------------------- */

  const handleUpdate = async (id: string, updates: Partial<Personnel>) => {
    try {
      const res = await fetch(`/api/personnels/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error("Failed to update");

      const updatedData: Personnel = await res.json();

      setPersonnels((prev) => prev.map((p) => (p.id === id ? { ...p, ...updatedData } : p)));

      if (selectedPersonnel?.id === id) {
        setSelectedPersonnel((prev) => (prev ? { ...prev, ...updatedData } : null));
      }

      fetchPersonnels(); 

      setActivityLogs((prev) => [
        {
          id: Date.now().toString(),
          action: updates.isLocked !== undefined ? "SECURITY_LOCK_TOGGLE" : updates.disabled !== undefined ? "ACCESS_TOGGLE" : "PROFILE_UPDATE",
          personnelName: updatedData.name,
          performedBy: "Current Admin", // Replace with actual user session data
          time: "Just Now",
          details: updates.isLocked !== undefined 
            ? `Account ${updates.isLocked ? "locked" : "unlocked"} manually.` 
            : updates.disabled !== undefined
            ? `Access ${updates.disabled ? "disabled" : "enabled"} for this user.`
            : "Profile information updated.",
          critical: updatedData.isLocked || updatedData.disabled,
        },
        ...prev,
      ]);
    } catch (error) {
      console.error("Update Error:", error);
      alert("Failed to update personnel data.");
    }
  };

  const handleCreate = async (newStaff: Partial<Personnel>) => {
    try {
      const res = await fetch("/api/personnels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newStaff,
          password: "TemporaryPassword123!", 
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Provisioning failed");
      }

      const created: Personnel = await res.json();

      setPersonnels((prev) => [created, ...prev]);
      setIsProvisioning(false);
      fetchPersonnels(); 

      setActivityLogs((prev) => [
        {
          id: Date.now().toString(),
          action: "STAFF_PROVISIONED",
          personnelName: created.name,
          performedBy: "Current Admin", // Replace with actual user session data
          time: "Just Now",
          details: `Provisioned with role: ${created.role}`,
          critical: false,
        },
        ...prev,
      ]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to provision staff.");
    }
  };

  /* -------------------------------------------------------
     PANEL ROUTING LOGIC
  ------------------------------------------------------- */
  
  const openProvisioning = () => {
    setSelectedPersonnel(null);
    setIsProvisioning(true);
  };

  const openDetails = (p: Personnel) => {
    setIsProvisioning(false);

    setSelectedPersonnel((prev) => {
      if (prev?.id === p.id) {
        return null; 
      }
      return p; 
    });
  };

  const closePanels = () => {
    setIsProvisioning(false);
    setSelectedPersonnel(null);
  };

  return (
    <div className="flex h-screen bg-[#F2F2F7] overflow-hidden text-[#1d1d1f] font-sans">
      
      {/* 1. MAIN PANEL */}
      <main className="flex-1 flex flex-col min-w-0 bg-white relative">
        <header className="px-4 py-2 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-xl z-10 border-b border-black/5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Personnels</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group">
              <i className="bx bx-search absolute left-4 top-1/2 -translate-y-1/2 text-black/30 text-lg group-focus-within:text-blue-500 transition-colors" />
              <input 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or staff code..." 
                className="pl-11 pr-4 py-2.5 bg-[#F2F2F7] border-transparent rounded-2xl text-sm w-72 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/20 transition-all outline-none font-medium"
              />
            </div>
            <button 
              onClick={openProvisioning}
              className={`h-10 px-5 rounded-2xl text-xs font-bold shadow-lg transition-all ${isProvisioning ? "bg-blue-600 text-white shadow-blue-500/20" : "bg-slate-900 text-white shadow-black/10 hover:bg-blue-600"}`}
            >
              + Provision Staff
            </button>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="w-10 h-10 flex items-center justify-center rounded-2xl border border-black/10 hover:bg-[#F2F2F7] transition-all"
            >
              <i className="bx bx-cog text-xl text-black/60" />
            </button>
          </div>
        </header>

        {/* FILTERS & EXPORT */}
        <div className="px-8 pt-4 flex justify-between items-end border-b border-black/5 bg-white/50 relative z-0">
          <div className="flex gap-8">
            {(["all", "active", "locked", "disabled"] as const).map((tab) => {
              const count = tab === "all" ? summary?.total || 0 : summary?.[tab] || 0;

              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`text-[11px] font-black uppercase tracking-widest pb-3 transition-all relative flex items-center gap-2 ${
                    activeTab === tab ? "text-blue-600" : "text-black/30 hover:text-black/60"
                  }`}
                >
                  {tab}
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-black ${
                      activeTab === tab ? "bg-blue-600 text-white" : "bg-black/5 text-black/40"
                    }`}
                  >
                    {count}
                  </span>
                  {activeTab === tab && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex gap-4 pb-3">
            <button className="text-[10px] font-black uppercase tracking-widest text-black/30 hover:text-slate-900 flex items-center gap-1.5 transition-colors">
              <i className="bx bx-export text-sm" /> Export CSV
            </button>
            <button className="text-[10px] font-black uppercase tracking-widest text-black/30 hover:text-red-600 flex items-center gap-1.5 transition-colors">
              <i className="bx bxs-file-pdf text-sm" /> Export PDF
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-8 pt-4 custom-scrollbar bg-[#FAFAFC]">
          {loading ? (
            <div className="flex items-center justify-center h-full text-black/20 font-black uppercase tracking-tighter text-4xl">
              Loading...
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-w-5xl mx-auto"> 
              <AnimatePresence mode="popLayout">
                {personnels.map((p) => (
                  <PersonnelCard 
                    key={p.id} 
                    personnel={p} 
                    isSelected={selectedPersonnel?.id === p.id}
                    onClick={() => openDetails(p)} 
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      {/* 2. DYNAMIC SIDE PANEL */}
      <aside className="w-[340px] h-full bg-white border-l border-black/5 flex flex-col shadow-[-10px_0_20px_rgba(0,0,0,0.02)] z-20 flex-shrink-0 relative">
        <AnimatePresence mode="wait">
          {isProvisioning ? (
            <ProvisionPanel key="provision" onClose={closePanels} onCreate={handleCreate} />
          ) : selectedPersonnel ? (
            <DetailsPanel key="details" personnel={selectedPersonnel} onClose={closePanels} onUpdate={handleUpdate} />
          ) : (
            <ActivityLogsPanel key="logs" logs={activityLogs} />
          )}
        </AnimatePresence>
      </aside>

      {/* 3. SETTINGS MODAL */}
      <AnimatePresence>
        {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}

/* ================= SUB-COMPONENTS ================= */

function PersonnelCard({ personnel, isSelected, onClick }: { personnel: Personnel, isSelected: boolean, onClick: () => void }) {
  const status = personnel.isLocked ? "locked" : personnel.disabled ? "disabled" : "active";
  
  return (
    <motion.div
      layoutId={`person-${personnel.id}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      onClick={onClick}
      className={`group w-full bg-white rounded-2xl p-4 sm:p-5 transition-all cursor-pointer border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
        isSelected 
          ? "border-blue-500 shadow-lg shadow-blue-500/5 bg-blue-50/30" 
          : "border-black/[0.04] hover:border-blue-500/20 hover:shadow-md"
      }`}
    >
      <div className="flex items-center gap-4 flex-1">
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white font-bold text-base sm:text-lg shrink-0 transition-colors ${
          isSelected ? "bg-blue-600" : "bg-slate-900"
        }`}>
          {personnel.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-sm sm:text-[15px] text-slate-900 truncate group-hover:text-blue-600 transition-colors">
            {personnel.name}
          </h3>
          <p className="text-[10px] text-black/40 font-black uppercase tracking-widest truncate">
            {personnel.staffCode || "NO-CODE"}
          </p>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-8 flex-1">
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase text-black/30 tracking-tighter">Role</span>
          <RoleBadge role={personnel.role} isOwner={personnel.isOrgOwner} />
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase text-black/30 tracking-tighter">Primary Branch</span>
          <span className="text-xs font-bold text-slate-600 truncate max-w-[120px]">
            {personnel.branch?.name || "Unassigned"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-none pt-3 sm:pt-0">
        <div className="flex items-center gap-3">
          <span className="sm:hidden text-[10px] font-bold text-black/30">Status:</span>
          <StatusBadge status={status} />
        </div>
        <i className={`bx bx-chevron-right text-xl transition-transform ${
          isSelected ? "translate-x-1 text-blue-500" : "text-black/20 group-hover:translate-x-1"
        }`} />
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
    <div className="flex gap-1.5">
      {isOwner && (
        <span className="px-2 py-1 bg-purple-50 text-purple-600 rounded-md text-[9px] font-black uppercase tracking-widest">Owner</span>
      )}
      <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-md text-[9px] font-black uppercase tracking-widest">{role}</span>
    </div>
  );
}

/* ================= SIDE PANELS ================= */

const panelVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.2, ease: "easeOut" } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.15, ease: "easeIn" } }
};

function ActivityLogsPanel({ logs }: { logs: ActivityLog[] }) {
  return (
    <motion.div 
      variants={panelVariants} 
      initial="hidden" 
      animate="visible" 
      exit="exit" 
      className="h-full flex flex-col w-full absolute inset-0 bg-white"
    >
      <div className="p-6 border-b border-black/5 bg-[#FAFAFC]">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-black/50 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
          Live_Activity_Logs
        </h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-[#FAFAFC]">
        {(!logs || logs.length === 0) && (
          <div className="flex flex-col items-center justify-center h-40 text-center space-y-2">
            <i className="bx bx-receipt text-3xl text-black/10" />
            <p className="text-[10px] font-bold text-black/30 tracking-widest uppercase">No Logs in Session</p>
          </div>
        )}
        
        {logs.map((log) => {
          // Defensive variable extraction
          const performerName = log.personnel?.name ?? "System";
          const targetName = log.personnelName ?? "N/A";
          
          return (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }} 
              key={log.id} 
              className="p-4 bg-white border border-black/[0.04] rounded-2xl shadow-sm hover:border-blue-500/20 hover:shadow-md transition-all relative overflow-hidden group"
            >
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
                  <p className="text-xs font-medium text-slate-600 leading-relaxed mb-1">
                    {log.details ?? "No details provided"}
                  </p>
                  <p className="text-[10px] font-bold text-black/40">
                    Target: <span className="text-slate-800">{targetName}</span>
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

interface DetailsPanelProps {
  personnel: Personnel;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Personnel>) => Promise<void>;
}

interface DetailsPanelProps {
  personnel: Personnel;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Personnel>) => Promise<void>;
}

function DetailsPanel({ personnel, onClose, onUpdate }: DetailsPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { addToast } = useToast();

  const [form, setForm] = useState({
    name: personnel.name,
    email: personnel.email,
    staffCode: personnel.staffCode || "",
  });

  // Keep form in sync when the active personnel changes
  useEffect(() => {
    setForm({
      name: personnel.name,
      email: personnel.email,
      staffCode: personnel.staffCode || "",
    });
  }, [personnel]);

  const handleSave = async () => {
    if (form.staffCode && !/^STF-\d{3}$/.test(form.staffCode.toUpperCase())) {
      addToast({
        type: "error",
        title: "Validation Error",
        message: "Staff code must follow 'STF-XXX' format (e.g., STF-001).",
      });
      return;
    }

    setIsSaving(true);
    try {
      await onUpdate(personnel.id, {
        ...form,
        staffCode: form.staffCode.toUpperCase(),
      });
      addToast({
        type: "success",
        title: "Update Successful",
        message: `${form.name}'s profile has been updated.`,
      });
      setIsEditing(false);
    } catch (err) {
      addToast({
        type: "error",
        title: "Update Failed",
        message: "An unexpected error occurred while saving.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({
      name: personnel.name,
      email: personnel.email,
      staffCode: personnel.staffCode || "",
    });
    setIsEditing(false);
  };

  const handleToggleSecurity = async (key: "isLocked" | "disabled", value: boolean) => {
    try {
      await onUpdate(personnel.id, { [key]: value });
      addToast({
        type: "success",
        title: "Security Updated",
        message: `${key === "isLocked" ? "Lock" : "Access"} status changed successfully.`,
      });
    } catch (err) {
      addToast({
        type: "error",
        title: "Action Failed",
        message: "Could not update security settings.",
      });
    }
  };

  return (
    <motion.div
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="h-full flex flex-col w-full absolute inset-0 bg-white z-10"
    >
      <div className="p-6 border-b border-black/5 flex justify-between items-center bg-white sticky top-0 z-10">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40">
          Inspector
        </h2>
        <div className="flex gap-2">
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="h-8 px-3 rounded-full bg-[#F2F2F7] hover:bg-blue-50 hover:text-blue-600 text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-1.5"
            >
              <i className="bx bx-pencil" /> Edit
            </button>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors"
          >
            <i className="bx bx-x text-lg" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="mb-8">
          <div className="w-20 h-20 rounded-[1.5rem] bg-blue-600 text-white flex items-center justify-center text-4xl font-black mb-6 shadow-lg shadow-blue-500/20">
            {form.name.charAt(0) || "U"}
          </div>

          <AnimatePresence mode="wait">
            {!isEditing ? (
              <motion.div
                key="read"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-1"
              >
                <h2 className="text-2xl font-black text-slate-900 leading-tight">
                  {personnel.name}
                </h2>
                <p className="text-black/50 font-medium">{personnel.email}</p>
                <div className="pt-3">
                  <span className="px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-black/5">
                    CODE: {personnel.staffCode || "UNASSIGNED"}
                  </span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="edit"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4 bg-[#FAFAFC] p-5 rounded-[1.5rem] border border-blue-500/20 shadow-inner"
              >
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-black/40 pl-1">
                    Full Name
                  </label>
                  <input
                    autoFocus
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-white border border-black/10 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-black/40 pl-1">
                    Email
                  </label>
                  <input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-white border border-black/10 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-black/40 pl-1">
                    Staff Code
                  </label>
                  <input
                    value={form.staffCode}
                    onChange={(e) => setForm({ ...form, staffCode: e.target.value })}
                    placeholder="EMP-001"
                    className="w-full bg-white border border-black/10 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all uppercase"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 bg-slate-900 text-white rounded-xl py-3 text-[11px] font-black uppercase tracking-widest hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <i className="bx bx-loader-alt animate-spin text-sm" />
                    ) : (
                      "Save"
                    )}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="flex-1 bg-white border border-black/10 text-slate-600 rounded-xl py-3 text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.div
          layout
          animate={{
            opacity: isEditing ? 0.3 : 1,
            pointerEvents: isEditing ? "none" : "auto",
          }}
          className="space-y-8"
        >
          <section>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-black/30 mb-3">
              Branch Access
            </h4>
            <div className="space-y-2">
              {personnel.branchAssignments.map((ba, i) => (
                <div
                  key={i}
                  className="flex justify-between bg-[#F2F2F7] p-3.5 rounded-2xl text-sm font-bold"
                >
                  <span>{ba.branch.name}</span>
                  <span className="text-blue-600 uppercase text-[10px] flex items-center">
                    {ba.role}
                  </span>
                </div>
              ))}
              {personnel.branchAssignments.length === 0 && (
                <p className="text-xs text-black/40 font-medium italic">
                  No branches assigned.
                </p>
              )}
            </div>
          </section>

          <section>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-black/30 mb-3">
              Security Controls
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleToggleSecurity("isLocked", !personnel.isLocked)}
                className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  personnel.isLocked
                    ? "bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100"
                    : "bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100"
                }`}
              >
                {personnel.isLocked ? "Unlock Account" : "Lock Account"}
              </button>
              <button
                onClick={() => handleToggleSecurity("disabled", !personnel.disabled)}
                className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  personnel.disabled
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100"
                }`}
              >
                {personnel.disabled ? "Enable Access" : "Disable Access"}
              </button>
            </div>
          </section>
        </motion.div>
      </div>
    </motion.div>
  );
}

interface ProvisionPanelProps {
  onClose: () => void;
  onCreate: (newStaff: Partial<Personnel>) => Promise<void>;
}

function ProvisionPanel({ onClose, onCreate }: ProvisionPanelProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", staffCode: "", role: "CASHIER" });

  const handleCreate = async () => {
    if (!form.name || !form.email) {
      setError("Name and Email are required.");
      return;
    }
    if (form.staffCode && !/^STF-\d{3}$/.test(form.staffCode.toUpperCase())) {
      setError("Staff code must follow 'STF-XXX' format (e.g., STF-001).");
      return;
    }
    setError(null);
    setIsSaving(true);
    await onCreate({ ...form, staffCode: form.staffCode.toUpperCase() });
    setIsSaving(false);
  };

  return (
    <motion.div variants={panelVariants} initial="hidden" animate="visible" exit="exit" className="h-full flex flex-col w-full absolute inset-0 bg-white z-10">
      <div className="p-6 border-b border-black/5 flex justify-between items-center bg-white sticky top-0 z-10">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 flex items-center gap-2">
          <i className="bx bx-user-plus text-sm" /> Provision_Staff
        </h2>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors">
          <i className="bx bx-x text-lg" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
        <div>
          <h3 className="text-2xl font-black text-slate-900 mb-1">New Personnel</h3>
          <p className="text-xs text-black/40 font-medium mb-6">Create a new account and assign initial credentials.</p>
          
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-2xl border border-red-100 flex items-center gap-2">
              <i className="bx bx-error-circle text-lg" /> {error}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-black/40 pl-1">Full Name</label>
              <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="Jane Doe" className="w-full bg-[#F2F2F7] border-transparent rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-black/40 pl-1">Email Address</label>
              <input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} placeholder="jane@company.com" className="w-full bg-[#F2F2F7] border-transparent rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-black/40 pl-1">Staff Code</label>
                <input value={form.staffCode} onChange={(e) => setForm({...form, staffCode: e.target.value})} placeholder="STF-001" className="w-full bg-[#F2F2F7] border-transparent rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all uppercase" />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-black/40 pl-1">System Role</label>
                <select value={form.role} onChange={(e) => setForm({...form, role: e.target.value})} className="w-full bg-[#F2F2F7] border-transparent rounded-2xl px-4 py-3.5 text-[11px] font-black uppercase tracking-widest text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all appearance-none">
                  <option value="CASHIER">Cashier</option>
                  <option value="INVENTORY">Inventory</option>
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-6 border-t border-black/5 bg-[#FAFAFC]">
        <button onClick={handleCreate} disabled={isSaving} className="w-full bg-blue-600 text-white rounded-2xl py-4 text-[11px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
          {isSaving ? <i className="bx bx-loader-alt animate-spin text-lg" /> : "Provision Account"}
        </button>
      </div>
    </motion.div>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-center justify-center">
      <div className="bg-white rounded-[40px] w-full max-w-2xl p-12 text-center shadow-2xl">
        <i className="bx bx-shield-quarter text-6xl text-blue-600 mb-6" />
        <h2 className="text-4xl font-black tracking-tighter mb-4">Security Policies</h2>
        <p className="text-black/40 font-medium mb-10 max-w-md mx-auto">Global configurations for automated lockouts, password rotation, and MFA enforcement.</p>
        <button onClick={onClose} className="px-12 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-600 transition-colors">Close Configuration</button>
      </div>
    </motion.div>
  );
}