// File: @/modules/branches/components/BranchRow.tsx
"use client";

import React from "react";
import { motion } from "framer-motion";
import { Branch } from "@/modules/branches/types";
import { StatusGridBadge } from "@/modules/personnel/components/StatusGridBadge";
import { TrendingUp, MapPin, Building2, Fingerprint, ChevronRight } from "lucide-react";

interface BranchRowProps {
  branch: Branch;
  isSelected: boolean;
  onClick: () => void;
}

/**
 * BranchRow
 * Cleaned up implementation removing redundant data displays and duplicated mobile fragments.
 * Aligns strictly with the desktop table headers while maintaining responsive integrity.
 */
export function BranchRow({ branch, isSelected, onClick }: BranchRowProps) {
  // Logic for status mapping
  const status = branch.deletedAt ? "disabled" : branch.active ? "active" : "locked";

  // Formatted for the Nigerian market context (NGN)
  const revenue = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(branch.salesTotal || 0);

  return (
    <motion.tr
      layoutId={`branch-${branch.id}`}
      onClick={onClick}
      role="button"
      aria-pressed={isSelected}
      className={`group transition-all cursor-pointer border-b border-slate-100 dark:border-slate-800/50 last:border-none ${
        isSelected ? "bg-blue-50/40 dark:bg-blue-900/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
      }`}
    >
      {/* Column 1: Node Identification */}
      <td className="px-5 py-4 whitespace-nowrap">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-md">
            <Fingerprint className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-mono text-[10px] text-slate-500 font-medium uppercase tracking-tight">
              {branch.id.slice(-8) || "PROVISIONING"}
            </span>
          </div>
        </div>
      </td>

      {/* Column 2: Branch Identity */}
      <td className="px-5 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-bold truncate max-w-[150px]">
          <Building2 className="w-3.5 h-3.5 opacity-50 text-slate-400" />
          <span className="text-[13px]">{branch.name}</span>
        </div>
      </td>

      {/* Column 3: Geographic Location */}
      <td className="px-5 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400" title={branch.location}>
          <MapPin className="w-3.5 h-3.5 opacity-50" />
          <span className="text-[12px] font-normal truncate max-w-[180px]">
            {branch.location || "Floating Node"}
          </span>
        </div>
      </td>

      {/* Column 4: Infrastructure Type */}
      <td className="px-5 py-4 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 dark:bg-slate-800/50 border border-black/[0.03] px-2 py-0.5 rounded truncate">
            {branch.type || "Retail"}
          </span>
        </div>
      </td>

      {/* Column 5: Performance (YTD) */}
      <td className="px-5 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2 px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-sm w-fit">
          <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-[11px] font-black text-slate-700 dark:text-slate-300">
            {revenue} <span className="font-bold text-slate-400 dark:text-slate-500 ml-0.5">YTD</span>
          </span>
        </div>
      </td>

      {/* Column 6: Node Status */}
      <td className="px-5 py-4 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-3">
          <StatusGridBadge status={status} />
        </div>
      </td>
    </motion.tr>
  );
}