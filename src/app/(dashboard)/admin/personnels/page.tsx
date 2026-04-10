"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

import { 
  Personnel, 
  Branch, 
  SummaryStats, 
  PaginatedResponse, 
  UpdatePayload 
} from "@/modules/personnel/components/types";
import { PersonnelDetailsPanel } from "@/modules/personnel/components/PersonnelDetailsPanel";
import { ProvisionPanel } from "@/modules/personnel/components/ProvisionPanel";
import { PersonnelRow } from "@/modules/personnel/components/PersonnelRow";

/* ==========================================================================
   Filter Component (Strictly Typed)
   ========================================================================== */
interface StatusFiltersProps {
  summary: SummaryStats;
  filterStatus: string;
  setFilterStatus: (status: string) => void;
  setSearchTerm: (term: string) => void;
}

function StatusFilters({ summary, filterStatus, setFilterStatus, setSearchTerm }: StatusFiltersProps) {
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

/* ==========================================================================
   Main Management Page
   ========================================================================== */
export default function PersonnelManagementPage() {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();
  const { openPanel, closePanel } = useSidePanel();

  // RBAC Checks
  const userRole = session?.user?.role;
  const isOrgOwner = session?.user?.isOrgOwner;
  const hasFullClearance = isOrgOwner || userRole === "ADMIN" || userRole === "DEV";
  const canProvision = hasFullClearance;
  const canDelete = hasFullClearance;

  // State Management
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

  const handleClosePanel = useCallback(() => {
    closePanel();
    setSelectedPersonId(null);
  }, [closePanel]);

  const fetchPersonnel = useCallback(async () => {
    // Abort previous request to prevent race conditions during typing
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams({
        search: searchTerm,
        status: filterStatus,
      });

      const res = await fetch(`/api/personnels?${queryParams.toString()}`, {
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Registry Sync Failed");
      }

      const json: PaginatedResponse = await res.json();
      setPersonnelList(json.data || []);
      setSummary(json.summary || { total: 0, active: 0, disabled: 0, locked: 0 });
      setBranches(json.branchSummaries || []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      dispatch({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Connection Error", 
        message: err instanceof Error ? err.message : "Unable to reach the Fortress Registry." 
      });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, filterStatus, dispatch]);

  // Debounced search logic
  useEffect(() => {
    const delay = setTimeout(() => fetchPersonnel(), 400);
    return () => clearTimeout(delay);
  }, [fetchPersonnel]);

  const handleUpdate = async (id: string, payload: UpdatePayload) => {
    const originalList = [...personnelList];
    
    // Optimistic UI Update
    setPersonnelList((prev) => prev.map((p) => (p.id === id ? { ...p, ...payload } : p)));

    try {
      const res = await fetch("/api/personnels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Handle specific Fortress API error codes
        if (res.status === 403) throw new Error("Permission Denied: Insufficient Clearance.");
        if (res.status === 400) throw new Error(data.error || "Validation Failed: Check data integrity.");
        throw new Error(data.message || "Persistence Failed.");
      }

      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Record Secured", message: "Personnel data updated successfully." });
      await fetchPersonnel(); // Sync to confirm database state
    } catch (err) {
      setPersonnelList(originalList); // Revert on failure
      dispatch({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Update Blocked", 
        message: err instanceof Error ? err.message : "The operation was rejected by the server." 
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!canDelete || !confirm("CRITICAL: Deactivating this record will terminate all active sessions. Proceed?")) return;
    
    try {
      const res = await fetch(`/api/personnels?id=${id}`, { method: "DELETE" });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Deactivation failed");
      }

      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Access Revoked", message: "Personnel has been successfully deactivated." });
      handleClosePanel();
      await fetchPersonnel();
    } catch (error) {
      dispatch({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Action Refused", 
        message: error instanceof Error ? error.message : "The system refused to deactivate the record." 
      });
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
        dispatch={useAlerts}
      />
    );
  };

const handleOpenProvision = () => {
    if (!canProvision) return;
    setSelectedPersonId(null);
    openPanel(
      <ProvisionPanel 
        branches={branches} 
        onClose={handleClosePanel} 
        // FIX: Add the fetch logic here
        onCreate={async (payload) => { 
          const res = await fetch("/api/personnels", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.message || "Provisioning failed");
          }

          // Refresh the registry and close the panel on success
          await fetchPersonnel(); 
          handleClosePanel();
        }} 
        dispatch={useAlerts} 
      />
    );
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
            <StatusFilters 
              summary={summary} 
              filterStatus={filterStatus} 
              setFilterStatus={setFilterStatus} 
              setSearchTerm={setSearchTerm} 
            />
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
            
            <button 
              onClick={() => fetchPersonnel()} 
              disabled={isLoading}
              className="p-2 text-[12px] font-semibold border rounded-lg transition-colors flex items-center justify-center bg-white border-black/5 text-slate-500 hover:bg-slate-50 shadow-sm shrink-0 disabled:opacity-50"
            >
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

        <div className="md:hidden bg-white/95 px-4 py-3 border-t border-black/[0.02]">
          <StatusFilters 
            summary={summary} 
            filterStatus={filterStatus} 
            setFilterStatus={setFilterStatus} 
            setSearchTerm={setSearchTerm} 
          />
        </div>
      </header>

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
              <div className="hidden md:flex items-center px-4 md:px-8 py-3 bg-slate-50/50 border-b border-black/[0.03] sticky top-0 z-10 backdrop-blur-sm">
                <div className="w-[120px] shrink-0 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Staff ID
                </div>
                <div className="flex-[1.5] min-w-[150px] text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Name
                </div>
                <div className="flex-1 min-w-[150px] text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Email Address
                </div>
                <div className="w-[110px] shrink-0 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Role
                </div>
                <div className="w-[160px] shrink-0 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Primary Branch
                </div>
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