// File: @/modules/branches/components/BranchRow.tsx
import React from "react";
import { motion } from "framer-motion";
import { Branch } from "@/types";
import { StatusGridBadge } from "@/modules/personnel/components/StatusGridBadge"; // Reusing the same badge component

interface BranchRowProps {
  branch: Branch;
  isSelected: boolean;
  onClick: () => void;
}

/**
 * BranchRow
 * Redesigned to mirror PersonnelRow exactly.
 * High-fidelity, mobile-ready, and strictly non-wrapping.
 */
export function BranchRow({ branch, isSelected, onClick }: BranchRowProps) {
  // Map branch state to the shared StatusGridBadge types
  const status = branch.deletedAt ? "disabled" : branch.active ? "active" : "locked";

  const revenue = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
  }).format(branch.salesTotal || 0);

  return (
    <div className="flex flex-col w-full border-b border-black/[0.04] last:border-none group">
      <motion.div
        layoutId={`branch-${branch.id}`}
        onClick={onClick}
        role="button"
        aria-pressed={isSelected}
        className={`flex flex-col md:flex-row md:items-center px-4 md:px-8 py-3 md:py-3.5 transition-all cursor-pointer text-[13px] relative ${
          isSelected ? "bg-blue-50/50" : "hover:bg-slate-50/80"
        }`}
      >
        {/* --- DESKTOP VIEW (Identical Grid Alignment) --- */}
        <div className="hidden md:flex items-center w-full whitespace-nowrap">
          {/* Node ID (Matches Staff ID Column) */}
          <div className="w-[120px] shrink-0 flex items-center gap-2">
            <span className="font-mono text-slate-600 font-medium tracking-tight truncate uppercase">
              {branch.id.slice(-8) || "PENDING"}
            </span>
          </div>

          {/* Branch Name (Matches Personnel Name Column) */}
          <div className="flex-[1.5] min-w-[150px] text-slate-800 font-semibold truncate pr-4">
            {branch.name}
          </div>

          {/* Location (Matches Email Column) */}
          <div className="flex-1 min-w-[150px] text-slate-500 truncate pr-4 font-normal" title={branch.location}>
            {branch.location || "Floating Node"}
          </div>

          {/* Category/Type (Matches Role Column) */}
          <div className="w-[110px] shrink-0 pr-2">
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-black/[0.03] px-2 py-0.5 rounded uppercase tracking-wider truncate block w-fit">
              {branch.type || "Retail"}
            </span>
          </div>

          {/* Performance (Matches Primary Branch Column) */}
          <div className="w-[160px] shrink-0 pr-4">
            <div className="flex items-center gap-2 px-2 py-1 bg-white border border-black/[0.06] rounded-md shadow-sm w-fit max-w-full">
              <i className="bx bx-trending-up text-blue-600 text-[14px]" />
              <span className="text-[11px] font-bold text-blue-700 truncate">
                {revenue} <span className="font-medium text-slate-400 ml-0.5">YTD</span>
              </span>
            </div>
          </div>

          {/* Status Badge */}
          <div className="w-[90px] shrink-0 flex justify-end">
            <StatusGridBadge status={status} />
          </div>
        </div>

        {/* --- MOBILE VIEW (Identical Property Stack) --- */}
        <div className="flex md:hidden flex-col gap-1 w-full overflow-hidden">
          <div className="flex justify-between items-start gap-2">
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-slate-900 truncate">{branch.name}</span>
              <span className="text-[11px] text-slate-500 truncate">{branch.location || "No Address Set"}</span>
            </div>
            <div className="shrink-0">
              <StatusGridBadge status={status} />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-1">
            {/* Mobile ID */}
            <div className="flex items-center gap-1.5 text-[11px] shrink-0">
              <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">ID</span>
              <span className="font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                {branch.id.slice(-8).toUpperCase()}
              </span>
            </div>

            {/* Mobile Type */}
            <div className="flex items-center gap-1.5 text-[11px] min-w-0">
              <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Type</span>
              <span className="font-semibold text-slate-500 truncate uppercase">{branch.type || "Retail"}</span>
            </div>
          </div>

          {/* Mobile Bottom Row (Matches Mobile Branch/Assignments row) */}
          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-black/[0.03]">
             <div className="flex items-center gap-2 overflow-hidden">
                <i className="bx bx-dollar-circle text-slate-400" />
                <span className="text-[11px] font-bold text-slate-700 truncate">Revenue: {revenue}</span>
             </div>
             <i className="bx bx-chevron-right text-slate-300" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}