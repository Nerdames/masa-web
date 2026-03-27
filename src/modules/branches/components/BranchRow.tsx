// File: @/modules/branches/components/BranchRow.tsx
import React from "react";
import { Branch } from "@/types";

interface BranchRowProps {
  branch: Branch;
  isSelected: boolean;
  onClick: () => void;
}

/**
 * BranchRow
 * Refactored to mimic the high-fidelity PropertyRow pattern.
 * Supports horizontal alignment on desktop and a clean mobile-ready stack.
 */
export function BranchRow({ branch, isSelected, onClick }: BranchRowProps) {
  const status = branch.deletedAt ? "deleted" : branch.active ? "active" : "inactive";

  const statusStyles = {
    active: "bg-emerald-50 text-emerald-600 border-emerald-100",
    inactive: "bg-amber-50 text-amber-600 border-amber-200",
    deleted: "bg-red-50 text-red-600 border-red-200",
  };

  const revenue = `$${Number(branch.salesTotal || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  return (
    <div
      onClick={onClick}
      className={`group w-full flex flex-col md:flex-row items-start md:items-center px-4 py-3 md:px-8 md:py-3.5 cursor-pointer transition-all border-b border-black/[0.04] ${
        isSelected ? "bg-blue-50/50" : "bg-white hover:bg-slate-50/50"
      }`}
      role="button"
      aria-pressed={isSelected}
    >
      {/* --- DESKTOP VIEW (Horizontal Grid) --- */}
      <div className="hidden md:flex items-center w-full text-[13px]">
        {/* Node ID */}
        <div className="w-[90px] md:w-[120px] shrink-0 flex items-center gap-2">
          <i className="bx bx-hash text-slate-300 group-hover:text-slate-500 w-4 text-center" />
          <span className="font-mono font-bold text-slate-400 truncate">
            {branch.id.slice(-8).toUpperCase()}
          </span>
        </div>

        {/* Primary Branch Name */}
        <div className="flex-1 min-w-[120px] px-2 font-medium text-slate-900 truncate">
          {branch.name}
        </div>

        {/* Location */}
        <div className="w-[100px] md:w-[180px] shrink-0 px-2 flex items-center gap-2 text-slate-500 font-medium">
          <i className="bx bx-map-pin text-slate-300 w-4 text-center" />
          <span className="truncate">{branch.location || "Floating Node"}</span>
        </div>

        {/* Staff Count */}
        <div className="w-[70px] shrink-0 text-center font-medium text-slate-600">
          {branch._count?.personnel || 0}
        </div>

        {/* Revenue */}
        <div className="w-[100px] md:w-[140px] shrink-0 text-right font-bold text-slate-800 tabular-nums">
          {revenue}
        </div>

        {/* Status */}
        <div className="w-[70px] shrink-0 flex justify-end">
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${statusStyles[status]}`}
          >
            {status === "deleted" ? "archived" : status}
          </span>
        </div>
      </div>

      {/* --- MOBILE VIEW (Property List Pattern) --- */}
      <div className="flex md:hidden flex-col w-full gap-1.5">
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-bold text-sm text-slate-900 truncate">{branch.name}</h3>
          <span
            className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${statusStyles[status]}`}
          >
            {status === "deleted" ? "archived" : status}
          </span>
        </div>

        {/* ID Property */}
        <div className="flex items-center text-[12px]">
          <div className="w-24 shrink-0 flex items-center gap-2 text-slate-400 font-medium">
            <i className="bx bx-hash text-slate-300 w-3 text-center" />
            <span>Node ID</span>
          </div>
          <div className="font-mono text-slate-500">{branch.id.slice(-8).toUpperCase()}</div>
        </div>

        {/* Location Property */}
        <div className="flex items-center text-[12px]">
          <div className="w-24 shrink-0 flex items-center gap-2 text-slate-400 font-medium">
            <i className="bx bx-map-pin text-slate-300 w-3 text-center" />
            <span>Location</span>
          </div>
          <div className="text-slate-600 truncate">{branch.location || "N/A"}</div>
        </div>

        {/* Revenue Property */}
        <div className="flex items-center text-[12px]">
          <div className="w-24 shrink-0 flex items-center gap-2 text-slate-400 font-medium">
            <i className="bx bx-dollar-circle text-slate-300 w-3 text-center" />
            <span>Revenue</span>
          </div>
          <div className="font-bold text-slate-800">{revenue}</div>
        </div>
      </div>
    </div>
  );
}