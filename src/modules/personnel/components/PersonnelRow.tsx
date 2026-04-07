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
  
  // State for expanding secondary access/branch assignments
  const [isExpanded, setIsExpanded] = useState(false);

  const status = personnel.disabled ? "disabled" : personnel.isLocked ? "locked" : "active";
  const depName = personnel.branch?.name || "Unassigned";
  const mainIsPrimary = !!personnel.branch?.isPrimary;

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevents row selection when clicking the expand toggle
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="flex flex-col w-full border-b border-black/[0.04] last:border-none group">
      <motion.div
        layoutId={`person-${personnel.id}`}
        onClick={onClick}
        role="button"
        aria-pressed={isSelected}
        aria-label={`Personnel details for ${personnel.name}`}
        className={`flex flex-col md:flex-row md:items-center px-4 md:px-8 py-3 md:py-3.5 transition-all cursor-pointer text-[13px] relative ${
          isSelected ? "bg-blue-50/50" : "hover:bg-slate-50/80"
        }`}
      >
        {/* --- DESKTOP VIEW (Grid Alignment) --- */}
        <div className="hidden md:flex items-center w-full whitespace-nowrap">
          {/* Staff Code */}
          <div className="w-[120px] shrink-0 flex items-center gap-2">
            <span className="font-mono text-slate-600 font-medium tracking-tight truncate">
              {personnel.staffCode || "PENDING"}
            </span>
            {!personnel.lastActivityAt && (
              <div
                className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0"
                title="Pending OTP Verification"
              />
            )}
          </div>

          {/* Name */}
          <div className="flex-[1.5] min-w-[150px] text-slate-800 font-semibold truncate pr-4">
            {personnel.name}
          </div>

          {/* Email */}
          <div className="flex-1 min-w-[150px] text-slate-500 truncate pr-4 font-normal" title={personnel.email}>
            {personnel.email}
          </div>

          {/* Role */}
          <div className="w-[110px] shrink-0 pr-2">
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-black/[0.03] px-2 py-0.5 rounded uppercase tracking-wider truncate block w-fit">
              {personnel.role}
            </span>
          </div>

          {/* Primary Branch / Access Toggle */}
          <div className="w-[160px] shrink-0 pr-4">
            <div className="flex items-center gap-2 px-2 py-1 bg-white border border-black/[0.06] rounded-md shadow-sm w-fit max-w-full">
              <span
                className={`w-1.5 h-1.5 shrink-0 rounded-full ${
                  mainIsPrimary ? "bg-blue-600" : getDepartmentColor(depName)
                }`}
              />
              <span
                className={`text-[11px] truncate ${getBranchColor(mainIsPrimary)} ${
                  mainIsPrimary ? "font-bold" : "font-medium"
                }`}
              >
                {depName}
              </span>
              
              {hasMultipleAssignments && (
                <button 
                  onClick={handleToggleExpand}
                  className="ml-1 flex items-center justify-center p-0.5 hover:bg-slate-100 rounded transition-colors"
                >
                  <i className={`bx bx-chevron-down text-slate-400 text-base transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <div className="w-[90px] shrink-0 flex justify-end">
            <StatusGridBadge status={status} />
          </div>
        </div>

        {/* --- MOBILE VIEW (Property Stack) --- */}
        <div className="flex md:hidden flex-col gap-1 w-full overflow-hidden">
          <div className="flex justify-between items-start gap-2">
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-slate-900 truncate">{personnel.name}</span>
              <span className="text-[11px] text-slate-500 truncate">{personnel.email}</span>
            </div>
            <div className="shrink-0">
              <StatusGridBadge status={status} />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1.5 text-[11px] shrink-0">
              <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">ID</span>
              <span className="font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                {personnel.staffCode || "..."}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] min-w-0">
              <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Role</span>
              <span className="font-semibold text-slate-500 truncate">{personnel.role}</span>
            </div>
          </div>

          <div 
            className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-black/[0.03]"
            onClick={hasMultipleAssignments ? handleToggleExpand : undefined}
          >
             <div className="flex items-center gap-2 overflow-hidden">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${mainIsPrimary ? "bg-blue-600" : "bg-slate-300"}`} />
                <span className="text-[11px] font-medium text-slate-600 truncate">{depName}</span>
                {hasMultipleAssignments && (
                  <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                    +{personnel.branchAssignments.length - 1} more
                  </span>
                )}
             </div>
             {hasMultipleAssignments && (
               <i className={`bx bx-chevron-down text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
             )}
          </div>
        </div>
      </motion.div>

      {/* --- EXPANDED ACCESS ROWS (Secondary Assignments) --- */}
      <AnimatePresence>
        {hasMultipleAssignments && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-slate-50/80 flex flex-col w-full border-t border-black/[0.02] overflow-hidden"
          >
            {personnel.branchAssignments
              .filter(a => !a.isPrimary)
              .map((assignment, idx) => (
              <div
                key={idx}
                className="flex items-center px-8 py-2.5 border-b border-black/[0.02] last:border-none text-[12px] md:pl-[575px]"
              >
                <div className="flex items-center gap-2 text-slate-500">
                  <div className="w-1 h-1 rounded-full bg-slate-300" />
                  <span className="font-medium">{assignment.name}</span>
                  <span className="text-[10px] text-slate-400 uppercase tracking-tighter bg-white px-1 border border-black/[0.05] rounded">Secondary Access</span>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}