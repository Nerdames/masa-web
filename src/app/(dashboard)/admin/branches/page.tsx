// File: @/modules/branches/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { ActivityLogsPanel } from "@/modules/audit/components/ActivityLogsPanel";

import { Branch, BranchSummary, BranchListResponse } from "./types";
import { BranchDetailsPanel } from "@/modules/branches/components/BranchDetailsPanel";
import { BranchProvisionPanel } from "@/modules/branches/components/BranchProvisionPanel";
import { BranchRow } from "@/modules/branches/components/BranchRow";

/**
 * BranchManagementPage
 * Refactored to match Personnel Operations high-fidelity UI.
 */
export default function BranchManagementPage(): JSX.Element {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();
  const { openPanel, closePanel, resetToDefault } = useSidePanel();

  const userRole = session?.user?.role;
  const isOrgOwner = session?.user?.isOrgOwner;
  const hasFullClearance = isOrgOwner || userRole === "ADMIN" || userRole === "DEV";

  const [branches, setBranches] = useState<Branch[]>([]);
  const [summary, setSummary] = useState<BranchSummary>({ total: 0, active: 0, inactive: 0, deleted: 0 });
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive" | "deleted">("all");

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleClosePanel = useCallback(() => {
    resetToDefault();
    setSelectedBranchId(null);
  }, [resetToDefault]);

  // Sync panel closure on page unmount
  useEffect(() => {
    return () => closePanel();
  }, [closePanel]);

  const fetchBranches = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    try {
      const res = await fetch(`/api/branches?search=${encodeURIComponent(searchTerm)}&status=${filterStatus}`, {
        signal: abortControllerRef.current.signal,
      });
      if (!res.ok) throw new Error("Infrastructure Sync Failed");

      const json: BranchListResponse = await res.json();
      setBranches(json.data || []);
      setSummary(json.summary || { total: 0, active: 0, inactive: 0, deleted: 0 });
      setLogs(json.recentLogs || []);
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
        dispatch={dispatch}
      />
    );
  };

  const handleOpenProvision = () => {
    if (!hasFullClearance) return;
    setSelectedBranchId(null);
    openPanel(
      <BranchProvisionPanel onClose={handleClosePanel} onRefresh={fetchBranches} dispatch={dispatch} />
    );
  };

  const handleOpenLogs = () => {
    setSelectedBranchId(null);
    openPanel(<ActivityLogsPanel logs={logs} onClose={handleClosePanel} />);
  };

  return (
    <div className="flex flex-col h-full w-full bg-white relative z-0 overflow-hidden">
      <header className="px-4 py-4 shrink-0 border-b border-black/[0.04] bg-white">
        <div className="flex items-center justify-between gap-4">
          <div className="px-2 min-w-0 flex-1">
            <h1
              className="block w-full truncate text-[14px] sm:text-[15px] md:text-[18px] lg:text-2xl font-semibold tracking-tight text-slate-900 leading-tight"
              title="Infrastructure"
            >
              Infrastructure
            </h1>
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

            {hasFullClearance && (
              <button
                onClick={handleOpenProvision}
                title="Deploy Node"
                className="p-2 md:px-5 md:py-2 bg-blue-600 text-white text-[12px] font-semibold rounded-lg shadow-sm hover:bg-blue-700 transition-all flex items-center gap-2"
              >
                <i className="bx bx-plus text-base md:text-sm" />
                <span className="hidden md:inline whitespace-nowrap">Deploy Node</span>
              </button>
            )}
          </div>
        </div>

        {/* Horizontal Summary Bar */}
        <div
          aria-label="summary"
          className="flex items-center gap-3 md:gap-4 mt-6 pt-4 border-t border-black/5 overflow-hidden whitespace-nowrap"
          style={{ minWidth: 0 }}
        >
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

          <div className="flex items-center gap-3 shrink-0 min-w-0">
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] md:text-[11px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[72px] md:max-w-[120px]">
                Inactive
              </span>
              <span className="text-sm md:text-lg font-medium text-slate-800 truncate max-w-[84px] md:max-w-[140px]">
                {summary.inactive}
              </span>
            </div>
          </div>

          <div className="w-px h-8 bg-black/5 self-center" />

          <div className="flex items-center gap-3 shrink-0 min-w-0">
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] md:text-[11px] font-bold text-rose-500 uppercase tracking-widest truncate max-w-[72px] md:max-w-[120px]">
                Deleted
              </span>
              <span className="text-sm md:text-lg font-medium text-slate-800 truncate max-w-[84px] md:max-w-[140px]">
                {summary.deleted}
              </span>
            </div>
          </div>
        </div>

        <style jsx>{`
          header { min-width: 0; }
          @media (max-width: 340px) {
            header > div:first-child { transform-origin: left center; transform: scale(0.96); }
          }
        `}</style>
      </header>

      {/* Filter Row */}
      <div className="px-4 md:px-10 py-3 shrink-0 flex items-center gap-3 bg-slate-50/50 border-b border-black/[0.04]">
        <div className="relative flex-1 md:flex-none md:w-80 shrink-0">
          <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base" />
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-white border border-black/5 rounded-md text-[12px] outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/30 transition-all truncate"
          />
        </div>

        <div className="h-4 w-px bg-black/10 shrink-0" />

        <div className="flex items-center shrink-0">
          <div className="md:hidden">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="bg-white border border-black/5 text-[11px] font-semibold px-2 py-1.5 rounded-md outline-none text-slate-700 capitalize"
            >
              {["all", "active", "inactive", "deleted"].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <div className="hidden md:flex gap-1">
            {["all", "active", "inactive", "deleted"].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status as any)}
                className={`px-3 py-1 rounded text-[11px] font-semibold capitalize transition-colors whitespace-nowrap ${
                  filterStatus === status
                    ? "bg-white border shadow-sm text-slate-800"
                    : "text-slate-500 hover:text-slate-800 hover:bg-black/5"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* --- Node Registry Table Header (Hidden on Mobile) --- */}
      <div className="hidden sm:flex px-4 md:px-8 py-2 shrink-0 items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-black/[0.04] bg-white overflow-hidden whitespace-nowrap">
        <div className="w-[90px] md:w-[120px] shrink-0 truncate">Node ID</div>
        <div className="flex-1 min-w-[120px] truncate">Branch Name</div>
        
        {/* Location remains hidden until desktop (md) to prioritize Name/Revenue on tablets */}
        <div className="w-[100px] md:w-[180px] hidden md:block shrink-0 truncate">Location</div>
        
        <div className="w-[70px] text-center shrink-0 truncate">Staff</div>
        <div className="w-[100px] md:w-[140px] text-right shrink-0 truncate">Total Revenue</div>
        <div className="w-[70px] text-right shrink-0 truncate">Status</div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white relative">
        {isLoading && branches.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
            <i className="bx bx-loader-alt animate-spin text-3xl text-blue-500" />
          </div>
        ) : branches.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-50 p-6">
            <i className="bx bx-buildings text-4xl text-black/20" />
            <p className="text-[12px] font-bold tracking-widest uppercase">No Infrastructure Found</p>
          </div>
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
      </div>
    </div>
  );
}