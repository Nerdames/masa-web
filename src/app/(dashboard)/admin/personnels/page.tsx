"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { ActivityLogsPanel } from "@/modules/audit/components/ActivityLogsPanel";
import { ActivityLog } from "@prisma/client";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

import { Personnel, Branch, SummaryStats, PaginatedResponse, ProvisionPayload, UpdatePayload } from "@/modules/personnel/components/types";
import { PersonnelDetailsPanel } from "@/modules/personnel/components/PersonnelDetailsPanel";
import { ProvisionPanel } from "@/modules/personnel/components/ProvisionPanel";
import { PersonnelRow } from "@/modules/personnel/components/PersonnelRow";

export default function PersonnelManagementPage() {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();
  const { openPanel, closePanel, resetToDefault, isOpen } = useSidePanel();

  const userRole = session?.user?.role;
  const isOrgOwner = session?.user?.isOrgOwner;
  
  const hasFullClearance = isOrgOwner || userRole === "ADMIN" || userRole === "DEV";
  const canProvision = hasFullClearance;
  const canDelete = hasFullClearance;

  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [summary, setSummary] = useState<SummaryStats>({ total: 0, active: 0, disabled: 0, locked: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const abortControllerRef = useRef<AbortController | null>(null);

  // FIX: Use resetToDefault to return to previous view without closing panel
  const handleClosePanel = useCallback(() => {
    resetToDefault();
    setSelectedPersonId(null);
  }, [resetToDefault]);

  // FIX: Dependency array must be empty to only fire on actual Page unmount
  useEffect(() => {
    return () => closePanel();
  }, []); 

  const fetchPersonnel = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    try {
      const res = await fetch(`/api/personnels?search=${encodeURIComponent(searchTerm)}&status=${filterStatus}`, {
        signal: abortControllerRef.current.signal
      });
      if (!res.ok) throw new Error("Sync Failed");
      const json: PaginatedResponse = await res.json();
      setPersonnelList(json.data || []);
      setSummary(json.summary || { total: 0, active: 0, disabled: 0, locked: 0 });
      setBranches(json.branchSummaries || []);
      setLogs(json.recentLogs || []);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      dispatch({ kind: "TOAST", type: "ERROR", title: "Sync Failed", message: "Unable to load data." });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, filterStatus, dispatch]);

  useEffect(() => {
    const delay = setTimeout(() => fetchPersonnel(), 300);
    return () => {
      clearTimeout(delay);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [fetchPersonnel]);

  const handleCreate = async (payload: ProvisionPayload) => {
    if (!canProvision) return;
    const res = await fetch("/api/personnels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to provision");
    await fetchPersonnel();
  };

  const handleUpdate = async (id: string, payload: UpdatePayload) => {
    const originalList = [...personnelList];
    setPersonnelList(prev => prev.map(p => p.id === id ? { ...p, ...payload } : p));
    try {
      const res = await fetch("/api/personnels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update");
      await fetchPersonnel();
      const updatedPerson = { ...(personnelList.find(p => p.id === id)), ...data };
      if (isOpen && selectedPersonId === id) {
        openPanel(<PersonnelDetailsPanel personnel={updatedPerson} onClose={handleClosePanel} onUpdate={handleUpdate} onDelete={handleDelete} dispatch={dispatch} />);
      }
    } catch (err: unknown) {
      setPersonnelList(originalList);
      dispatch({ kind: "TOAST", type: "ERROR", title: "Update Failed", message: err instanceof Error ? err.message : "Persistence failed." });
    }
  };

  const handleDelete = async (id: string) => {
    if (!canDelete) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Access Denied", message: "You do not have clearance to delete personnel." });
      return;
    }

    if (!confirm("Are you absolutely sure you want to delete this account? This action will softly deactivate it.")) return;
    try {
      const res = await fetch(`/api/personnels?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to deactivate account");
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Deactivated", message: "Personnel record soft-deleted successfully." });
      handleClosePanel();
      await fetchPersonnel();
    } catch (error: unknown) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Action Failed", message: error instanceof Error ? error.message : "Deletion failed." });
    }
  };

  const handleOpenDetails = (person: Personnel) => {
    setSelectedPersonId(person.id);
    openPanel(<PersonnelDetailsPanel personnel={person} onClose={handleClosePanel} onUpdate={handleUpdate} onDelete={handleDelete} dispatch={dispatch} />);
  };

  const handleOpenProvision = () => {
    if (!canProvision) return;
    setSelectedPersonId(null);
    openPanel(<ProvisionPanel branches={branches} onClose={handleClosePanel} onCreate={handleCreate} dispatch={dispatch} />);
  };

  const handleOpenLogs = () => {
    setSelectedPersonId(null);
    openPanel(<ActivityLogsPanel logs={logs} onClose={handleClosePanel} />);
  };

  return (
    <div className="flex flex-col h-full w-full bg-white relative z-0 overflow-hidden">
<header className="px-4 py-4 shrink-0 border-b border-black/[0.04] bg-white">
  <div className="flex items-center justify-between gap-4">
    {/* Title: single-line, truncates, responsive size */}
    <div className="px-2 min-w-0 flex-1">
      <h1
        className="block w-full truncate text-[14px] sm:text-[15px] md:text-[18px] lg:text-2xl font-semibold tracking-tight text-slate-900 leading-tight"
        title="Personnel Operations"
        aria-label="Personnel Operations"
      >
        Personnel Operations
      </h1>
    </div>

    {/* Actions: icons always visible; labels appear md+ */}
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={handleOpenLogs}
        title="Audit Trail"
        className="p-2 md:px-4 md:py-2 text-[12px] font-semibold border rounded-lg transition-colors flex items-center gap-2 bg-white border-black/5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 shadow-sm"
      >
        <i className="bx bx-history text-base md:text-sm" />
        <span className="hidden md:inline whitespace-nowrap">Audit Trail</span>
      </button>

      {canProvision && (
        <button
          onClick={handleOpenProvision}
          title="Provision Access"
          className="p-2 md:px-5 md:py-2 bg-slate-900 text-white text-[12px] font-semibold rounded-lg shadow-sm hover:bg-slate-800 transition-all flex items-center gap-2"
        >
          <i className="bx bx-plus text-base md:text-sm" />
          <span className="hidden md:inline whitespace-nowrap">Provision Access</span>
        </button>
      )}
    </div>
  </div>

  {/* Single-line summary — forced single row, truncates labels and values */}
  <div
    aria-label="summary"
    className="flex items-center gap-3 md:gap-4 mt-6 pt-4 border-t border-black/5 overflow-hidden whitespace-nowrap"
    style={{ minWidth: 0 }}
  >
    {/* Total */}
    <div className="flex items-center gap-3 shrink-0 min-w-0">
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] md:text-[11px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[72px] md:max-w-[120px]">
          Total
        </span>
        <span className="text-sm md:text-lg font-medium text-slate-800 truncate max-w-[84px] md:max-w-[140px]">
          {summary.total}
        </span>
      </div>
    </div>

    <div className="w-px h-8 bg-black/5 self-center" />

    {/* Active */}
    <div className="flex items-center gap-3 shrink-0 min-w-0">
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] md:text-[11px] font-bold text-emerald-500 uppercase tracking-widest truncate max-w-[72px] md:max-w-[120px]">
          Active
        </span>
        <span className="text-sm md:text-lg font-medium text-slate-800 truncate max-w-[84px] md:max-w-[140px]">
          {summary.active}
        </span>
      </div>
    </div>

    <div className="w-px h-8 bg-black/5 self-center" />

    {/* Disabled */}
    <div className="flex items-center gap-3 shrink-0 min-w-0">
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] md:text-[11px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[72px] md:max-w-[120px]">
          Disabled
        </span>
        <span className="text-sm md:text-lg font-medium text-slate-800 truncate max-w-[84px] md:max-w-[140px]">
          {summary.disabled}
        </span>
      </div>
    </div>

    <div className="w-px h-8 bg-black/5 self-center" />

    {/* Locked */}
    <div className="flex items-center gap-3 shrink-0 min-w-0">
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] md:text-[11px] font-bold text-amber-500 uppercase tracking-widest truncate max-w-[72px] md:max-w-[120px]">
          Locked
        </span>
        <span className="text-sm md:text-lg font-medium text-slate-800 truncate max-w-[84px] md:max-w-[140px]">
          {summary.locked}
        </span>
      </div>
    </div>
  </div>

  {/* Small helper CSS to ensure truncation and prevent overflow in extreme cases */}
  <style jsx>{`
    header { min-width: 0; }
    /* Slight scale down on very narrow screens to avoid overflow while keeping single-line */
    @media (max-width: 340px) {
      header > div:first-child { transform-origin: left center; transform: scale(0.96); }
    }
  `}</style>
</header>


      <div className="px-4 md:px-10 py-3 shrink-0 flex items-center gap-3 bg-slate-50/50 border-b border-black/[0.04]">
        <div className="relative flex-1 md:flex-none md:w-80 shrink-0">
          <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base" />
          <input 
            type="text" 
            placeholder="Search..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
            className="w-full pl-9 pr-4 py-1.5 bg-white border border-black/5 rounded-md text-[12px] outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/30 transition-all truncate" 
          />
        </div>
        
        <div className="h-4 w-px bg-black/10 shrink-0" />

        <div className="flex items-center shrink-0">
          <div className="md:hidden">
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-white border border-black/5 text-[11px] font-semibold px-2 py-1.5 rounded-md outline-none text-slate-700 capitalize"
            >
              {["all", "active", "locked", "disabled"].map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <div className="hidden md:flex gap-1">
            {["all", "active", "locked", "disabled"].map(status => (
              <button 
                key={status} 
                onClick={() => setFilterStatus(status)} 
                className={`px-3 py-1 rounded text-[11px] font-semibold capitalize transition-colors whitespace-nowrap ${filterStatus === status ? "bg-white border shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-800 hover:bg-black/5"}`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-2 shrink-0 flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-black/[0.04] bg-white overflow-hidden whitespace-nowrap">
        <div className="w-[100px] md:w-[140px] shrink-0 truncate">Staff ID</div>
        <div className="w-[100px] md:w-[160px] shrink-0 truncate">Primary Branch</div>
        <div className="flex-1 min-w-[100px] hidden sm:block truncate">Email Address</div>
        <div className="w-[70px] md:w-[120px] shrink-0 truncate">Role</div>
        <div className="flex-1 min-w-[120px] truncate">Personnel Name</div>
        <div className="w-[70px] md:w-[100px] shrink-0 truncate text-right md:text-left">Access</div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white relative">
        {isLoading && personnelList.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10"><i className="bx bx-loader-alt animate-spin text-3xl text-blue-500" /></div>
        ) : personnelList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-50 p-6"><i className="bx bx-group text-4xl text-black/20" /><p className="text-[12px] font-bold tracking-widest uppercase">No Personnel Found</p></div>
        ) : (
          personnelList.map(person => (
            <PersonnelRow
              key={person.id}
              personnel={person}
              isSelected={selectedPersonId === person.id}
              onClick={() => handleOpenDetails(person)}
            />
          ))
        )}
      </div>
    </div>
  );
}