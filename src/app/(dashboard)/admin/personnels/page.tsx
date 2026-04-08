"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

import { Personnel, Branch, SummaryStats, PaginatedResponse, ProvisionPayload, UpdatePayload } from "@/modules/personnel/components/types";
import { PersonnelDetailsPanel } from "@/modules/personnel/components/PersonnelDetailsPanel";
import { ProvisionPanel } from "@/modules/personnel/components/ProvisionPanel";
import { PersonnelRow } from "@/modules/personnel/components/PersonnelRow";

/* ==========================================================================
   Filter Component (Refined Status Filter)
   ========================================================================== */
function StatusFilters({ summary, filterStatus, setFilterStatus, setSearchTerm }: any) {
  const filterList = [
    { key: "all", label: "TOTAL", count: summary.total },
    { key: "active", label: "ACTIVE", count: summary.active },
    { key: "disabled", label: "DISABLED", count: summary.disabled },
    { key: "locked", label: "LOCKED", count: summary.locked },
  ];

  return (
    <div className="flex items-center gap-2 sm:gap-4 md:gap-6 overflow-x-auto whitespace-nowrap scrollbar-hide">
      {filterList.map((s, idx) => {
        const isActive = filterStatus === s.key;
        return (
          <React.Fragment key={s.key}>
            {idx > 0 && <div className="w-px h-3 bg-black/10 self-center shrink-0" />}
            <button
              onClick={() => {
                setFilterStatus(s.key);
                setSearchTerm("");
              }}
              className={`group flex items-center gap-2 transition-all shrink-0 relative border-b-2 min-h-[30px] ${
                isActive ? "text-blue-600 border-blue-600" : "text-slate-400 border-transparent hover:text-slate-600"
              }`}
            >
              <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest">
                {s.label}
              </span>
              <span className={`
                min-w-[34px] text-center px-1.5 py-0.5 rounded-md text-[9px] md:text-[10px] font-bold tabular-nums transition-colors
                ${isActive ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"}
              `}>
                {s.count}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function PersonnelManagementPage() {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();
  const { openPanel, closePanel, isOpen } = useSidePanel();

  const userRole = session?.user?.role;
  const isOrgOwner = session?.user?.isOrgOwner;
  const hasFullClearance = isOrgOwner || userRole === "ADMIN" || userRole === "DEV";
  const canProvision = hasFullClearance;
  const canDelete = hasFullClearance;

  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [summary, setSummary] = useState<SummaryStats>({ total: 0, active: 0, disabled: 0, locked: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);
    const handleStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", handleStatus);
    window.addEventListener("offline", handleStatus);
    return () => {
      window.removeEventListener("online", handleStatus);
      window.removeEventListener("offline", handleStatus);
    };
  }, []);

  /* TOTAL PANEL DISMISSAL 
     Forces side panel to close entirely rather than resetting to a default view.
  */
  const handleClosePanel = useCallback(() => {
    closePanel(); 
    setSelectedPersonId(null);
  }, [closePanel]);

  const fetchPersonnel = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    setIsLoading(true);
    try {
      const res = await fetch(`/api/personnels?search=${encodeURIComponent(searchTerm)}&status=${filterStatus}`, {
        signal: abortControllerRef.current.signal,
      });
      if (!res.ok) throw new Error("Sync Failed");
      const json: PaginatedResponse = await res.json();
      setPersonnelList(json.data || []);
      setSummary(json.summary || { total: 0, active: 0, disabled: 0, locked: 0 });
      setBranches(json.branchSummaries || []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      dispatch({ kind: "TOAST", type: "ERROR", title: "Sync Failed", message: "Unable to load data." });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, filterStatus, dispatch]);

  useEffect(() => {
    const delay = setTimeout(() => fetchPersonnel(), 300);
    return () => clearTimeout(delay);
  }, [fetchPersonnel]);

  const handleUpdate = async (id: string, payload: UpdatePayload) => {
    const originalList = [...personnelList];
    setPersonnelList((prev) => prev.map((p) => (p.id === id ? { ...p, ...payload } : p)));
    try {
      const res = await fetch("/api/personnels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update");
      await fetchPersonnel();
    } catch (err) {
      setPersonnelList(originalList);
      dispatch({ kind: "TOAST", type: "ERROR", title: "Update Failed", message: "Persistence failed." });
    }
  };

  const handleDelete = async (id: string) => {
    if (!canDelete || !confirm("Are you sure?")) return;
    try {
      const res = await fetch(`/api/personnels?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Deletion failed");
      handleClosePanel();
      await fetchPersonnel();
    } catch (error) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Action Failed", message: "Deactivation failed." });
    }
  };

  const handleOpenDetails = (person: Personnel) => {
    setSelectedPersonId(person.id);
    openPanel(
      <PersonnelDetailsPanel
        personnel={person}
        onClose={handleClosePanel}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        dispatch={dispatch}
      />
    );
  };

  const handleOpenProvision = () => {
    if (!canProvision) return;
    setSelectedPersonId(null);
    openPanel(<ProvisionPanel branches={branches} onClose={handleClosePanel} onCreate={async () => { await fetchPersonnel(); }} dispatch={dispatch} />);
  };

  return (
    <div className="flex flex-col h-full w-full bg-white relative z-0 overflow-hidden font-sans">
      <header className="w-full flex flex-col bg-white border-b border-black/[0.04] shrink-0 sticky top-0 z-[100]">
        <div className="w-full flex items-center justify-between gap-4 px-4 py-3 min-w-0">
          <div className="min-w-0 flex-1 md:flex-none">
            <h1 className="truncate text-[18px] font-semibold tracking-tight text-slate-900">
              Personnel Operations
            </h1>
          </div>

          <div className="hidden md:flex flex-1 justify-center px-4 overflow-hidden">
            <StatusFilters summary={summary} filterStatus={filterStatus} setFilterStatus={setFilterStatus} setSearchTerm={setSearchTerm} />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:relative sm:block">
              <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="REGISTRY_SEARCH..."
                className="bg-slate-100 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-32 md:w-64 rounded-lg focus:ring-1 focus:ring-black transition-all outline-none"
              />
            </div>
            
            <button onClick={() => fetchPersonnel()} className="p-2 text-[12px] font-semibold border rounded-lg transition-colors flex items-center justify-center bg-white border-black/5 text-slate-500 hover:bg-slate-50 shadow-sm shrink-0">
              <i className={`bx bx-refresh text-lg ${isLoading ? "bx-spin" : ""}`} />
            </button>

            {canProvision && (
              <button
                onClick={handleOpenProvision}
                className="hidden md:flex h-8 px-4 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-blue-600 transition-all items-center gap-2"
              >
                <i className="bx bx-plus" />
                <span>Provision</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Filter Layer */}
        <div className="md:hidden bg-white/95 px-4 py-3 border-t border-black/[0.02]">
          <StatusFilters summary={summary} filterStatus={filterStatus} setFilterStatus={setFilterStatus} setSearchTerm={setSearchTerm} />
        </div>
      </header>

      {/* BODY AREA - PADDING REMOVED */}
      <div className="flex-1 overflow-y-auto scrollbar-hide bg-white">
        <div className="w-full">
          
          {mounted && !isOnline && (
            <div className="py-2 flex items-center justify-center gap-3 bg-amber-50 border-b border-amber-100">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">
                Local Buffer Active
              </span>
            </div>
          )}

          {isLoading && personnelList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-48">
              <div className="relative mb-10">
                <div className="h-10 w-10 border-[1px] border-slate-100 rounded-full" />
                <div className="absolute top-0 h-10 w-10 border-t-[1px] border-blue-600 rounded-full animate-spin" />
              </div>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.8em] text-slate-900 ml-[0.8em]">
                Synchronizing
              </h3>
            </div>
          ) : personnelList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-48 opacity-30">
              <i className="bx bx-group text-4xl mb-4" />
              <p className="text-[10px] font-bold uppercase tracking-[0.4em]">Zero personnel records</p>
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE HEADERS */}
              <div className="hidden md:flex items-center px-4 md:px-8 py-3 bg-slate-50/50 border-b border-black/[0.03] sticky top-0 z-10 backdrop-blur-sm">
                {/* Staff ID - Matches PersonnelRow w-[120px] + gap-2 */}
                <div className="w-[120px] shrink-0 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Staff ID
                </div>

                {/* Name - Matches PersonnelRow flex-[1.5] */}
                <div className="flex-[1.5] min-w-[150px] text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Name
                </div>

                {/* Email Address - Matches PersonnelRow flex-1 */}
                <div className="flex-1 min-w-[150px] text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Email Address
                </div>

                {/* Role - Matches PersonnelRow w-[110px] */}
                <div className="w-[110px] shrink-0 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Role
                </div>

                {/* Primary Branch - Matches PersonnelRow w-[160px] */}
                <div className="w-[160px] shrink-0 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Primary Branch
                </div>

                {/* Status - Matches PersonnelRow w-[90px] + flex justify-end */}
                <div className="w-[90px] shrink-0 text-right text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Status
                </div>
              </div>

              <div className="space-y-px">
                {personnelList.map((person) => (
                  <PersonnelRow
                    key={person.id}
                    personnel={person}
                    isSelected={selectedPersonId === person.id}
                    onClick={() => handleOpenDetails(person)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}