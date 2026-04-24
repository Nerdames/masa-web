"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { 
  Search, Plus, RefreshCw, Users, Lock, 
  UserMinus, CheckCircle2, Loader2, Filter,
  Download, Container
} from "lucide-react";

import { 
  Personnel, 
  Branch, 
  SummaryStats, 
  PaginatedResponse,
  UpdatePayload 
} from "@/modules/personnel/components/types";
import { ProvisionPanel } from "@/modules/personnel/components/ProvisionPanel";
import { PersonnelDetailsPanel } from "@/modules/personnel/components/PersonnelDetailsPanel";
import { PersonnelRow } from "@/modules/personnel/components/PersonnelRow";
import { ExportModal } from "@/core/components/shared/ExportModal";

// Define the columns for the Export Modal
const PERSONNEL_COLUMNS = [
  { id: "id", label: "Staff ID" },
  { id: "firstName", label: "First Name" },
  { id: "lastName", label: "Last Name" },
  { id: "email", label: "Email Address" },
  { id: "role", label: "Role" },
  { id: "branchName", label: "Branch" },
  { id: "status", label: "Status" },
  { id: "createdAt", label: "Date Joined" },
];

/* ==========================================================================
   Stat Card Component
   ========================================================================== */
function StatCard({ title, value, icon: Icon, color }: { title: string; value: number | string; icon: any; color: string }) {
  const cMap: Record<string, string> = { 
    blue: "text-blue-600 dark:text-blue-400", 
    emerald: "text-emerald-600 dark:text-emerald-400", 
    amber: "text-amber-600 dark:text-amber-400", 
    red: "text-red-600 dark:text-red-400" 
  };
  
  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-colors">
      <p className={`text-[10px] font-bold ${cMap[color] || 'text-slate-500'} uppercase tracking-wider`}>{title}</p>
      <div className="flex items-end justify-between mt-2">
        <h3 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">{value}</h3>
        <Icon className="w-5 h-5 text-slate-300 dark:text-slate-700" />
      </div>
    </div>
  );
}

export default function PersonnelManagementPage() {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();
  const { openPanel, closePanel } = useSidePanel();

  // RBAC & Authorization
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
  const [isOnline, setIsOnline] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Connectivity Monitor
  useEffect(() => {
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
      const queryParams = new URLSearchParams({ 
        search: searchTerm, 
        status: filterStatus,
        page: currentPage.toString(),
        limit: pageSize.toString()
      });
      
      const res = await fetch(`/api/personnels?${queryParams.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error("Registry Sync Failed");
      
      const json: PaginatedResponse = await res.json();
      setPersonnelList(json.data || []);
      setSummary(json.summary || { total: 0, active: 0, disabled: 0, locked: 0 });
      setBranches(json.branchSummaries || []);
      setTotalPages(json.pagination?.totalPages || 1);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      dispatch({ kind: "TOAST", type: "ERROR", title: "Sync Failed", message: "Unable to reach the Fortress Registry." });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, filterStatus, currentPage, pageSize, dispatch]);

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
      if (!res.ok) throw new Error("Persistence Failed");
      
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Record Secured", message: "Personnel updated." });
      await fetchPersonnel();
    } catch (err) {
      setPersonnelList(originalList);
      dispatch({ kind: "TOAST", type: "ERROR", title: "Update Blocked", message: "Operation rejected." });
    }
  };

  const handleDelete = async (id: string) => {
    if (!canDelete || !confirm("CRITICAL: Deactivating this record will terminate sessions. Proceed?")) return;
    try {
      const res = await fetch(`/api/personnels?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Deactivation failed");
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Access Revoked", message: "Staff deactivated." });
      handleClosePanel();
      await fetchPersonnel();
    } catch (error) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Action Refused", message: "System refused deactivation." });
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
          if (!res.ok) throw new Error("Provisioning failed");
          await fetchPersonnel(); 
          handleClosePanel();
        }} 
        dispatch={dispatch} 
      />
    );
  };

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans relative overflow-hidden transition-colors">
      {isLoading && (
        <div className="absolute inset-0 flex justify-center items-center bg-white/40 dark:bg-slate-950/40 backdrop-blur-sm z-[200]">
          <Loader2 className="w-12 h-12 text-indigo-600 dark:text-indigo-500 animate-spin" />
        </div>
      )}

      {/* Industrial Header */}
      <header className="w-full flex flex-col bg-white dark:bg-slate-900 border-b border-black/[0.04] dark:border-slate-800 shrink-0 sticky top-0 z-[40]">
        <div className="w-full flex items-center justify-between px-4 py-2 min-w-0 h-14">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-indigo-600 rounded-lg shadow-sm">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-[16px] font-bold tracking-tight font-mono uppercase">Personnel Registry</h1>
              <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">Operational Staff & Access Audit</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:relative sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text" 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                placeholder="SEARCH STAFF..."
                className="bg-slate-100 dark:bg-slate-800 border-none py-1.5 pl-8 pr-4 text-[11px] font-bold font-mono w-48 md:w-64 rounded-md outline-none uppercase placeholder:text-slate-400"
              />
            </div>
            <button onClick={() => fetchPersonnel()} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors">
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-indigo-500" : ""}`} />
            </button>
            <button onClick={() => setShowFilters(!showFilters)} className={`p-1.5 rounded-md ${showFilters ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              <Filter className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setIsExportOpen(true)} 
              className="hidden md:flex h-8 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold uppercase rounded-md items-center gap-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            {canProvision && (
              <button 
                onClick={handleOpenProvision}
                className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold uppercase rounded-md flex items-center gap-1.5 shadow-sm shadow-indigo-500/20 transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" /> PROVISION STAFF
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="w-full px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap gap-4 items-center animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status Filter</span>
              <select 
                value={filterStatus} 
                onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }} 
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold py-1 px-2 uppercase outline-none cursor-pointer"
              >
                <option value="all">ALL STATUSES</option>
                <option value="active">ACTIVE ONLY</option>
                <option value="disabled">DEACTIVATED</option>
                <option value="locked">LOCKED</option>
              </select>
            </div>
            {!isOnline && (
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 rounded-full border border-amber-100 dark:border-amber-900/30 ml-auto">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                  <span className="text-[9px] font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">Local Buffer</span>
                </div>
            )}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col pb-12">
        <main className="flex-1 px-4 lg:px-6 flex flex-col gap-6 pt-4">
          
          {/* Aggregated Stats */}
          <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Workforce" value={summary.total} icon={Users} color="blue" />
            <StatCard title="Active Protocol" value={summary.active} icon={CheckCircle2} color="emerald" />
            <StatCard title="Locked Accounts" value={summary.locked} icon={Lock} color="amber" />
            <StatCard title="Deactivated" value={summary.disabled} icon={UserMinus} color="red" />
          </section>

          {/* Audit Table */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex flex-col min-h-[500px] bg-white dark:bg-slate-900 shadow-sm">
            <div className="overflow-x-auto custom-scrollbar flex-1">
              <table className="w-full text-left whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Staff Identification</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Communication</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Role</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Branch</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Clearance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {personnelList.length === 0 && !isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-24 text-center text-slate-400 text-[11px] font-bold uppercase tracking-widest">
                        <div className="flex flex-col items-center gap-3">
                          <Container className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-1" />
                          Registry Empty: No personnel records found.
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

            {/* Pagination Controls */}
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <select 
                  value={pageSize} 
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }} 
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold py-1 px-1.5 uppercase outline-none cursor-pointer"
                >
                  {[25, 50, 100].map((l) => <option key={l} value={l}>{l} Rows</option>)}
                </select>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest hidden sm:inline-block">
                  Total Entries: {summary.total}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} 
                  disabled={currentPage <= 1} 
                  className="px-3 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-50 uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Prev
                </button>
                <div className="px-3 text-xs font-mono font-bold text-slate-600 dark:text-slate-300">
                  {currentPage} / {totalPages}
                </div>
                <button 
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} 
                  disabled={currentPage >= totalPages} 
                  className="px-3 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-50 uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      <ExportModal 
        isOpen={isExportOpen} 
        onClose={() => setIsExportOpen(false)} 
        columns={PERSONNEL_COLUMNS}
        onExport={() => {
            dispatch({ kind: "TOAST", type: "SUCCESS", title: "Report Ready", message: "Exporting filtered registry..." });
            setIsExportOpen(false);
        }}
        title="Export Personnel Registry"
      />
    </div>
  );
}