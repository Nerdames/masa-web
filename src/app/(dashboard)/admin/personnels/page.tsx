"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { 
  Search, Plus, RefreshCw, Users, Lock, 
  UserMinus, CheckCircle2, Loader2, Mail, 
  Shield, MapPin, Fingerprint, Filter
} from "lucide-react";

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
   Stat Card Component
   ========================================================================== */
function StatCard({ title, value, icon: Icon, color }: { title: string; value: number | string; icon: any; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-600 dark:text-blue-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
  };
  const iconColorMap: Record<string, string> = {
    blue: "text-blue-200 dark:text-blue-900/40",
    emerald: "text-emerald-200 dark:text-emerald-900/40",
    red: "text-red-200 dark:text-red-900/40",
    amber: "text-amber-200 dark:text-amber-900/40",
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-4 lg:p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-colors">
      <p className={`text-[10px] font-bold ${colorMap[color] || 'text-slate-500'} uppercase tracking-wider`}>{title}</p>
      <div className="flex items-end justify-between mt-2">
        <h3 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">{value}</h3>
        <Icon className={`w-5 h-5 ${iconColorMap[color]}`} />
      </div>
    </div>
  );
}

/* ==========================================================================
   Filter Component (Original Logic + New Fidelity)
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
    <div className="flex items-center gap-3 md:gap-6 overflow-x-auto whitespace-nowrap py-1">
      {filterList.map((s, idx) => {
        const isActive = filterStatus === s.key;
        return (
          <React.Fragment key={s.key}>
            {idx > 0 && <div className="w-px h-3 bg-slate-200 dark:bg-slate-800 self-center shrink-0" />}
            <button
              onClick={() => {
                setFilterStatus(s.key);
                setSearchTerm("");
              }}
              className={`flex items-center gap-2 transition-all shrink-0 relative ${
                isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-widest">{s.label}</span>
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded tabular-nums ${
                isActive ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}>
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

  // State
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

  // Initial Sync & Time-Aware Theme logic
  useEffect(() => {
    setMounted(true);
    const applyTimeAwareTheme = () => {
      const hour = new Date().getHours();
      if (hour >= 19 || hour < 7) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    };
    applyTimeAwareTheme();
    
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
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams({ search: searchTerm, status: filterStatus });
      const res = await fetch(`/api/personnels?${queryParams.toString()}`, { signal: controller.signal });
      
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
      dispatch({ kind: "TOAST", type: "ERROR", title: "Connection Error", message: err instanceof Error ? err.message : "Unable to reach the Fortress Registry." });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, filterStatus, dispatch]);

  useEffect(() => {
    const delay = setTimeout(() => fetchPersonnel(), 400);
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
      if (!res.ok) {
        if (res.status === 403) throw new Error("Permission Denied: Insufficient Clearance.");
        if (res.status === 400) throw new Error(data.error || "Validation Failed: Check data integrity.");
        throw new Error(data.message || "Persistence Failed.");
      }
      
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Record Secured", message: "Personnel data updated successfully." });
      await fetchPersonnel();
    } catch (err) {
      setPersonnelList(originalList);
      dispatch({ kind: "TOAST", type: "ERROR", title: "Update Blocked", message: err instanceof Error ? err.message : "The operation was rejected." });
    }
  };

  const handleDelete = async (id: string) => {
    if (!canDelete || !confirm("CRITICAL: Deactivating this record will terminate all active sessions. Proceed?")) return;
    try {
      const res = await fetch(`/api/personnels?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Deactivation failed");
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Access Revoked", message: "Personnel has been successfully deactivated." });
      handleClosePanel();
      await fetchPersonnel();
    } catch (error) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Action Refused", message: error instanceof Error ? error.message : "The system refused to deactivate the record." });
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
          await fetchPersonnel(); 
          handleClosePanel();
        }} 
        dispatch={useAlerts} 
      />
    );
  };

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans relative overflow-hidden transition-colors duration-300">
      
      {isLoading && personnelList.length === 0 && (
        <div className="absolute inset-0 flex flex-col justify-center items-center bg-white/40 dark:bg-slate-950/40 backdrop-blur-sm z-[200]">
          <Loader2 className="w-10 h-10 text-blue-600 dark:text-blue-500 animate-spin mb-4" />
          <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-slate-500">Synchronizing Registry</p>
        </div>
      )}

      {/* Header */}
      <header className="w-full flex flex-col bg-white dark:bg-slate-900 border-b border-black/[0.04] dark:border-slate-800 shrink-0 sticky top-0 z-[30]">
        <div className="w-full flex items-center justify-between px-4 py-2 h-14">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-blue-600 to-indigo-500 rounded-lg shadow-sm">
              <Users className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[16px] font-bold tracking-tight text-slate-900 dark:text-white">Personnel Operations</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="REGISTRY_SEARCH..."
                className="bg-slate-100/80 dark:bg-slate-800/80 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-48 lg:w-64 rounded-md focus:ring-1 focus:ring-blue-500 outline-none dark:text-white transition-colors"
              />
            </div>
            <button onClick={() => fetchPersonnel()} className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors">
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-blue-500" : ""}`} />
            </button>
            {canProvision && (
              <button
                onClick={handleOpenProvision}
                className="flex h-8 px-3 bg-blue-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-blue-700 transition-all items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Provision Staff</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar pb-12 bg-white dark:bg-slate-950">
        {/* Statistics Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-4 lg:px-6 py-4">
          <StatCard title="Total Workforce" value={summary.total} icon={Users} color="blue" />
          <StatCard title="Active Protocol" value={summary.active} icon={CheckCircle2} color="emerald" />
          <StatCard title="Locked Accounts" value={summary.locked} icon={Lock} color="amber" />
          <StatCard title="Deactivated" value={summary.disabled} icon={UserMinus} color="red" />
        </section>

        {/* Main Viewport */}
        <main className="px-4 lg:px-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200/60 dark:border-slate-800 overflow-hidden flex flex-col min-h-[400px]">
            
            {/* Toolbar / Filters */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
               <StatusFilters 
                summary={summary} 
                filterStatus={filterStatus} 
                setFilterStatus={setFilterStatus} 
                setSearchTerm={setSearchTerm} 
              />
              {!isOnline && (
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 rounded-full border border-amber-100 dark:border-amber-900/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                  <span className="text-[9px] font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">Local Buffer</span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200/80 dark:border-slate-700/80">
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Staff Identification</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Communication Node</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Assigned Role</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Operational Branch</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Clearance Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                  {personnelList.length === 0 && !isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-24 text-center">
                        <div className="flex flex-col items-center opacity-30">
                          <Users className="w-12 h-12 mb-4" />
                          <p className="text-[10px] font-bold uppercase tracking-[0.4em]">Zero personnel records</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    personnelList.map((person) => (
                      <PersonnelRow
                        key={person.id}
                        personnel={person}
                        isSelected={selectedPersonId === person.id}
                        onClick={() => handleOpenDetails(person)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}