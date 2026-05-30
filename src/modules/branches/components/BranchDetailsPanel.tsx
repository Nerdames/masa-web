"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
  X, Maximize2, Minimize2, Save, Loader2, 
  Building2, MapPin, Activity, Users, RefreshCcw, 
  History, Trash2, ShieldAlert, CheckCircle2, AlertCircle,
  Network
} from "lucide-react";
import { useSidePanel } from "@/shared/components/layout/SidePanelContext";
import { useAlerts } from "@/shared/components/feedback/AlertProvider";
import { usePermission } from "@/shared/hooks/usePermission";
import { Resource } from "@prisma/client";
import { getInitials } from "@/shared/utils";

/* -------------------------------------------------------------------------- */
/* TYPES & INTERFACES (Synchronized with MASA Schema)                         */
/* -------------------------------------------------------------------------- */

type ActivityLogDTO = {
  id: string;
  action: string;
  critical?: boolean;
  createdAt: string | Date;
  details?: string;
  performedBy?: string;
  personnel?: { name?: string; email?: string } | null;
};

// Fortified DTO aligned with new API return types
interface BranchDTO {
  id: string;
  name: string;
  location: string | null;
  active: boolean;
  deletedAt: string | null;
  salesTotal: string;
  expensesTotal: string;
  operationalStatus: {
    hasOpenPOS: boolean;
    activeStaffCount: number;
  };
  branchAssignments: Array<{
    id: string;
    role: string;
    isPrimary: boolean;
    personnelId: string;
    personnel: {
      id: string;
      name: string | null;
      email: string;
      role: string;
    };
  }>;
  recentLogs?: ActivityLogDTO[];
}

interface BranchDetailsPanelProps {
  branchId: string;
  onRefresh: () => Promise<void>;
  onClose?: () => void; 
}

/* -------------------------------------------------------------------------- */
/* CONSTANTS & STYLES (Enterprise Visibility Fix)                             */
/* -------------------------------------------------------------------------- */

const inputClass = `
  w-full border border-slate-200 dark:border-slate-700 rounded-md text-xs p-2 
  bg-white dark:bg-slate-950 text-slate-900 dark:text-white 
  focus:ring-1 focus:ring-blue-500 outline-none transition-all 
  placeholder:text-slate-400 disabled:opacity-50 disabled:bg-slate-50
`;

const labelClass = "block text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1";

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export function BranchDetailsPanel({ branchId, onRefresh, onClose }: BranchDetailsPanelProps) {
  const { isFullScreen, toggleFullScreen, closePanel } = useSidePanel();
  const handleClose = onClose || closePanel;
  
  const { dispatch } = useAlerts();
  const { canEdit, canDelete } = usePermission();

  // Permission Logic [cite: 693]
  const canUpdateBranch = canEdit(Resource.BRANCH);
  const canDeleteBranch = canDelete(Resource.BRANCH);

  // State Management
  const [branch, setBranch] = useState<BranchDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logs, setLogs] = useState<ActivityLogDTO[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    location: "",
    active: true,
  });

  // Transference Protocol State
  const [isReassigning, setIsReassigning] = useState(false);
  const [selectedPersonnel, setSelectedPersonnel] = useState<string[]>([]);
  const [targetBranchId, setTargetBranchId] = useState("");
  const [availableBranches, setAvailableBranches] = useState<{ id: string; name: string }[]>([]);

  /* --- Data Hydration --- */
  const loadBranchData = useCallback(async (mounted = true) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/branches/${branchId}`);
      if (!res.ok) throw new Error("Telemetry unreachable.");
      const data = await res.json();
      
      if (!mounted) return;
      
      setBranch(data);
      setFormData({ 
        name: data.name || "", 
        location: data.location || "",
        active: data.active
      });
      setLogs(data.recentLogs || []);
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Sync Failed", message: err.message });
      handleClose();
    } finally {
      if (mounted) setIsLoading(false);
    }
  }, [branchId, dispatch, handleClose]);

  useEffect(() => {
    let mounted = true;
    loadBranchData(mounted);
    return () => { mounted = false; };
  }, [loadBranchData]);

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

  /* --- Handlers --- */
  const handleUpdate = async (e?: React.FormEvent, overridePayload?: any) => {
    if (e) e.preventDefault();
    if (!canUpdateBranch) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Access Denied", message: "Insufficient permissions." });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = overridePayload || {
        id: branchId,
        name: formData.name.trim(),
        location: formData.location.trim(),
        active: formData.active,
      };

      const res = await fetch("/api/branches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      
      if (!res.ok) throw new Error(result.error || "Update failed.");

      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Infrastructure Updated", message: "Node parameters synchronized." });
      await loadBranchData();
      await onRefresh();
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Update Blocked", message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkReassign = async () => {
    if (!targetBranchId || selectedPersonnel.length === 0) return;
    
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/branches/${branchId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personnelIds: selectedPersonnel, newBranchId: targetBranchId }),
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Protocol handshake rejected.");
      
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Transference Complete", message: `Migrated ${selectedPersonnel.length} personnel to destination node.` });
      
      setIsReassigning(false);
      await loadBranchData();
      await onRefresh();
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Transfer Failed", message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePurge = async () => {
    if (!canDeleteBranch) return;
    if (!confirm(`CRITICAL: Are you sure you want to completely decommission ${branch?.name}? This action is permanent.`)) return;
    
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/branches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: branchId, deletedAt: new Date().toISOString() })
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Security override active.");

      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Node Decommissioned", message: "Branch record destroyed." });
      await onRefresh();
      handleClose();
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Purge Failed", message: err.message });
      setIsSubmitting(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedPersonnel((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const displayLogs = useMemo(() => {
    return [...logs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [logs]);

  /* --- Loading State --- */
  if (isLoading || !branch) {
    return (
      <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-2xl relative items-center justify-center">
        <div className="relative mb-6 flex items-center justify-center">
          <div className="h-10 w-10 border border-slate-200 dark:border-slate-800 rounded-full" />
          <div className="absolute top-0 h-10 w-10 border-t border-blue-600 rounded-full animate-spin" />
        </div>
        <h3 className="text-[10px] font-bold uppercase tracking-[0.4em] text-slate-500">Synchronizing...</h3>
      </div>
    );
  }

  const isArchived = !!branch.deletedAt;

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-2xl relative overflow-hidden">
      
      {/* --- Header --- */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${isArchived ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"}`}>
            <Network className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Branch Inspector
            </h2>
            <p className="text-[8px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">
              {isArchived ? "Decommissioned Node" : "Infrastructure Management"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={toggleFullScreen} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button type="button" onClick={handleClose} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* --- Body --- */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6">
        
        {!canUpdateBranch && (
          <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-[9px] font-medium text-amber-800 dark:text-amber-400">
              <span className="font-bold uppercase">View Only:</span> Insufficient permissions to modify branch infrastructure.
            </p>
          </div>
        )}

        {isArchived && (
          <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-[9px] font-medium text-red-800 dark:text-red-400">
              <span className="font-bold uppercase">Decommissioned:</span> This node is archived and removed from active routing.
            </p>
          </div>
        )}

        <form id="branch-form" onSubmit={handleUpdate} className="space-y-6">
          
          {/* Section 1: Core Identity */}
          <section className="space-y-3">
            <h3 className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1">
              Core Identity
            </h3>
            <div className="flex items-center gap-4 mb-4">
               <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shadow-lg ${
                 isArchived ? "bg-red-600 text-white" : "bg-gradient-to-br from-slate-800 to-slate-950 text-white"
               }`}>
                 {getInitials(branch.name)}
               </div>
               <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                      ID: {branch.id.slice(-8).toUpperCase()}
                    </span>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                      isArchived ? "bg-red-50 text-red-600 border-red-200" :
                      branch.active ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-amber-50 text-amber-600 border-amber-200"
                    }`}>
                      {isArchived ? "Archived" : branch.active ? "Active" : "Suspended"}
                    </span>
                  </div>
               </div>
            </div>

            <div className={`grid gap-3 ${isFullScreen ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
              <div className="space-y-1">
                <label className={labelClass}>Branch Name *</label>
                <div className="relative">
                  <Building2 className="absolute left-2 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <input 
                    disabled={!canUpdateBranch || isArchived} 
                    type="text" 
                    required 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    className={`${inputClass} pl-8 font-bold`} 
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Location</label>
                <div className="relative">
                  <MapPin className="absolute left-2 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <input 
                    disabled={!canUpdateBranch || isArchived} 
                    type="text" 
                    value={formData.location} 
                    onChange={e => setFormData({...formData, location: e.target.value})} 
                    className={`${inputClass} pl-8`} 
                    placeholder="Physical address or coordinates"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Operational Analytics */}
          <section className="space-y-3">
            <h3 className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1">
              Live Telemetry & Financials
            </h3>
            <div className={`grid gap-3 ${isFullScreen ? "grid-cols-1 md:grid-cols-4" : "grid-cols-2"}`}>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Volume</p>
                <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                  ₦ {parseFloat(branch.salesTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total OPEX</p>
                <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                  ₦ {parseFloat(branch.expensesTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">POS Status</p>
                  <p className="text-xs font-black text-slate-900 dark:text-white">
                    {branch.operationalStatus?.hasOpenPOS ? "Active Sessions" : "All Closed"}
                  </p>
                </div>
                <Activity className={`w-4 h-4 ${branch.operationalStatus?.hasOpenPOS ? "text-emerald-500" : "text-slate-400"}`} />
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Workforce</p>
                  <p className="text-xs font-black text-slate-900 dark:text-white">
                    {branch.operationalStatus?.activeStaffCount || 0} Deployed
                  </p>
                </div>
                <Users className="w-4 h-4 text-blue-500" />
              </div>
            </div>
          </section>
        </form>

        {/* Section 3: Transference Protocol */}
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1">
            <h3 className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Deployed Workforce
            </h3>
            {!isArchived && canUpdateBranch && branch.branchAssignments.length > 0 && (
              <button 
                type="button"
                onClick={() => setIsReassigning(!isReassigning)}
                className={`text-[8px] font-bold uppercase tracking-widest flex items-center gap-1 px-2 py-0.5 rounded transition-all ${
                  isReassigning ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                <RefreshCcw className="w-2.5 h-2.5" />
                {isReassigning ? "Cancel Migration" : "Migrate"}
              </button>
            )}
          </div>

          {isReassigning && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-400">Destination Node</label>
                <select
                  value={targetBranchId}
                  onChange={(e) => setTargetBranchId(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-blue-200 dark:border-blue-800 rounded-md px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select Target Branch...</option>
                  {availableBranches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleBulkReassign}
                disabled={isSubmitting || selectedPersonnel.length === 0 || !targetBranchId}
                className="w-full bg-blue-600 text-white text-[9px] font-bold py-2 rounded uppercase tracking-widest disabled:opacity-50 hover:bg-blue-700 transition-all flex justify-center items-center gap-1.5"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                Execute Migration ({selectedPersonnel.length})
              </button>
            </div>
          )}

          <div className={`grid gap-2 ${isFullScreen ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"}`}>
            {branch.branchAssignments.length > 0 ? branch.branchAssignments.map((ba) => (
              <div 
                key={ba.id} 
                onClick={() => isReassigning && toggleSelection(ba.personnel.id)}
                className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                  isReassigning ? "cursor-pointer hover:border-blue-300" : ""
                } ${
                  isReassigning && selectedPersonnel.includes(ba.personnel.id)
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isReassigning && (
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                      selectedPersonnel.includes(ba.personnel.id) ? "bg-blue-600 border-blue-600" : "bg-white border-slate-300"
                    }`}>
                      {selectedPersonnel.includes(ba.personnel.id) && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                    </div>
                  )}
                  <div className="w-6 h-6 shrink-0 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[9px] font-black text-slate-500 border border-slate-200 dark:border-slate-700">
                    {ba.personnel.name?.charAt(0) || "@"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{ba.personnel.name || ba.personnel.email}</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest truncate">{ba.role.replace(/_/g, " ")}</p>
                  </div>
                </div>
                {ba.isPrimary && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[8px] font-black uppercase tracking-widest border border-emerald-100 dark:border-emerald-800">
                    Primary
                  </span>
                )}
              </div>
            )) : (
              <div className="col-span-full p-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-center bg-slate-50/50 dark:bg-slate-900/50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No Personnel Deployed</p>
              </div>
            )}
          </div>
        </section>

        {/* Section 4: Historical Telemetry */}
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1">
            <h3 className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <History className="w-3 h-3" /> Event Telemetry
            </h3>
            <span className="text-[9px] font-bold text-slate-400 font-mono">{displayLogs.length} Records</span>
          </div>
          <div className="space-y-2 border-l-2 border-slate-100 dark:border-slate-800 pl-3 ml-1">
            {displayLogs.length > 0 ? displayLogs.map((log) => (
              <div key={log.id} className="relative">
                <span className="absolute -left-[17px] top-1.5 w-2 h-2 rounded-full border-2 border-white dark:border-slate-900 bg-slate-300 dark:bg-slate-600" />
                <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded p-2">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      {log.action.replace(/_/g, " ")}
                    </span>
                    <span className="text-[8px] font-medium text-slate-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-snug">
                    {log.details || log.description || "System registry modification."}
                  </p>
                  <p className="text-[8px] font-medium text-slate-400 mt-1 uppercase">
                    Actor: {log.personnel?.name || log.performedBy || "System"}
                  </p>
                </div>
              </div>
            )) : (
              <p className="text-[9px] text-slate-400 italic">No telemetry recorded.</p>
            )}
          </div>
        </section>

      </div>

      {/* --- Footer / Actions --- */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center shrink-0">
        <div className="flex gap-2">
          {canDeleteBranch && !isArchived && (
            <button 
              type="button" 
              onClick={handlePurge}
              disabled={isSubmitting} 
              className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors disabled:opacity-50 group"
              title="Decommission Branch"
            >
              <Trash2 className="w-4 h-4 group-hover:animate-pulse" />
            </button>
          )}
          {canUpdateBranch && !isArchived && (
             <button
              type="button"
              onClick={() => handleUpdate(undefined, { id: branchId, active: !formData.active })}
              disabled={isSubmitting}
              className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded transition-all disabled:opacity-50 ${
                formData.active 
                  ? "text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200"
                  : "text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
              }`}
             >
               {formData.active ? "Suspend" : "Resume"}
             </button>
          )}
        </div>
        
        <div className="flex gap-2">
          <button type="button" onClick={handleClose} disabled={isSubmitting} className="px-3 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-800 dark:hover:text-slate-300 transition-colors">
            CLose
          </button>
          {canUpdateBranch && !isArchived && (
            <button 
              type="submit" 
              form="branch-form" 
              disabled={isSubmitting} 
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-[9px] font-bold uppercase tracking-widest rounded-md hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Commit Changes
            </button>
          )}
        </div>
      </div>
      
    </div>
  );
}