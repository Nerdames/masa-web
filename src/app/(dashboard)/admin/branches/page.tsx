"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

import { Branch, BranchSummary, BranchListResponse } from "@/modules/branches/types";
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
  const { openPanel, resetToDefault } = useSidePanel();

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

  return (
    <div className="flex flex-col h-full w-full bg-white relative z-0 overflow-hidden">
      <header className="px-4 py-4 shrink-0 border-b border-black/[0.04] bg-white sticky top-0 z-[100] backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <div className="px-2 min-w-0 flex-1">
            <h1
              className="block w-full truncate text-[14px] sm:text-[15px] md:text-[18px] lg:text-2xl font-semibold tracking-tight text-slate-900 leading-tight"
              title="Branches Operations"
            >
              Branches Operations
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Search Input - Top Layer */}
            <div className="hidden sm:relative sm:block">
              <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="SEARCH_BRANCHES..."
                className="bg-slate-100 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-40 md:w-64 rounded-lg focus:ring-1 focus:ring-black transition-all outline-none"
              />
            </div>

            {hasFullClearance && (
              <button
                onClick={handleOpenProvision}
                className="p-2 md:px-4 md:py-2 bg-blue-600 text-white text-[12px] font-semibold rounded-lg shadow-sm hover:bg-blue-700 transition-all flex items-center gap-2"
              >
                <i className="bx bx-plus text-base md:text-sm" />
                <span className="hidden md:inline">Deploy Branch</span>
              </button>
            )}

            <button
              onClick={() => fetchBranches()}
              className="p-2 md:px-2 md:py-2 text-[12px] font-semibold border rounded-lg transition-colors flex justify-items-center gap-2 bg-white border-black/5 text-slate-500 hover:bg-slate-50 shadow-sm"
            >
              <i className={`bx bx-refresh text-base md:text-sm ${isLoading ? "bx-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Status Filters - Bottom Layer of Header */}
        <div
          aria-label="status filters"
          className="flex items-center justify-between md:justify-start gap-2 sm:gap-4 md:gap-6 mt-1 pt-4 border-t border-black/5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {[
            { key: "all", label: "TOTAL", count: summary.total, color: "text-slate-400" },
            { key: "active", label: "ACTIVE", count: summary.active, color: "text-emerald-500" },
            { key: "inactive", label: "INACTIVE", count: summary.inactive, color: "text-slate-400" },
            { key: "deleted", label: "DELETED", count: summary.deleted, color: "text-rose-500" },
          ].map((s, idx) => (
            <React.Fragment key={s.key}>
              {idx > 0 && <div className="w-px h-3 bg-black/10 self-center shrink-0" />}
              <button
                onClick={() => {
                  setFilterStatus(s.key as any);
                  setSearchTerm("");
                }}
                className={`group flex items-baseline gap-1 sm:gap-1.5 transition-all shrink-0 ${
                  filterStatus === s.key ? "text-blue-600 underline underline-offset-[14px] decoration-2" : "text-slate-400 hover:text-blue-600"
                }`}
              >
                <span
                  className={`text-[8px] sm:text-[10px] md:text-[11px] font-bold uppercase tracking-[0.1em] sm:tracking-[0.2em] ${
                    filterStatus === s.key ? "text-blue-600" : s.color
                  }`}
                >
                  {s.label}
                </span>
                <span className={`text-[8px] md:text-[10px] font-medium tabular-nums ${filterStatus === s.key ? "text-slate-900" : "text-slate-300"}`}>
                  {s.count}
                </span>
              </button>
            </React.Fragment>
          ))}
        </div>
      </header>

      {/* --- Desktop Table Header --- */}
      <div className="hidden md:flex px-4 md:px-8 py-2 shrink-0 items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-black/[0.04] bg-white overflow-hidden whitespace-nowrap">
        {/* Node ID - matches w-[120px] */}
        <div className="w-[120px] shrink-0 truncate">Node ID</div>

        {/* Branch Name - matches flex-[1.5] */}
        <div className="flex-[1.5] min-w-[150px] truncate">Branch Name</div>

        {/* Location - matches flex-1 */}
        <div className="flex-1 min-w-[150px] truncate">Location</div>

        {/* Type - matches w-[110px] */}
        <div className="w-[110px] shrink-0 truncate">Type</div>

        {/* Performance - matches w-[160px] */}
        <div className="w-[160px] shrink-0 truncate">Performance</div>

        {/* Status - matches w-[90px] */}
        <div className="w-[90px] shrink-0 truncate text-right">Status</div>
      </div>

      {/* Main List Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white relative">
        {isLoading && branches.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
            <i className="bx bx-loader-alt animate-spin text-3xl text-blue-500" />
          </div>
        ) : branches.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-50 p-6">
            <i className="bx bx-buildings text-4xl text-black/20" />
            <p className="text-[12px] font-bold tracking-widest uppercase">No Branch Found</p>
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