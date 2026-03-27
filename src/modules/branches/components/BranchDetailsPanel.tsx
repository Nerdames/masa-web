// File: @/modules/branches/components/BranchDetailsPanel.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Branch, UpdateBranchPayload } from "./types";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { PersonnelDetailsPanel } from "@/modules/personnel/components/PersonnelDetailsPanel";

/* ==========================================================================
   TYPES & UTILS
   ========================================================================== */

type ActivityLogDTO = {
  id: string;
  action: string;
  critical?: boolean;
  createdAt: string | Date;
  details?: string;
  performedBy?: string;
  personnel?: { name?: string; email?: string } | null;
};

function getInitials(name?: string) {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/* ==========================================================================
   MAIN COMPONENT
   ========================================================================== */

interface BranchDetailsPanelProps {
  branchId: string;
  onRefresh: () => Promise<void>;
  dispatch: (action: any) => void;
}

export function BranchDetailsPanel({ branchId, onRefresh, dispatch }: BranchDetailsPanelProps) {
  const { closePanel, openPanel } = useSidePanel();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ name: "", location: "" });
  const [logs, setLogs] = useState<ActivityLogDTO[]>([]);

  // --- Transference Protocol State ---
  const [isReassigning, setIsReassigning] = useState(false);
  const [selectedPersonnel, setSelectedPersonnel] = useState<string[]>([]);
  const [targetBranchId, setTargetBranchId] = useState("");
  const [availableBranches, setAvailableBranches] = useState<{ id: string; name: string }[]>([]);

  const loadBranchData = useCallback(async (mounted = true) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/branches/${branchId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!mounted) return;
      setBranch(data);
      setForm({ name: data.name || "", location: data.location || "" });
      setLogs(data.recentLogs || []);
    } catch (err) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Sync Failed", message: "Telemetry unreachable." });
      closePanel();
    } finally {
      if (mounted) setIsLoading(false);
    }
  }, [branchId, dispatch, closePanel]);

  useEffect(() => {
    let mounted = true;
    loadBranchData(mounted);
    return () => { mounted = false; };
  }, [loadBranchData]);

  // Fetch available branches when entering reassign mode
  useEffect(() => {
    if (isReassigning) {
      fetch("/api/branches")
        .then((res) => res.json())
        .then((resData) => {
          // Support both paginated {data: []} and direct array structures
          const arrayData = Array.isArray(resData) ? resData : resData.data || [];
          setAvailableBranches(arrayData.filter((b: any) => b.id !== branchId && !b.deletedAt && b.active));
        })
        .catch(() => {});
    } else {
      setSelectedPersonnel([]);
      setTargetBranchId("");
    }
  }, [isReassigning, branchId]);

  const handleUpdate = useCallback(async (payload: Partial<UpdateBranchPayload>) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/branches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: branchId, ...payload }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setBranch((prev) => (prev ? { ...prev, ...updated } : prev));
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Registry Updated", message: "Node parameters synchronized." });
      setIsEditing(false);
      await onRefresh();
    } catch (err) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Update Error", message: "Barrier detected." });
    } finally {
      setIsSaving(false);
    }
  }, [branchId, dispatch, onRefresh]);

  const toggleSelection = (id: string) => {
    setSelectedPersonnel((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleBulkReassign = async () => {
    if (!targetBranchId || selectedPersonnel.length === 0) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/branches/${branchId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personnelIds: selectedPersonnel, newBranchId: targetBranchId }),
      });
      if (!res.ok) throw new Error();
      
      dispatch({ 
        kind: "TOAST", 
        type: "SUCCESS", 
        title: "Transference Complete", 
        message: `Migrated ${selectedPersonnel.length} personnel to destination node.` 
      });
      
      setIsReassigning(false);
      await loadBranchData();
      await onRefresh();
    } catch (err) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Transfer Failed", message: "Protocol handshake rejected." });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePersonnelClick = useCallback((personnel: any) => {
    openPanel(
      <PersonnelDetailsPanel
        personnel={personnel}
        onClose={() => openPanel(
          <BranchDetailsPanel branchId={branchId} onRefresh={onRefresh} dispatch={dispatch} />
        )}
        onUpdate={async (id, payload) => {
          const res = await fetch(`/api/personnel`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, ...payload }),
          });
          if (!res.ok) throw new Error();
          await onRefresh();
        }}
        onDelete={async (id) => {
          const res = await fetch(`/api/personnel/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error();
          await onRefresh();
          openPanel(<BranchDetailsPanel branchId={branchId} onRefresh={onRefresh} dispatch={dispatch} />);
        }}
        dispatch={dispatch}
      />
    );
  }, [openPanel, branchId, onRefresh, dispatch]);

  const displayLogs = useMemo(() => {
    return [...logs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [logs]);

  if (isLoading || !branch) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-12 bg-white">
        <i className="bx bx-loader-alt animate-spin text-3xl text-slate-300 mb-4" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 whitespace-nowrap">Synchronizing Registry...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* --- Sub Header (Sticky) --- */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-black/[0.04] px-6 py-5 flex items-center justify-between w-full overflow-hidden">
        <div className="min-w-0 flex-1 mr-4 overflow-hidden">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 mb-0.5 whitespace-nowrap truncate">
            Node_Inspector
          </div>
          <h2 className="text-[13px] font-bold text-slate-900 flex items-center gap-2 whitespace-nowrap overflow-hidden">
            <span className="shrink-0">Registry:</span>
            <span className="font-mono text-slate-400 whitespace-nowrap truncate bg-slate-50 px-1.5 py-0.5 rounded border border-black/[0.02]">
              {branch.id.slice(-8).toUpperCase()}
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={closePanel}
            aria-label="Close panel"
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-all active:scale-90"
          >
            <i className="bx bx-x text-lg" />
          </button>
        </div>
      </div>

      {/* --- Scrollable Body --- */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 bg-[#FAFAFC]">
        
        {/* Profile Card */}
        <section className="flex flex-col bg-white border border-black/[0.04] rounded-2xl shadow-sm overflow-hidden">
          <div className={`p-3 flex items-center gap-3 border-b border-black/[0.02] ${branch.deletedAt ? "bg-red-50/50" : "bg-slate-50/30"}`}>
            <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center text-sm font-black shadow-sm whitespace-nowrap ${branch.deletedAt ? "bg-red-100 text-red-600" : "bg-slate-900 text-white"}`}>
              {getInitials(branch.name)}
            </div>

            <div className="min-w-0 flex-1 overflow-hidden">
              <h3 className="text-[13px] font-bold text-slate-900 truncate whitespace-nowrap">
                {branch.name}
              </h3>
              <div className="flex items-center gap-1.5 opacity-60 overflow-hidden">
                <i className="bx bx-map-pin text-[10px] shrink-0" />
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate whitespace-nowrap">
                  {branch.location || "Unmapped Infrastructure"}
                </p>
              </div>
            </div>
            
            {!isEditing && (
              <button onClick={() => setIsEditing(true)} className="p-2 hover:bg-black/5 rounded-full transition-colors shrink-0">
                <i className="bx bx-edit-alt text-slate-400 text-lg" />
              </button>
            )}
          </div>

          <div className="p-3">
            {!isEditing ? (
              <div className="flex flex-col gap-2">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-tighter whitespace-nowrap">
                  Node Configuration Active
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 w-full overflow-hidden">
                <div className="flex flex-col gap-1.5 overflow-hidden">
                  <label className="flex justify-between items-center px-0.5 overflow-hidden">
                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest whitespace-nowrap">Identify Node</span>
                    {form.name !== branch.name && <span className="text-[9px] text-blue-500 font-bold italic whitespace-nowrap">Modified</span>}
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Enter branch name..."
                    className="w-full bg-slate-50 border border-black/[0.06] rounded-xl px-3 py-2.5 text-[13px] font-semibold outline-none focus:border-blue-500/50 focus:bg-white transition-all whitespace-nowrap truncate"
                  />
                </div>

                <div className="flex flex-col gap-1.5 overflow-hidden">
                  <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest px-0.5 whitespace-nowrap">
                    Assign Deployment Zone
                  </label>
                  <div className="relative flex items-center">
                    <i className="bx bx-map text-slate-300 absolute left-3 z-10 shrink-0" />
                    <input
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      placeholder="Physical address..."
                      className="w-full bg-slate-50 border border-black/[0.06] rounded-xl pl-9 pr-3 py-2.5 text-[13px] font-semibold outline-none focus:border-blue-500/50 focus:bg-white transition-all whitespace-nowrap truncate"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <button onClick={() => handleUpdate({ name: form.name, location: form.location })} disabled={isSaving} className="w-full bg-slate-900 text-white text-[11px] font-black py-3 rounded-xl hover:bg-blue-600 transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 uppercase tracking-widest whitespace-nowrap truncate">
                    {isSaving ? "Synchronizing..." : "Commit Deployment"}
                  </button>
                  <button onClick={() => setIsEditing(false)} className="w-full bg-white text-slate-500 text-[11px] font-black py-2 rounded-xl border border-black/[0.04] hover:bg-slate-50 transition-all uppercase tracking-widest whitespace-nowrap truncate">
                    Abort Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Assigned Workforce */}
        <section>
          <div className="flex items-center justify-between mb-4 px-1 overflow-hidden">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 whitespace-nowrap truncate mr-2">Deployed_Workforce</h4>
            
            {!branch.deletedAt && branch.branchAssignments && branch.branchAssignments.length > 0 && (
              <button 
                onClick={() => setIsReassigning(!isReassigning)}
                className={`text-[9px] font-black px-3 py-1.5 rounded-full border transition-all shrink-0 whitespace-nowrap ${
                  isReassigning ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20" : "bg-white text-slate-500 border-black/5 hover:border-blue-200"
                }`}
              >
                {isReassigning ? "INIT_MIGRATION" : "INIT_MIGRATION"}
              </button>
            )}
            
            {!isReassigning && (!branch.branchAssignments || branch.branchAssignments.length === 0) && (
              <span className="text-[10px] font-black bg-white border border-black/5 text-slate-500 px-3 py-1 rounded-full whitespace-nowrap shrink-0">
                0 Members
              </span>
            )}
          </div>

          {/* Transference Protocol Control Box */}
          {isReassigning && (
            <div className="mb-4 p-3 bg-blue-50/50 border border-blue-500/20 rounded-2xl space-y-3 overflow-hidden animate-in fade-in slide-in-from-top-2">
              <div className="flex flex-col gap-1.5 overflow-hidden">
                <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 whitespace-nowrap">Destination Node</label>
                <select
                  value={targetBranchId}
                  onChange={(e) => setTargetBranchId(e.target.value)}
                  className="w-full bg-white border border-blue-500/20 rounded-xl px-3 py-2 text-[12px] font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 truncate whitespace-nowrap"
                >
                  <option value="">Select Target Branch...</option>
                  {availableBranches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleBulkReassign}
                disabled={isSaving || selectedPersonnel.length === 0 || !targetBranchId}
                className="w-full bg-blue-600 text-white text-[10px] font-black py-2.5 rounded-xl uppercase tracking-[0.2em] disabled:opacity-40 hover:bg-blue-700 transition-all truncate whitespace-nowrap shadow-md shadow-blue-500/20 active:scale-[0.98]"
              >
                {isSaving ? "Executing..." : `Execute Migration (${selectedPersonnel.length})`}
              </button>
            </div>
          )}

          <div className="grid gap-2">
            {branch.branchAssignments?.map((ba) => (
              <button 
                key={ba.id} 
                onClick={() => isReassigning ? toggleSelection(ba.personnelId) : handlePersonnelClick(ba.personnel)}
                className={`w-full flex items-center justify-between bg-white border p-4 rounded-2xl transition-all group text-left overflow-hidden ${
                  isReassigning && selectedPersonnel.includes(ba.personnelId)
                    ? "border-blue-500 bg-blue-50/40 shadow-sm"
                    : "border-black/[0.03] hover:border-blue-500/30 hover:shadow-md"
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  {/* Select Checkbox (Reassignment Mode) */}
                  {isReassigning && (
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      selectedPersonnel.includes(ba.personnelId) ? "bg-blue-600 border-blue-600" : "bg-white border-slate-300"
                    }`}>
                      {selectedPersonnel.includes(ba.personnelId) && <i className="bx bx-check text-white text-[12px]" />}
                    </div>
                  )}
                  
                  {/* Avatar */}
                  <div className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-[11px] font-black transition-all shadow-sm whitespace-nowrap ${
                    isReassigning && selectedPersonnel.includes(ba.personnelId) 
                      ? "bg-blue-600 text-white" 
                      : "bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white"
                  }`}>
                    {ba.personnel.name?.charAt(0)}
                  </div>

                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-slate-900 whitespace-nowrap truncate">{ba.personnel.name}</div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap truncate">{ba.role.replace(/_/g, " ")}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  {ba.isPrimary && (
                    <div className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase tracking-widest border border-emerald-100 whitespace-nowrap">Primary</div>
                  )}
                  {!isReassigning && <i className="bx bx-chevron-right text-slate-300 group-hover:text-blue-500 transition-colors whitespace-nowrap" />}
                </div>
              </button>
            )) || (
              <div className="p-8 border-2 border-dashed border-black/[0.03] rounded-3xl text-center">
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest whitespace-nowrap truncate">No Personnel Deployed</p>
              </div>
            )}
          </div>
        </section>

        {/* Operational Logic */}
        <section className="space-y-4">
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1 whitespace-nowrap truncate">Operational_Logic</h4>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleUpdate({ active: !branch.active })}
              disabled={isSaving}
              className={`py-4 px-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm whitespace-nowrap truncate ${
                branch.active 
                ? "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100" 
                : "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100"
              }`}
            >
              {branch.active ? "Suspend Node" : "Resume Node"}
            </button>
            <button
              onClick={() => handleUpdate({ deletedAt: new Date().toISOString() })}
              disabled={isSaving}
              className="py-4 px-2 rounded-2xl bg-white text-slate-400 border border-black/5 text-[10px] font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all shadow-sm whitespace-nowrap truncate"
            >
              Archive Node
            </button>
          </div>
        </section>

        {/* Historical Telemetry (Activity Logs) */}
        <section className="overflow-hidden">
          <div className="flex items-center justify-between mb-6 px-1">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 whitespace-nowrap truncate">Registry_Events</h4>
            <div className="text-[9px] font-bold text-slate-300 whitespace-nowrap">{displayLogs.length} Records</div>
          </div>
          <div className="relative pl-6 border-l border-black/[0.05] space-y-8 ml-3">
            {displayLogs.length > 0 ? displayLogs.map((log) => (
              <div key={log.id} className="relative group overflow-hidden">
                <span className="absolute -left-[29px] top-1 w-3 h-3 rounded-full bg-white border-2 border-slate-200 group-hover:border-blue-500 transition-colors shrink-0" />
                <div className="flex items-center justify-between gap-4 overflow-hidden">
                  <p className="text-[10px] font-black text-slate-800 uppercase tracking-tighter whitespace-nowrap truncate min-w-0">
                    {log.action} <span className="text-slate-300 mx-1">•</span> {log.personnel?.name || log.performedBy || "System"}
                  </p>
                  <p className="text-[9px] font-mono text-slate-400 bg-white px-2 py-0.5 rounded border border-black/5 shadow-sm whitespace-nowrap tabular-nums shrink-0">
                    {new Date(log.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <p className="text-[11px] font-medium text-slate-500 mt-1 leading-relaxed whitespace-nowrap truncate min-w-0">
                  {log.details || "Registry modification event recorded."}
                </p>
              </div>
            )) : (
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest italic whitespace-nowrap">No events recorded</p>
            )}
          </div>
        </section>

        {/* --- Danger Zone --- */}
        <div className="pt-10 border-t border-black/[0.04]">
          <button
            onClick={async () => {
              if (!confirm(`CRITICAL: Purge ${branch.name}? This action is permanent.`)) return;
              try {
                const res = await fetch(`/api/branches/${branchId}/purge`, { method: "DELETE" });
                if (res.ok) {
                  dispatch({ kind: "TOAST", type: "SUCCESS", title: "Data Purged", message: "Node record destroyed." });
                  closePanel();
                  await onRefresh();
                }
              } catch (err) {
                dispatch({ kind: "TOAST", type: "ERROR", title: "Purge Failed", message: "Security override active." });
              }
            }}
            className="w-full flex items-center justify-center gap-3 px-3 py-5 text-[10px] font-black uppercase tracking-[0.2em] border border-red-100 text-red-500 bg-red-50/30 rounded-3xl hover:bg-red-500 hover:text-white transition-all group shadow-sm shadow-red-500/5 whitespace-nowrap truncate"
          >
            <i className="bx bx-trash-alt text-lg group-hover:animate-pulse shrink-0" /> 
            Permanently Purge Node
          </button>
        </div>

      </div>
    </div>
  );
}

export default BranchDetailsPanel;