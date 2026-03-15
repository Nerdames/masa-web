"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Role } from "@prisma/client";
import { useAlerts } from "@/components/feedback/AlertProvider";

/* ================= TYPES ================= */

interface BranchStats {
  personnel: number;
  branchProducts: number;
  posSessions: number;
}

interface AssignedPersonnel {
  id: string;
  name: string | null;
  email: string;
  staffCode: string | null;
  role: Role;
}

interface BranchAssignment {
  id: string;
  role: Role;
  isPrimary: boolean;
  personnel: AssignedPersonnel;
}

interface Branch {
  id: string;
  organizationId: string;
  name: string;
  location: string | null;
  active: boolean;
  deletedAt: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  _count?: BranchStats;
  branchAssignments?: BranchAssignment[];
}

interface Summary {
  total: number;
  active: number;
  inactive: number;
  deleted: number;
}

interface ActivityLog {
  id: string;
  action: string;
  personnelName?: string;
  performedBy?: string;
  personnel?: { name: string };
  time?: string;
  createdAt: string | Date;
  details: string;
  critical: boolean;
}

/* ================= MAIN COMPONENT ================= */

export default function BranchMissionControl() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  // UI State
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "active" | "inactive" | "deleted">("all");

  // Side Panel State Management
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Activity Logs
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  /* -------------------------------------------------------
     DATA FETCHING
  ------------------------------------------------------- */

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    try {
      // Assuming a standardized API route for fetching branches with their stats
      const res = await fetch(`/api/dashboard/branches?${new URLSearchParams({
        search,
        status: activeTab !== "all" ? activeTab : "",
      }).toString()}`);

      const result = await res.json();

      if (res.ok) {
        setBranches(result.data);
        setSummary(result.summary);
        if (result.recentLogs) {
          setActivityLogs(result.recentLogs);
        }
      }
    } catch (error) {
      console.error("Failed to fetch branches", error);
    } finally {
      setLoading(false);
    }
  }, [search, activeTab]);

  useEffect(() => {
    const debounceTimer = setTimeout(fetchBranches, 300);
    return () => clearTimeout(debounceTimer);
  }, [fetchBranches]);

  /* -------------------------------------------------------
     ACTION HANDLERS
  ------------------------------------------------------- */

  const handleUpdate = async (id: string, updates: Partial<Branch>) => {
    try {
      const res = await fetch(`/api/dashboard/branches`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updates, id }),
      });

      if (!res.ok) throw new Error("Failed to update branch");

      const updatedData: Branch = await res.json();

      setBranches((prev) => prev.map((b) => (b.id === id ? { ...b, ...updatedData } : b)));

      if (selectedBranch?.id === id) {
        setSelectedBranch((prev) => (prev ? { ...prev, ...updatedData } : null));
      }

      fetchBranches(); 

      setActivityLogs((prev) => [
        {
          id: Date.now().toString(),
          action: updates.deletedAt !== undefined ? "BRANCH_DELETED" : updates.active !== undefined ? "BRANCH_STATUS_TOGGLE" : "BRANCH_UPDATE",
          personnelName: updatedData.name,
          performedBy: "Current Admin",
          createdAt: new Date(),
          time: "Just Now",
          details: updates.deletedAt !== undefined 
            ? `Branch marked as deleted.` 
            : updates.active !== undefined
            ? `Branch status changed to ${updates.active ? "Active" : "Inactive"}.`
            : "Branch infrastructure details updated.",
          critical: updatedData.deletedAt !== null || !updatedData.active,
        },
        ...prev,
      ]);
    } catch (error) {
      console.error("Update Error:", error);
      throw error;
    }
  };

  const handleCreate = async (newBranch: Partial<Branch>) => {
    try {
      const res = await fetch("/api/dashboard/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBranch),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Branch deployment failed");
      }

      const created: Branch = await res.json();

      setBranches((prev) => [created, ...prev]);
      setIsProvisioning(false);
      fetchBranches(); 

      setActivityLogs((prev) => [
        {
          id: Date.now().toString(),
          action: "BRANCH_DEPLOYED",
          personnelName: created.name,
          performedBy: "Current Admin",
          createdAt: new Date(),
          time: "Just Now",
          details: `Initialized new operational node at ${created.location || 'Unknown location'}.`,
          critical: false,
        },
        ...prev,
      ]);
    } catch (error: unknown) {
      throw error;
    }
  };

  /* -------------------------------------------------------
     PANEL ROUTING LOGIC
  ------------------------------------------------------- */

  const openProvisioning = () => {
    setSelectedBranch(null);
    setIsProvisioning(true);
  };

  const openDetails = (b: Branch) => {
    setIsProvisioning(false);
    setSelectedBranch((prev) => (prev?.id === b.id ? null : b));
  };

  const closePanels = () => {
    setIsProvisioning(false);
    setSelectedBranch(null);
  };

  return (
    <div className="flex h-screen bg-[#F2F2F7] overflow-hidden text-[#1d1d1f] font-sans">
      {/* 1. MAIN PANEL */}
      <main className="flex-1 flex flex-col min-w-0 bg-white relative">
        <header className="px-4 py-2 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-xl z-10 border-b border-black/5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Infrastructure</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group">
              <i className="bx bx-search absolute left-4 top-1/2 -translate-y-1/2 text-black/30 text-lg group-focus-within:text-blue-500 transition-colors" />
              <input 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search branch name or location..." 
                className="pl-11 pr-4 py-2.5 bg-[#F2F2F7] border-transparent rounded-2xl text-sm w-72 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/20 transition-all outline-none font-medium"
              />
            </div>
            <button 
              onClick={openProvisioning}
              className={`h-10 px-5 rounded-2xl text-xs font-bold shadow-lg transition-all ${isProvisioning ? "bg-blue-600 text-white shadow-blue-500/20" : "bg-slate-900 text-white shadow-black/10 hover:bg-blue-600"}`}
            >
              + Deploy Branch
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
            {(["all", "active", "inactive", "deleted"] as const).map((tab) => {
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
              Syncing Nodes...
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-w-5xl mx-auto pb-10"> 
              <AnimatePresence mode="popLayout">
                {branches.map((b) => (
                  <BranchCard 
                    key={b.id} 
                    branch={b} 
                    isSelected={selectedBranch?.id === b.id}
                    onClick={() => openDetails(b)} 
                  />
                ))}
              </AnimatePresence>
              {branches.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 text-black/30">
                  <i className="bx bx-buildings text-5xl mb-2 opacity-50" />
                  <p className="text-[10px] font-black uppercase tracking-widest">No Branches Found</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* 2. DYNAMIC SIDE PANEL */}
      <aside className="w-[340px] h-full bg-white border-l border-black/5 flex flex-col shadow-[-10px_0_20px_rgba(0,0,0,0.02)] z-20 flex-shrink-0 relative">
        <AnimatePresence mode="wait">
          {isProvisioning ? (
            <ProvisionPanel key="provision" onClose={closePanels} onCreate={handleCreate} />
          ) : selectedBranch ? (
            <DetailsPanel key="details" branch={selectedBranch} onClose={closePanels} onUpdate={handleUpdate} />
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

function BranchCard({ branch, isSelected, onClick }: { branch: Branch, isSelected: boolean, onClick: () => void }) {
  const status = branch.deletedAt ? "deleted" : branch.active ? "active" : "inactive";

  return (
    <motion.div
      layoutId={`branch-${branch.id}`}
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
          isSelected ? "bg-blue-600" : branch.deletedAt ? "bg-red-900" : "bg-slate-900"
        }`}>
          <i className="bx bx-buildings" />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-sm sm:text-[15px] text-slate-900 truncate group-hover:text-blue-600 transition-colors">
            {branch.name}
          </h3>
          <p className="text-[10px] text-black/40 font-black uppercase tracking-widest truncate flex items-center gap-1">
            <i className="bx bx-map-pin" /> {branch.location || "NO_LOCATION"}
          </p>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-8 flex-1">
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase text-black/30 tracking-tighter">Personnel</span>
          <span className="text-xs font-bold text-slate-700">{branch._count?.personnel || 0} Staff</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase text-black/30 tracking-tighter">Inventory</span>
          <span className="text-xs font-bold text-slate-700">{branch._count?.branchProducts || 0} SKUs</span>
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

function StatusBadge({ status }: { status: "active" | "inactive" | "deleted" }) {
  const styles = {
    active: "bg-emerald-50 text-emerald-600 border-emerald-100",
    inactive: "bg-amber-50 text-amber-600 border-amber-200",
    deleted: "bg-red-50 text-red-600 border-red-200",
  };
  return (
    <span className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${styles[status]}`}>
      {status === 'deleted' ? 'archived' : status}
    </span>
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
    <motion.div variants={panelVariants} initial="hidden" animate="visible" exit="exit" className="h-full flex flex-col w-full absolute inset-0 bg-white">
      <div className="p-6 border-b border-black/5 bg-[#FAFAFC]">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-black/50 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
          Infrastructure_Events
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-[#FAFAFC]">
        {(!logs || logs.length === 0) && (
          <div className="flex flex-col items-center justify-center h-40 text-center space-y-2">
            <i className="bx bx-network-chart text-3xl text-black/10" />
            <p className="text-[10px] font-bold text-black/30 tracking-widest uppercase">No Events Detected</p>
          </div>
        )}

        {logs.map((log) => {
          const performerName = log.personnel?.name ?? "System Core";
          const targetName = log.personnelName ?? "N/A";

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
                    {log.time ?? new Date(log.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>
                <div>
                  <span className={`inline-block mb-1.5 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${log.critical ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>
                    {log.action.replace(/_/g, " ")}
                  </span>
                  <p className="text-xs font-medium text-slate-600 leading-relaxed mb-1">{log.details ?? "No details provided"}</p>
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

interface DetailsPanelProps {
  branch: Branch;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Branch>) => Promise<void>;
}

function DetailsPanel({ branch, onClose, onUpdate }: DetailsPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { dispatch } = useAlerts();

  const [form, setForm] = useState({
    name: branch.name || "",
    location: branch.location || "",
  });

  useEffect(() => {
    setForm({
      name: branch.name || "",
      location: branch.location || "",
    });
  }, [branch]);

  const handleSave = async () => {
    if (!form.name.trim()) {
        dispatch({
          kind: "TOAST",
          type: "ERROR",
          title: "Validation Error",
          message: "Branch name is required."
        });
      return;
    }

    setIsSaving(true);
    try {
      await onUpdate(branch.id, {
        name: form.name,
        location: form.location,
      });
      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Branch Updated",
        message: "Infrastructure details saved."
      });
    } catch (err: unknown) {
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Update Failed",
        message: "Network or permission error."
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (key: "active" | "deletedAt", value: any) => {
    const isDeleteAction = key === "deletedAt" && value !== null;
    if (isDeleteAction && !confirm("Are you sure you want to archive this branch? It will be marked as deleted.")) return;

    try {
      await onUpdate(branch.id, { [key]: value });
      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Status Updated",
        message: `Branch is now ${isDeleteAction ? "Archived" : value ? "Active" : "Inactive"}.`
      });
    } catch (err: unknown) {
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Update Failed",
        message: "Could not change status."
      });
    }
  };

  return (
    <motion.div variants={panelVariants} initial="hidden" animate="visible" exit="exit" className="h-full flex flex-col w-full absolute inset-0 bg-white z-10 border-l border-black/5">
      {/* Header */}
      <div className="p-6 border-b border-black/5 flex justify-between items-center bg-white sticky top-0 z-10">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40">Node_Inspector</h2>
        <div className="flex gap-2">
          {!isEditing && !branch.deletedAt && (
            <button onClick={() => setIsEditing(true)} className="h-8 px-3 rounded-full bg-[#F2F2F7] hover:bg-blue-50 hover:text-blue-600 text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-1.5">
              <i className="bx bx-pencil" /> Edit
            </button>
          )}
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors">
            <i className="bx bx-x text-lg" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {/* Node Icon & Profile */}
        <div className="mb-8">
          <div className={`w-20 h-20 rounded-[1.5rem] flex items-center justify-center text-4xl font-black mb-6 shadow-xl shadow-black/10 transition-colors ${branch.deletedAt ? 'bg-red-900 text-red-200' : 'bg-slate-900 text-white'}`}>
            <i className="bx bx-buildings" />
          </div>

          <AnimatePresence mode="wait">
            {!isEditing ? (
              <motion.div key="read" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1">
                <h2 className="text-2xl font-black text-slate-900 leading-tight">{branch.name}</h2>
                <p className="text-black/50 font-medium flex items-center gap-1"><i className="bx bx-map" /> {branch.location || "Location not set"}</p>
                <div className="pt-3 flex gap-2">
                  <span className="px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-black/5">
                    ID: {branch.id.slice(-8)}
                  </span>
                  {branch.deletedAt && (
                    <span className="px-2.5 py-1.5 bg-red-100 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-red-200">
                      ARCHIVED
                    </span>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div key="edit" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4 bg-[#FAFAFC] p-5 rounded-[1.5rem] border border-black/5">
                <div className="space-y-4">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-black/40 pl-1">Branch Name</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-white border border-black/10 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-blue-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-black/40 pl-1">Location / Address</label>
                    <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full bg-white border border-black/10 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-blue-500 outline-none transition-all" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={handleSave} disabled={isSaving} className="flex-1 bg-slate-900 text-white rounded-xl py-3 text-[11px] font-black uppercase tracking-widest hover:bg-blue-600 transition-colors disabled:opacity-50">
                      {isSaving ? <i className="bx bx-loader-alt animate-spin" /> : "Save Changes"}
                    </button>
                    <button onClick={() => setIsEditing(false)} className="flex-1 bg-white border border-black/10 text-slate-600 rounded-xl py-3 text-[11px] font-black uppercase tracking-widest">Cancel</button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Assigned Personnel */}
        <motion.div layout animate={{ opacity: isEditing ? 0.3 : 1, pointerEvents: isEditing ? "none" : "auto" }} className="space-y-8">
          <section>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-black/30 mb-3 flex justify-between items-center">
              Assigned Workforce
              <span className="bg-black/5 px-2 py-0.5 rounded text-black/50">{branch.branchAssignments?.length || 0}</span>
            </h4>
            <div className="space-y-2">
              {branch.branchAssignments?.map((ba) => (
                <div key={ba.id} className="flex justify-between items-center bg-[#F2F2F7] p-3.5 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center text-xs font-bold text-white">
                      {ba.personnel.name?.charAt(0) || "U"}
                    </div>
                    <div>
                      <span className="text-sm font-bold text-slate-900 block">{ba.personnel.name || "Unknown"}</span>
                      <span className="text-[9px] text-black/40 font-black uppercase tracking-widest">{ba.personnel.staffCode || "NO-CODE"}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {ba.isPrimary && <span className="text-[8px] bg-blue-600 text-white px-1.5 py-0.5 rounded-md font-black uppercase tracking-tighter">Primary</span>}
                    <span className="text-slate-500 uppercase text-[9px] font-black tracking-widest">{ba.role}</span>
                  </div>
                </div>
              ))}
              {(!branch.branchAssignments || branch.branchAssignments.length === 0) && (
                <div className="p-4 border border-dashed border-black/10 rounded-2xl text-center">
                  <p className="text-xs text-black/40 italic">No personnel assigned to this node.</p>
                </div>
              )}
            </div>
          </section>

          {/* Operational Controls */}
          {!branch.deletedAt && (
            <section>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-black/30 mb-3">Operational Controls</h4>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleToggleStatus("active", !branch.active)}
                  className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    branch.active ? "bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100"
                  }`}
                >
                  {branch.active ? "Suspend Node" : "Activate Node"}
                </button>
                <button
                  onClick={() => handleToggleStatus("deletedAt", new Date().toISOString())}
                  className="py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all bg-red-50 text-red-600 border border-red-100 hover:bg-red-100"
                >
                  Archive Node
                </button>
              </div>
            </section>
          )}
          
          {branch.deletedAt && (
            <section>
               <button
                  onClick={() => handleToggleStatus("deletedAt", null)}
                  className="w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100"
                >
                  Restore Archived Node
                </button>
            </section>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

interface ProvisionPanelProps {
  onClose: () => void;
  onCreate: (newBranch: Partial<Branch>) => Promise<void>;
}

function ProvisionPanel({ onClose, onCreate }: ProvisionPanelProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ 
    name: "", 
    location: "", 
    active: true
  });

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setError("Branch name is required to initialize a node.");
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onCreate(form);
      // Let the parent close it to handle success state gracefully
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to deploy branch.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div variants={panelVariants} initial="hidden" animate="visible" exit="exit" className="h-full flex flex-col w-full absolute inset-0 bg-white z-20 border-l border-black/5">
      <div className="p-6 border-b border-black/5 flex justify-between items-center bg-white sticky top-0 z-10">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 flex items-center gap-2">
          <i className="bx bx-server text-sm" /> Deploy_New_Node
        </h2>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors">
          <i className="bx bx-x text-lg" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
        <div>
          <h3 className="text-2xl font-black text-slate-900 mb-1">Node Provisioning</h3>
          <p className="text-xs text-black/40 font-medium mb-6">Initialize a new physical or virtual branch in the infrastructure network.</p>

          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-2xl border border-red-100 flex items-center gap-2">
              <i className="bx bx-error-circle text-lg" /> {error}
            </div>
          )}

          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-black/40 pl-1">Branch/Node Name</label>
              <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="e.g. Lagos HQ" className="w-full bg-[#F2F2F7] border-transparent rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-black/40 pl-1">Geographic Location</label>
              <input value={form.location} onChange={(e) => setForm({...form, location: e.target.value})} placeholder="Full address or coordinates" className="w-full bg-[#F2F2F7] border-transparent rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" />
            </div>

            <div className="flex items-center justify-between p-4 bg-[#F2F2F7] rounded-2xl mt-4">
              <div>
                <span className="block text-[11px] font-black uppercase tracking-widest text-slate-900">Immediate Activation</span>
                <span className="text-[10px] text-black/40 font-medium">Allow operations immediately upon deployment</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({...form, active: e.target.checked})} className="sr-only peer" />
                <div className="w-11 h-6 bg-black/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-black/5 bg-[#FAFAFC]">
        <button onClick={handleCreate} disabled={isSaving} className="w-full bg-blue-600 text-white rounded-2xl py-4 text-[11px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
          {isSaving ? <i className="bx bx-loader-alt animate-spin text-lg" /> : "Deploy Infrastructure Node"}
        </button>
      </div>
    </motion.div>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-center justify-center">
      <div className="bg-white rounded-[40px] w-full max-w-2xl p-12 text-center shadow-2xl">
        <i className="bx bx-slider-alt text-6xl text-blue-600 mb-6" />
        <h2 className="text-4xl font-black tracking-tighter mb-4">Global Network Routing</h2>
        <p className="text-black/40 font-medium mb-10 max-w-md mx-auto">Configurations for cross-branch stock transfers, shared inventory thresholds, and global reporting scopes.</p>
        <button onClick={onClose} className="px-12 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-600 transition-colors">Close Configuration</button>
      </div>
    </motion.div>
  );
}