// File: @/modules/branches/page.tsx  (or @/app/(dashboard)/branches/page.tsx)
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { ActivityLogsPanel } from "@/modules/audit/components/ActivityLogsPanel";

import { Branch, BranchSummary, BranchListResponse } from "@/modules/branches/components/types";
import { BranchDetailsPanel } from "@/modules/branches/components/BranchDetailsPanel";
import { BranchProvisionPanel } from "@/modules/branches/components/BranchProvisionPanel";
import { BranchRow } from "@/modules/branches/components/BranchRow";

/**
 * BranchManagementPage
 * - Designed to live inside the app layout <main> (no fixed/fullscreen overlays)
 * - Header + filter/search are sticky at the top of the scroll container
 * - Responsive to sidebar width: uses min-w-0 and flex-1 so it shrinks correctly
 * - Internal list scrolls (native scrolling preserved); scrollbars visually hidden via utility
 * - Truncates long text, collapses columns on small screens
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
    <section className="h-full w-full min-h-0 min-w-0 flex flex-col bg-white">
      {/* Local utility styles: hide scrollbars visually but keep scroll behavior */}
      <style jsx>{`
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; width: 0; height: 0; }
        /* small scale fallback to avoid overflow on tiny viewports */
        @media (max-width: 340px), (max-height: 640px) {
          .branch-scale-fallback { transform-origin: top center; transform: scale(0.96); }
        }
      `}</style>

      <div className="branch-scale-fallback flex flex-col h-full w-full min-h-0 min-w-0">
        {/* Header + actions (sticky inside the main scroll container) */}
        <header className="sticky top-0 z-30 bg-white border-b border-black/[0.04]">
          <div className="px-4 md:px-8 py-3 md:py-4 flex items-start md:items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg md:text-2xl font-bold tracking-tight text-slate-900 leading-tight truncate">
                Infrastructure
              </h1>
              <p className="text-xs text-black/40 font-medium mt-1 truncate">Global Network Nodes & Hubs</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleOpenLogs}
                title="Audit Trail"
                className="p-2 md:px-4 md:py-2 text-[12px] font-semibold border rounded-lg transition-colors flex items-center gap-2 bg-white border-black/5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 shadow-sm"
                aria-label="Open audit trail"
              >
                <i className="bx bx-history text-base md:text-sm" />
                <span className="hidden md:inline whitespace-nowrap">Audit Trail</span>
              </button>

              {hasFullClearance && (
                <button
                  onClick={handleOpenProvision}
                  title="Deploy Node"
                  className="p-2 md:px-5 md:py-2 bg-blue-600 text-white text-[12px] font-semibold rounded-lg shadow-sm hover:bg-blue-700 transition-all flex items-center gap-2"
                  aria-label="Deploy node"
                >
                  <i className="bx bx-plus text-base md:text-sm" />
                  <span className="hidden md:inline whitespace-nowrap">Deploy Node</span>
                </button>
              )}
            </div>
          </div>

          {/* Filters + Search (sticky under header) */}
          <div className="w-full bg-white border-t border-black/5">
            <div className="px-4 md:px-8 py-3 flex items-center justify-between gap-3">
              {/* Filters */}
              <div className="flex items-center gap-2 md:gap-4 min-w-0 overflow-hidden">
                {(["all", "active", "inactive", "deleted"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-widest pb-1 relative min-w-0 transition-colors ${
                      filterStatus === status ? "text-blue-600" : "text-black/30 hover:text-black/60"
                    }`}
                    aria-pressed={filterStatus === status}
                    aria-label={`Filter ${status}`}
                  >
                    <span className="truncate max-w-[80px] md:max-w-[120px]">{status}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        filterStatus === status ? "bg-blue-100 text-blue-600" : "bg-black/5 text-black/40"
                      }`}
                    >
                      {summary[status]}
                    </span>
                    {filterStatus === status && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full"
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative w-full md:w-72 shrink-0 min-w-0">
                <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base" />
                <input
                  type="text"
                  placeholder="Search nodes or locations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-[#F8F9FC] border border-transparent rounded-lg text-[12px] font-medium outline-none focus:bg-white focus:border-blue-500/30 focus:ring-4 focus:ring-blue-500/10 transition-all truncate"
                  aria-label="Search nodes or locations"
                />
              </div>
            </div>
          </div>
        </header>

        {/* Column headers (sticky below filters) */}
        <div className="sticky top-[calc( (var(--header-height,0px)) )] z-20 bg-slate-50/50 border-b border-black/[0.04]">
          <div className="px-4 md:px-8 py-2 flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <div className="w-[90px] md:w-[120px] shrink-0 truncate">Node ID</div>
            <div className="flex-1 min-w-[120px] truncate">Branch Name</div>
            <div className="w-[100px] md:w-[180px] hidden md:block shrink-0 truncate">Location</div>
            <div className="w-[70px] text-center shrink-0 truncate">Staff</div>
            <div className="w-[100px] md:w-[140px] text-right shrink-0 truncate">Total Revenue</div>
            <div className="w-[70px] text-right shrink-0 truncate">Status</div>
          </div>
        </div>

        {/* Scrollable list area: this element scrolls inside the layout main */}
        <main
          className="flex-1 overflow-auto hide-scrollbar bg-[#FAFAFC] p-2 md:p-4 min-h-0 min-w-0"
          role="main"
          aria-live="polite"
        >
          {/* Loading / Empty / List */}
          {isLoading && branches.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <i className="bx bx-loader-alt animate-spin text-3xl text-blue-500" />
            </div>
          ) : branches.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-40 p-6">
              <i className="bx bx-buildings text-5xl text-black/20" />
              <p className="text-[12px] font-bold tracking-widest uppercase">No Infrastructure Found</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {branches.map((branch) => (
                <BranchRow
                  key={branch.id}
                  branch={branch}
                  isSelected={selectedBranchId === branch.id}
                  onClick={() => handleOpenDetails(branch)}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
