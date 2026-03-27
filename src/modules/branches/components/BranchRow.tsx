// @/modules/branches/components/BranchRow.tsx
import React from "react";
import { Branch } from "./types";

interface BranchRowProps {
  branch: Branch;
  isSelected: boolean;
  onClick: () => void;
}

export function BranchRow({ branch, isSelected, onClick }: BranchRowProps) {
  const status = branch.deletedAt ? "deleted" : branch.active ? "active" : "inactive";

  const statusStyles = {
    active: "bg-emerald-50 text-emerald-600 border-emerald-100",
    inactive: "bg-amber-50 text-amber-600 border-amber-200",
    deleted: "bg-red-50 text-red-600 border-red-200",
  };

  return (
    <div
      onClick={onClick}
      className={`group w-full flex items-center px-4 py-3 md:px-4 md:py-4 rounded-xl cursor-pointer transition-all border ${
        isSelected
          ? "bg-blue-50 border-blue-500/30 shadow-sm"
          : "bg-white border-black/[0.04] hover:border-black/10 hover:shadow-sm"
      }`}
    >
      {/* Node ID */}
      <div className="w-[100px] md:w-[120px] shrink-0">
        <span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">
          {branch.id.slice(-8).toUpperCase()}
        </span>
      </div>

      {/* Name */}
      <div className="flex-1 min-w-[120px] pr-4">
        <h3 className="font-bold text-sm text-slate-900 truncate group-hover:text-blue-600 transition-colors">
          {branch.name}
        </h3>
      </div>

      {/* Location */}
      <div className="w-[120px] md:w-[180px] hidden md:flex shrink-0 pr-4 items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
        <i className="bx bx-map-pin text-[10px]" />
        <span className="text-[11px] font-bold truncate text-slate-700">
          {branch.location || "Floating Node"}
        </span>
      </div>

      {/* Staff Count */}
      <div className="w-[80px] text-center shrink-0">
        <span className="text-xs font-bold text-slate-600 bg-slate-50 border border-black/5 px-2.5 py-1 rounded-lg">
          {branch._count?.personnel || 0}
        </span>
      </div>

      {/* Revenue */}
      <div className="w-[100px] md:w-[140px] text-right shrink-0 pr-4">
        <span className="text-xs font-black text-slate-800">
          ${Number(branch.salesTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      {/* Status */}
      <div className="w-[80px] flex justify-end shrink-0">
        <span className={`px-2 py-1 rounded-md border text-[9px] font-black uppercase tracking-widest ${statusStyles[status]}`}>
          {status === 'deleted' ? 'archived' : status}
        </span>
      </div>
    </div>
  );
}