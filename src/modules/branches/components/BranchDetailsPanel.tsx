// File: @/modules/branches/components/BranchDetailsPanel.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Branch, UpdateBranchPayload } from "./types";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";

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
  const { closePanel } = useSidePanel();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ name: "", location: "" });
  const [logs, setLogs] = useState<ActivityLogDTO[]>([]);

  // Load Node Data
  useEffect(() => {
    let mounted = true;
    const load = async () => {
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
        dispatch({ kind: "TOAST", type: "ERROR", title: "Sync Failed", message: "Could not retrieve node telemetry." });
        closePanel();
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [branchId, dispatch, closePanel]);

  // Operational Handlers
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
      dispatch({ kind: "TOAST", type: "ERROR", title: "Update Error", message: "Network or permission barrier detected." });
    } finally {
      setIsSaving(false);
    }
  }, [branchId, dispatch, onRefresh]);

  const displayLogs = useMemo(() => {
    return [...logs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [logs]);

  if (isLoading || !branch) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-12">
        <i className="bx bx-loader-alt animate-spin text-3xl text-slate-300 mb-4" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Synchronizing Registry...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* --- Sub Header --- */}
      <div className="px-6 py-5 border-b border-black/[0.04] flex items-center justify-between sticky top-0 bg-white z-10">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 mb-0.5">Node_Inspector</div>
          <h2 className="text-[13px] font-bold text-slate-900 flex items-center gap-2">
            Registry: <span className="font-mono text-slate-400">{branch.id.slice(-8).toUpperCase()}</span>
          </h2>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1.5 rounded-lg bg-slate-50 border border-black/5 text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-all flex items-center gap-2"
          >
            <i className="bx bx-edit-alt" /> Edit Node
          </button>
        )}
      </div>

      {/* --- Scrollable Body --- */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 bg-[#FAFAFC]">
        
        {/* Profile Card */}
        <section className="p-6 bg-white border border-black/[0.04] rounded-2xl shadow-sm">
          <div className="flex items-start gap-5">
            <div className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-xl font-black shadow-inner ${branch.deletedAt ? "bg-red-50 text-red-600" : "bg-slate-900 text-white"}`}>
              {getInitials(branch.name)}
            </div>
            <div className="min-w-0 flex-1">
              {!isEditing ? (
                <>
                  <h3 className="text-lg font-bold text-slate-900 truncate tracking-tight">{branch.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <i className="bx bx-map text-slate-400" />
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">{branch.location || "Unmapped Infrastructure"}</p>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Node Label</label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-slate-50 border border-black/5 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                      placeholder="Node Name"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Geospatial Tag</label>
                    <input
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      className="w-full bg-slate-50 border border-black/5 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                      placeholder="Location / Address"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button 
                      onClick={() => handleUpdate({ name: form.name, location: form.location })}
                      disabled={isSaving}
                      className="flex-1 bg-blue-600 text-white text-[10px] font-black py-3 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
                    >
                      {isSaving ? "SYNCING..." : "COMMIT CHANGES"}
                    </button>
                    <button onClick={() => setIsEditing(false)} className="px-6 bg-slate-100 text-slate-600 text-[10px] font-black py-3 rounded-xl hover:bg-slate-200 transition-all">
                      CANCEL
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Assigned Workforce */}
        <section>
          <div className="flex items-center justify-between mb-4 px-1">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Deployed_Workforce</h4>
            <span className="text-[10px] font-black bg-white border border-black/5 text-slate-500 px-3 py-1 rounded-full">
              {branch.branchAssignments?.length || 0} Members
            </span>
          </div>
          <div className="grid gap-2">
            {branch.branchAssignments?.map((ba) => (
              <div key={ba.id} className="flex items-center justify-between bg-white border border-black/[0.03] p-4 rounded-2xl hover:border-black/10 hover:shadow-sm transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-[11px] font-black text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                    {ba.personnel.name?.charAt(0)}
                  </div>
                  <div>
                    <div className="text-[13px] font-bold text-slate-900">{ba.personnel.name}</div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{ba.role.replace(/_/g, " ")}</div>
                  </div>
                </div>
                {ba.isPrimary && (
                  <div className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase tracking-widest border border-emerald-100">Primary</div>
                )}
              </div>
            )) || (
              <div className="p-8 border-2 border-dashed border-black/[0.03] rounded-3xl text-center">
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">No Personnel Deployed</p>
              </div>
            )}
          </div>
        </section>

        {/* Operational Logic */}
        <section className="space-y-4">
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Operational_Logic</h4>
          
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleUpdate({ active: !branch.active })}
              disabled={isSaving}
              className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm ${
                branch.active 
                ? "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100" 
                : "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100"
              }`}
            >
              {branch.active ? "Suspend" : "Resume"}
            </button>
            <button
              onClick={() => handleUpdate({ deletedAt: new Date().toISOString() })}
              disabled={isSaving}
              className="py-4 rounded-2xl bg-white text-slate-400 border border-black/5 text-[10px] font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all shadow-sm"
            >
              Archive Node
            </button>
          </div>
        </section>

        {/* Historical Telemetry (Activity Logs) */}
        <section>
          <div className="flex items-center justify-between mb-6 px-1">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Registry_Events</h4>
            <div className="text-[9px] font-bold text-slate-300">{displayLogs.length} Records</div>
          </div>
          <div className="relative pl-6 border-l border-black/[0.05] space-y-8 ml-3">
            {displayLogs.length > 0 ? displayLogs.map((log) => (
              <div key={log.id} className="relative group">
                <span className="absolute -left-[29px] top-1 w-3 h-3 rounded-full bg-white border-2 border-slate-200 group-hover:border-blue-500 transition-colors" />
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[10px] font-black text-slate-800 uppercase tracking-tighter">
                    {log.action} <span className="text-slate-300 mx-1">•</span> {log.personnel?.name || log.performedBy || "System"}
                  </p>
                  <p className="text-[9px] font-mono text-slate-400 bg-white px-2 py-0.5 rounded border border-black/5 shadow-sm">
                    {new Date(log.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <p className="text-[11px] font-medium text-slate-500 mt-1 leading-relaxed">{log.details || "Registry modification event recorded."}</p>
              </div>
            )) : (
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest italic">No events recorded</p>
            )}
          </div>
        </section>

        {/* --- Danger Zone --- */}
        <div className="pt-10 border-t border-black/[0.04]">
          <button
            onClick={async () => {
              if (!confirm(`CRITICAL: Purge ${branch.name}? This action is permanent and destroys all node metadata.`)) return;
              try {
                const res = await fetch(`/api/branches/${branchId}/purge`, { method: "DELETE" });
                if (res.ok) {
                  dispatch({ kind: "TOAST", type: "SUCCESS", title: "Data Purged", message: "Node record destroyed." });
                  closePanel();
                  await onRefresh();
                }
              } catch (err) {
                dispatch({ kind: "TOAST", type: "ERROR", title: "Purge Failed", message: "Security override prevented destruction." });
              }
            }}
            className="w-full flex items-center justify-center gap-3 px-3 py-5 text-[10px] font-black uppercase tracking-[0.2em] border border-red-100 text-red-500 bg-red-50/30 rounded-3xl hover:bg-red-500 hover:text-white transition-all group shadow-sm shadow-red-500/5"
          >
            <i className="bx bx-trash-alt text-lg group-hover:animate-pulse" /> 
            Permanently Purge Node
          </button>
        </div>

      </div>
    </div>
  );
}

export default BranchDetailsPanel;