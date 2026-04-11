// File: @/modules/branches/components/BranchDetailsPanel.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Branch, UpdateBranchPayload } from "../types";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { PersonnelDetailsPanel } from "@/modules/personnel/components/PersonnelDetailsPanel";
import { getInitials } from "@/core/utils";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

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


// Inline Property Row to match PersonnelDetailsPanel styling
const PropertyRow = ({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between py-1.5 min-w-0">
    <div className="flex items-center gap-2.5 shrink-0 pr-4">
      <div className="w-6 h-6 rounded-md bg-slate-50 flex items-center justify-center border border-black/[0.03]">
        <i className={`${icon} text-slate-400 text-xs`} />
      </div>
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
    </div>
    <div className="min-w-0 truncate text-right">{value}</div>
  </div>
);

/* ==========================================================================
   MAIN COMPONENT
   ========================================================================== */

interface BranchDetailsPanelProps {
  branchId: string;
  onRefresh: () => Promise<void>;
  dispatch: (action: any) => void;
}

export function BranchDetailsPanel({ branchId, onRefresh }: BranchDetailsPanelProps) {
  const { dispatch } = useAlerts();
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

// 2. Use the 'dispatch' function inside your handler
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
      
      // ✅ WORKS: Using the dispatch we initialized at the top
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
      // ✅ WORKS
      dispatch({ 
        kind: "TOAST", 
        type: "WARNING", // Note: Ensure 'WARNING' or 'SECURITY' matches your TYPE_CONFIG
        title: "Transfer Failed", 
        message: "Protocol handshake rejected." 
      });
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
      <div className="fixed inset-y-0 right-0 h-screen flex flex-col w-[340px] items-center justify-center p-12 bg-white shadow-[-10px_0_40px_rgba(0,0,0,0.04)] border-l border-slate-100 z-50">
        {/* Content Wrapper */}
        <div className="flex flex-col items-center justify-center">
          {/* Spinner Stack */}
          <div className="relative mb-10 flex items-center justify-center">
            {/* Static base ring */}
            <div className="h-10 w-10 border-[1px] border-slate-100 rounded-full" />
            {/* Animated active ring */}
            <div className="absolute top-0 h-10 w-10 border-t-[1px] border-blue-600 rounded-full animate-spin" />
          </div>

          {/* Text with optical center adjustment */}
          <h3 className="text-[10px] font-bold uppercase tracking-[0.8em] text-slate-900 ml-[0.8em] text-center whitespace-nowrap">
            Synchronizing
          </h3>
        </div>
      </div>
    );
  }

  const isArchived = !!branch.deletedAt;
  const isActive = branch.active && !isArchived;

  return (
    <div className="h-full flex flex-col w-[340px] bg-white relative font-sans shadow-[-10px_0_40px_rgba(0,0,0,0.04)] border-l border-slate-100">
      
      {/* --- Inspector Header (Sticky) --- */}
      <div className="p-4 border-b border-black/[0.04] flex justify-between items-center bg-white/80 backdrop-blur-md shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-2 px-1 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
          <i className="bx bx-buildings text-sm text-indigo-500" /> Branch Inspector
        </div>

        <div className="flex gap-1">
          {!isEditing && !isArchived && (
            <button
              onClick={() => setIsEditing(true)}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-all active:scale-90"
              title="Edit Node Profile"
            >
              <i className="bx bx-edit-alt text-base" />
            </button>
          )}

          <button
            onClick={closePanel}
            className="w-8 h-8 rounded-lg hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-500 transition-all active:scale-90"
          >
            <i className="bx bx-x text-xl" />
          </button>
        </div>
      </div>

      {/* --- Scrollable Body --- */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar pb-12">
        
        {/* --- Identity Block --- */}
        <div className="flex items-center gap-5">
          <div className="relative group shrink-0">
            <div className={`w-16 h-16 rounded-[1.25rem] text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-slate-200 ${
              isArchived ? "bg-red-600" : "bg-gradient-to-br from-slate-800 to-slate-950"
            }`}>
              {getInitials(branch.name)}
            </div>
            {isArchived && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-100 border-2 border-white rounded-full flex items-center justify-center text-red-600 shadow-sm">
                <i className="bx bx-archive text-[10px]" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="space-y-2">
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Branch Name"
                  className="w-full text-lg font-bold text-slate-900 bg-slate-50 px-2 py-1 rounded-md outline-none border border-indigo-600/20 focus:border-indigo-600 transition-all"
                />
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Physical Address"
                  className="w-full text-[12px] font-medium text-slate-600 bg-slate-50 px-2 py-1 rounded-md outline-none border border-indigo-600/20 focus:border-indigo-600 transition-all"
                />
              </div>
            ) : (
              <>
                <h3 className="text-xl font-black text-slate-900 leading-tight truncate tracking-tight">{branch.name}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-[12px] font-medium text-slate-400 truncate">{branch.location || "Unmapped Infrastructure"}</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* --- Primary Details --- */}
        <div className="space-y-4 border-t border-black/[0.03] pt-6">
          <PropertyRow
            icon="bx bx-pulse"
            label="Integrity State"
            value={
              <div className={`flex items-center justify-end gap-2 px-2 py-1 rounded-md border text-[10px] font-black uppercase w-fit ml-auto ${
                isArchived ? "bg-red-50 text-red-600 border-red-100" :
                isActive ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"
              }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500 animate-pulse" : isArchived ? "bg-red-500" : "bg-amber-500"}`} />
                {isArchived ? "Archived" : isActive ? "Clear & Active" : "Suspended"}
              </div>
            }
          />

          <PropertyRow
            icon="bx bx-hash"
            label="Registry ID"
            value={
              <span className="font-mono text-[11px] font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded border border-black/[0.03]">
                {branch.id.slice(-8).toUpperCase()}
              </span>
            }
          />
        </div>

        {/* --- Action Suite (Edit Mode) --- */}
        {isEditing && (
          <div className="pt-6 border-t border-black/[0.03]">
            <div className="flex gap-2">
              <button
                onClick={() => handleUpdate({ name: form.name, location: form.location })}
                disabled={isSaving}
                className="flex-1 py-3 bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isSaving ? "Syncing..." : "Commit Context"}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setForm({ name: branch.name || "", location: branch.location || "" });
                }}
                className="flex-1 py-3 bg-white text-slate-500 text-[11px] font-black uppercase tracking-widest rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* --- Operational Logic --- */}
        {!isEditing && !isArchived && (
          <div className="pt-6 border-t border-black/[0.03]">
            <div className="space-y-3">
              <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Operational Logic</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleUpdate({ active: !branch.active })}
                  disabled={isSaving}
                  className={`flex items-center justify-center gap-2 px-3 py-3 text-[11px] font-bold border rounded-xl transition-all active:scale-95 ${
                    branch.active 
                    ? "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100" 
                    : "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100"
                  }`}
                >
                  <i className={`bx ${branch.active ? "bx-pause-circle" : "bx-play-circle"} text-base`} />
                  {branch.active ? "Suspend Node" : "Resume Node"}
                </button>

                <button
                  onClick={() => handleUpdate({ deletedAt: new Date().toISOString() })}
                  disabled={isSaving}
                  className="flex items-center justify-center gap-2 px-3 py-3 text-[11px] font-bold border rounded-xl transition-all active:scale-95 bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200 hover:bg-slate-800"
                >
                  <i className="bx bx-archive-in text-base" />
                  Archive Node
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- Deployed Workforce --- */}
        {!isEditing && (
          <div className="pt-6 border-t border-black/[0.03]">
            <div className="flex items-center justify-between mb-4 px-1">
              <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Deployed Workforce</h4>
              
              {!isArchived && branch.branchAssignments && branch.branchAssignments.length > 0 && (
                <button 
                  onClick={() => setIsReassigning(!isReassigning)}
                  className={`text-[9px] font-black px-3 py-1 rounded-md transition-all ${
                    isReassigning 
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" 
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {isReassigning ? "Cancel Migration" : "Migrate Members"}
                </button>
              )}
            </div>

            {/* Transference Protocol Form */}
            {isReassigning && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-blue-600">Destination Node</label>
                  <select
                    value={targetBranchId}
                    onChange={(e) => setTargetBranchId(e.target.value)}
                    className="w-full bg-white border border-blue-200 rounded-lg px-3 py-2 text-[12px] font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
                  className="w-full bg-blue-600 text-white text-[10px] font-black py-2.5 rounded-lg uppercase tracking-[0.2em] disabled:opacity-40 hover:bg-blue-700 transition-all shadow-sm active:scale-[0.98]"
                >
                  {isSaving ? "Executing..." : `Execute Migration (${selectedPersonnel.length})`}
                </button>
              </div>
            )}

            {/* Personnel List */}
            <div className="flex flex-col gap-2">
              {branch.branchAssignments?.map((ba) => (
                <button 
                  key={ba.id} 
                  onClick={() => isReassigning ? toggleSelection(ba.personnelId) : handlePersonnelClick(ba.personnel)}
                  className={`w-full flex items-center justify-between bg-white border p-3 rounded-xl transition-all group text-left ${
                    isReassigning && selectedPersonnel.includes(ba.personnelId)
                      ? "border-blue-500 bg-blue-50/50 shadow-sm"
                      : "border-black/[0.04] hover:border-blue-500/30 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isReassigning && (
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        selectedPersonnel.includes(ba.personnelId) ? "bg-blue-600 border-blue-600" : "bg-white border-slate-300"
                      }`}>
                        {selectedPersonnel.includes(ba.personnelId) && <i className="bx bx-check text-white text-[12px]" />}
                      </div>
                    )}
                    
                    <div className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-[10px] font-black bg-slate-50 text-slate-500 border border-black/5">
                      {ba.personnel.name?.charAt(0)}
                    </div>

                    <div className="min-w-0">
                      <div className="text-[12px] font-bold text-slate-900 truncate">{ba.personnel.name}</div>
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">{ba.role.replace(/_/g, " ")}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0 pl-2">
                    {ba.isPrimary && (
                      <div className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase tracking-widest border border-emerald-100">Primary</div>
                    )}
                    {!isReassigning && <i className="bx bx-chevron-right text-slate-300 group-hover:text-blue-500 transition-colors" />}
                  </div>
                </button>
              )) || (
                <div className="p-6 border border-dashed border-black/[0.05] rounded-xl text-center bg-slate-50/50">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No Personnel Deployed</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- Historical Telemetry --- */}
        {!isEditing && (
          <div className="pt-6 border-t border-black/[0.03]">
            <div className="flex items-center justify-between mb-5 px-1">
              <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Historical Telemetry</h4>
              <span className="text-[10px] font-bold text-slate-300 font-mono">{displayLogs.length} Events</span>
            </div>
            
            <div className="px-2">
              <div className="border-l-2 border-slate-100 pl-4 space-y-5">
                {displayLogs.length > 0 ? displayLogs.map((log) => {
                  const action = log.action.toUpperCase();
                  const isRed = /DELETE|PURGE|ARCHIVE/.test(action);
                  const dotColor = isRed ? "bg-red-400 ring-red-100" : "bg-slate-300 ring-slate-100";

                  return (
                    <div key={log.id} className="relative group">
                      <span className={`absolute -left-[21px] top-1.5 w-2 h-2 rounded-full border-2 border-white ring-2 ${dotColor}`} />
                      <div className="flex flex-col min-w-0 bg-white border border-slate-100 rounded-lg p-3 hover:shadow-sm transition-all">
                        <div className="flex justify-between items-start gap-2 mb-1.5">
                          <div className="flex flex-col min-w-0">
                            <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight truncate">
                              {log.personnel?.name || log.performedBy || "System Event"}
                            </span>
                            <span className="text-[8px] font-bold uppercase mt-0.5 px-1.5 py-0.5 rounded w-fit tracking-wider bg-slate-50 text-slate-500">
                              {log.action.replace(/_/g, " ")}
                            </span>
                          </div>
                          <span className="text-[9px] font-medium text-slate-400 whitespace-nowrap shrink-0">
                            {new Date(log.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-[11px] font-medium text-slate-600 leading-snug break-words">
                          {log.details || "Registry modification event recorded."}
                        </p>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="text-[10px] text-slate-400 font-medium italic py-2">No historical telemetry found.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- Danger Zone --- */}
        {!isEditing && (
          <div className="pt-8 border-t border-red-50 mt-8">
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
              className="w-full flex items-center justify-center gap-2 px-3 py-4 text-[10px] font-black uppercase tracking-[0.2em] border rounded-2xl transition-all group border-red-100 text-red-500 bg-red-50/50 hover:bg-red-500 hover:text-white"
            >
              <i className="bx bx-trash text-lg group-hover:animate-bounce" /> 
              Purge Account Data
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default BranchDetailsPanel;