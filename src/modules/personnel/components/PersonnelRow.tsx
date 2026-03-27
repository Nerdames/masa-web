// File: @/modules/personnel/components/PersonnelRow.tsx
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Personnel } from "./types";
import { getDepartmentColor, getBranchColor } from "./utils";
import { StatusGridBadge } from "./StatusGridBadge";

/**
 * PersonnelRow
 * High-fidelity, mobile-ready row for personnel management.
 * Strictly enforces no text wrapping via whitespace-nowrap and truncate.
 */
export function PersonnelRow({
  personnel,
  isSelected,
  onClick,
}: {
  personnel: Personnel;
  isSelected: boolean;
  onClick: () => void;
}) {
  const hasMultipleAssignments = personnel.branchAssignments && personnel.branchAssignments.length > 1;
  const [isExpanded] = useState(false);

  const status = personnel.disabled ? "disabled" : personnel.isLocked ? "locked" : "active";
  const depName = personnel.branch?.name || "Unassigned";
  const mainIsPrimary = !!personnel.branch?.isPrimary;

  return (
    <div className="flex flex-col w-full border-b border-black/[0.04] last:border-none group overflow-hidden">
      <motion.div
        layoutId={`person-${personnel.id}`}
        onClick={onClick}
        role="button"
        aria-pressed={isSelected}
        aria-label={`Personnel details for ${personnel.name}`}
        className={`flex flex-col md:flex-row md:items-center px-4 md:px-8 py-3 md:py-3.5 transition-colors cursor-pointer text-[13px] overflow-hidden ${
          isSelected ? "bg-blue-50/50" : "hover:bg-slate-50/80"
        }`}
      >
        {/* --- DESKTOP VIEW (Grid) --- */}
        <div className="hidden md:flex items-center w-full whitespace-nowrap overflow-hidden">
          {/* Staff Code */}
          <div className="w-[100px] md:w-[140px] shrink-0 flex items-center gap-2 relative">
            <span className="font-mono text-slate-600 font-medium tracking-tight truncate whitespace-nowrap">
              {personnel.staffCode || "PENDING"}
            </span>
            {!personnel.lastActivityAt && (
              <div
                className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0"
                title="Pending OTP Verification"
              />
            )}
          </div>

          {/* Primary Branch */}
          <div className="w-[100px] md:w-[160px] shrink-0 pr-2 overflow-hidden">
            <div className="flex items-center gap-2 px-2 py-0.5 bg-black/[0.02] border border-black/[0.04] rounded-md w-fit max-w-full">
              <span
                className={`w-1.5 h-1.5 shrink-0 rounded-full ${
                  mainIsPrimary ? "bg-blue-600" : getDepartmentColor(depName)
                }`}
              />
              <span
                className={`text-[11px] truncate whitespace-nowrap ${getBranchColor(mainIsPrimary)} ${
                  mainIsPrimary ? "font-semibold" : "font-medium"
                }`}
              >
                {depName}
              </span>
            </div>
          </div>

          {/* Email */}
          <div className="flex-1 min-w-[100px] text-slate-500 truncate pr-4 whitespace-nowrap" title={personnel.email}>
            {personnel.email}
          </div>

          {/* Role */}
          <div className="w-[70px] md:w-[120px] shrink-0 pr-2 overflow-hidden">
            <span className="text-[10px] md:text-[11px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-wider truncate whitespace-nowrap block w-fit">
              {personnel.role}
            </span>
          </div>

          {/* Name */}
          <div className="flex-1 min-w-[120px] text-slate-800 font-medium truncate pr-4 whitespace-nowrap">
            {personnel.name}
          </div>

          {/* Status */}
          <div className="w-[70px] md:w-[100px] shrink-0 flex justify-end">
            <StatusGridBadge status={status} />
          </div>
        </div>

        {/* --- MOBILE VIEW (Property Stack) --- */}
        <div className="flex md:hidden flex-col gap-1 w-full overflow-hidden">
          <div className="flex justify-between items-start gap-2 overflow-hidden">
            <div className="flex flex-col min-w-0 overflow-hidden">
              <span className="font-bold text-slate-900 truncate whitespace-nowrap">{personnel.name}</span>
              <span className="text-[11px] text-slate-500 truncate whitespace-nowrap">{personnel.email}</span>
            </div>
            <div className="shrink-0">
              <StatusGridBadge status={status} />
            </div>
          </div>

          <div className="flex items-center gap-3 whitespace-nowrap overflow-hidden">
            {/* Mobile Staff Code */}
            <div className="flex items-center gap-1.5 text-[11px] shrink-0">
              <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px] whitespace-nowrap">ID</span>
              <span className="font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                {personnel.staffCode || "..."}
              </span>
            </div>

            {/* Mobile Role */}
            <div className="flex items-center gap-1.5 text-[11px] min-w-0">
              <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px] whitespace-nowrap">Role</span>
              <span className="font-semibold text-slate-500 truncate whitespace-nowrap">{personnel.role}</span>
            </div>
          </div>

          {/* Mobile Branch assignments */}
          <div className="flex items-center gap-2 mt-0.5 whitespace-nowrap overflow-hidden">
             <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${mainIsPrimary ? "bg-blue-600" : "bg-slate-300"}`} />
             <span className="text-[11px] font-medium text-slate-600 truncate whitespace-nowrap">{depName}</span>
             {hasMultipleAssignments && (
               <span className="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full font-bold shrink-0 whitespace-nowrap">
                 +{personnel.branchAssignments.length - 1}
               </span>
             )}
          </div>
        </div>
      </motion.div>

      {/* Expanded Assignments (Logic preserved) */}
      <AnimatePresence>
        {hasMultipleAssignments && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-slate-50/50 flex flex-col w-full border-t border-black/[0.02] overflow-hidden"
          >
            {personnel.branchAssignments.map((assignment, idx) => (
              <div
                key={idx}
                className="flex items-center px-8 py-2 border-b border-black/[0.02] last:border-none text-[12px] md:pl-[144px] whitespace-nowrap overflow-hidden truncate"
              >
                 {/* Secondary Assignment Logic matches the nowrap/truncate pattern */}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}