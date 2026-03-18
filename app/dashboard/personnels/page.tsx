"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSidePanel } from "@/components/layout/SidePanelContext";
import { ActivityLogsPanel } from "@/components/logs/ActivityLogsPanel";
import { ActivityLog } from "@prisma/client";
import { useAlerts } from "@/components/feedback/AlertProvider";

// Import Refactored Components
import { Personnel, Branch, SummaryStats, PaginatedResponse, ProvisionPayload, UpdatePayload } from "@/components/personnel/types";
import { DetailsPanel } from "@/components/personnel/DetailsPanel";
import { ProvisionPanel } from "@/components/personnel/ProvisionPanel";
import { PersonnelRow } from "@/components/personnel/PersonnelRow";

export default function PersonnelManagementPage() {
  const { dispatch } = useAlerts();
  const { openPanel, closePanel, isOpen } = useSidePanel();

  // Mock Role Check - Replace with your actual Auth logic (e.g., useSession)
  const userRole = "ADMIN"; 
  const isAdmin = userRole === "ADMIN";

  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [summary, setSummary] = useState<SummaryStats>({ total: 0, active: 0, disabled: 0, locked: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleClosePanel = useCallback(() => {
    closePanel();
    setSelectedPersonId(null);
  }, [closePanel]);

  useEffect(() => {
    return () => closePanel();
  }, [closePanel]);

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
        openPanel(<DetailsPanel personnel={updatedPerson} onClose={handleClosePanel} onUpdate={handleUpdate} onDelete={handleDelete} dispatch={dispatch} />);
      }
    } catch (err: unknown) {
      setPersonnelList(originalList);
      dispatch({ kind: "TOAST", type: "ERROR", title: "Update Failed", message: err instanceof Error ? err.message : "Persistence failed." });
    }
  };

  const handleDelete = async (id: string) => {
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
    openPanel(<DetailsPanel personnel={person} onClose={handleClosePanel} onUpdate={handleUpdate} onDelete={handleDelete} dispatch={dispatch} />);
  };

  const handleOpenProvision = () => {
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
          <div className="px-2 truncate">
            <h1 className="text-lg md:text-2xl font-semibold tracking-tight text-slate-900 truncate">Personnel Operations</h1>
            <p className="hidden md:block text-[13px] text-slate-500 mt-1 truncate">Manage global branch access, security parameters, and roles.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={handleOpenLogs} 
              title="Audit Trail"
              className="p-2 md:px-4 md:py-2 text-[12px] font-semibold border rounded-lg transition-colors flex items-center gap-2 bg-white border-black/5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 shadow-sm"
            >
              <i className="bx bx-history text-base md:text-sm" /> 
              <span className="hidden md:inline whitespace-nowrap">Audit Trail</span>
            </button>
            
            {isAdmin && (
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
        
        {/* Stats Summary - Responsive No Wrap */}
        <div className="flex gap-4 md:gap-6 mt-6 pt-4 border-t border-black/5 overflow-x-auto no-scrollbar whitespace-nowrap">
          <div className="flex flex-col shrink-0"><span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Staff</span><span className="text-lg md:text-xl font-medium text-slate-800">{summary.total}</span></div>
          <div className="w-px h-8 bg-black/5 self-center shrink-0" />
          <div className="flex flex-col shrink-0"><span className="text-[9px] md:text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Active Accounts</span><span className="text-lg md:text-xl font-medium text-slate-800">{summary.active}</span></div>
          <div className="w-px h-8 bg-black/5 self-center shrink-0" />
          <div className="flex flex-col shrink-0"><span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Disabled</span><span className="text-lg md:text-xl font-medium text-slate-800">{summary.disabled}</span></div>
          <div className="w-px h-8 bg-black/5 self-center shrink-0" />
          <div className="flex flex-col shrink-0"><span className="text-[9px] md:text-[10px] font-bold text-amber-500 uppercase tracking-widest">Locked Out</span><span className="text-lg md:text-xl font-medium text-slate-800">{summary.locked}</span></div>
        </div>
      </header>

      {/* Search and Filters Bar */}
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

        {/* Mobile Dropdown / Desktop Tabs */}
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

      {/* Table Header - No Wrap */}
      <div className="px-4 md:px-8 py-2 shrink-0 flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-black/[0.04] bg-white overflow-hidden whitespace-nowrap">
        <div className="w-[100px] md:w-[140px] shrink-0 truncate">Staff ID</div>
        <div className="w-[100px] md:w-[160px] shrink-0 truncate">Primary Branch</div>
        <div className="flex-1 min-w-[100px] hidden sm:block truncate">Email Address</div>
        <div className="w-[70px] md:w-[120px] shrink-0 truncate">Role</div>
        <div className="flex-1 min-w-[120px] truncate">Personnel Name</div>
        <div className="w-[70px] md:w-[100px] shrink-0 truncate text-right md:text-left">Access</div>
      </div>

      {/* List Container */}
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