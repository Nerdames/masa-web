// File: @/modules/branches/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef, JSX } from "react";
import { useSession } from "next-auth/react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { 
  Building2, Plus, RefreshCw, Search, 
  CheckCircle2, Loader2, Landmark, 
  ShieldAlert, Globe} from "lucide-react";

import { Branch, BranchSummary, BranchListResponse } from "@/modules/branches/types";
import { BranchDetailsPanel } from "@/modules/branches/components/BranchDetailsPanel";
import { BranchProvisionPanel } from "@/modules/branches/components/BranchProvisionPanel";
import { BranchRow } from "@/modules/branches/components/BranchRow";

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
   Status Filter Component
   ========================================================================== */
function StatusFilters({ summary, filterStatus, setFilterStatus, setSearchTerm }: any) {
  const filterList = [
    { key: "all", label: "TOTAL", count: summary.total },
    { key: "active", label: "ACTIVE", count: summary.active },
    { key: "inactive", label: "INACTIVE", count: summary.inactive },
    { key: "deleted", label: "DELETED", count: summary.deleted },
  ];

  return (
    <div className="flex items-center gap-2 sm:gap-4 md:gap-6 overflow-x-auto whitespace-nowrap scrollbar-hide py-1">
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
              className={`group flex items-center gap-2 transition-all shrink-0 relative border-b-2 border-transparent py-1 ${
                isActive ? "text-blue-600 dark:text-blue-400 !border-blue-600" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-widest">{s.label}</span>
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded tabular-nums ${
                isActive ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-slate-200'
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
export default function BranchManagementPage(): JSX.Element {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();
  const { openPanel, closePanel } = useSidePanel();

  const userRole = session?.user?.role;
  const isOrgOwner = session?.user?.isOrgOwner;
  const hasFullClearance = isOrgOwner || userRole === "ADMIN" || userRole === "DEV";

  const [branches, setBranches] = useState<Branch[]>([]);
  const [summary, setSummary] = useState<BranchSummary>({ total: 0, active: 0, inactive: 0, deleted: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive" | "deleted">("all");
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMounted(true);
    // Time-based theme hardening logic (19:00 - 07:00)
    const applyTimeAwareTheme = () => {
      const hour = new Date().getHours();
      if (hour >= 19 || hour < 7) document.documentElement.classList.add("dark");
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
    setSelectedBranchId(null);
  }, [closePanel]);

  const fetchBranches = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    try {
      const res = await fetch(`/api/branches?search=${encodeURIComponent(searchTerm)}&status=${filterStatus}`, {
        signal: abortControllerRef.current.signal,
      });
      if (!res.ok) throw new Error("Branch Sync Failed");

      const json: BranchListResponse = await res.json();
      setBranches(json.data || []);
      setSummary(json.summary || { total: 0, active: 0, inactive: 0, deleted: 0 });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      dispatch({ kind: "TOAST", type: "ERROR", title: "Sync Failed", message: "Unable to load infrastructure data." });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, filterStatus, dispatch]);

  useEffect(() => {
    const t = setTimeout(() => fetchBranches(), 300);
    return () => {
      clearTimeout(t);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [fetchBranches]);

  const handleOpenDetails = (branch: Branch) => {
    setSelectedBranchId(branch.id);
    openPanel(
      <BranchDetailsPanel
        branchId={branch.id}
        onClose={handleClosePanel}
        onRefresh={fetchBranches}
        dispatch={useAlerts}
      />
    );
  };

  const handleOpenProvision = () => {
    if (!hasFullClearance) return;
    setSelectedBranchId(null);
    openPanel(
      <BranchProvisionPanel onClose={handleClosePanel} onRefresh={fetchBranches} dispatch={useAlerts} />
    );
  };

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans relative overflow-hidden">
      
      {isLoading && branches.length === 0 && (
        <div className="absolute inset-0 flex flex-col justify-center items-center bg-white/40 dark:bg-slate-950/40 backdrop-blur-sm z-[200]">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
          <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-slate-500">Synchronizing Infrastructure</p>
        </div>
      )}

      {/* Header */}
<header className="w-full flex flex-col bg-white dark:bg-slate-900 border-b border-black/[0.04] dark:border-slate-800 shrink-0 sticky top-0 z-[30] transition-colors">
  <div className="w-full flex items-center justify-between px-4 py-2 h-14">
    {/* Branding Section */}
    <div className="flex items-center gap-3">
      <div className="p-1.5 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-lg shadow-sm">
        <Building2 className="w-4 h-4 text-white" />
      </div>
      <h1 className="text-[16px] font-bold tracking-tight text-slate-900 dark:text-white">
        Branches Operations
      </h1>
    </div>

    {/* Actions Section */}
    <div className="flex items-center gap-2 sm:gap-3">
      {/* Search Input */}
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

      {/* Refresh Button */}
      <button
        onClick={() => fetchBranches()}
        disabled={isLoading}
        className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-blue-500" : ""}`} />
      </button>

      {/* Primary Action */}
      {hasFullClearance && (
        <button
          onClick={handleOpenProvision}
          className="flex h-8 px-3 bg-slate-900 dark:bg-blue-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-md hover:opacity-90 transition-all items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Deploy Branch</span>
        </button>
      )}
    </div>
  </div>
</header>

      <div className="flex-1 overflow-y-auto scrollbar-hide pb-12">
        {/* Statistics Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-4 lg:px-6 py-4">
          <StatCard title="Total Network" value={summary.total} icon={Globe} color="blue" />
          <StatCard title="Active Nodes" value={summary.active} icon={CheckCircle2} color="emerald" />
          <StatCard title="Maintenance" value={summary.inactive} icon={ShieldAlert} color="amber" />
          <StatCard title="Decommissioned" value={summary.deleted} icon={Landmark} color="red" />
        </section>

        {/* Main Viewport */}
        <main className="px-4 lg:px-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200/60 dark:border-slate-800 overflow-hidden flex flex-col min-h-[400px]">
            
            {/* Toolbar / Filters */}
            <div className="flex flex-col md:flex-row md:items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800 gap-4">
               <StatusFilters 
                summary={summary} 
                filterStatus={filterStatus} 
                setFilterStatus={setFilterStatus} 
                setSearchTerm={setSearchTerm} 
              />
              {mounted && !isOnline && (
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 rounded-full border border-amber-100 dark:border-amber-900/30 w-fit">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                  <span className="text-[9px] font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">Local Buffer</span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-200/80 dark:border-slate-700/80 backdrop-blur-sm sticky top-0 z-10">
                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">Node ID</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">Branch Identity</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">Geographic Location</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">Infrastructure Type</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">Performance (YTD)</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                  {branches.length === 0 && !isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-24 text-center">
                        <div className="flex flex-col items-center opacity-30">
                          <Building2 className="w-12 h-12 mb-4" />
                          <p className="text-[10px] font-bold uppercase tracking-[0.4em]">Zero infrastructure records</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    branches.map((branch) => (
                      <BranchRow
                        key={branch.id}
                        branch={branch}
                        isSelected={selectedBranchId === branch.id}
                        onClick={() => handleOpenDetails(branch)}
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