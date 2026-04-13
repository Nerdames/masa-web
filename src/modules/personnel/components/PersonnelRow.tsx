"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Personnel } from "./types";
import { StatusGridBadge } from "./StatusGridBadge";
import { ChevronDown, Mail, Shield, MapPin, Fingerprint } from "lucide-react";

/**
 * PersonnelRow
 * High-fidelity, table-aligned row for personnel management.
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
  const [isExpanded, setIsExpanded] = useState(false);
  const hasMultipleAssignments = personnel.branchAssignments && personnel.branchAssignments.length > 1;
  
  // Logic preserved from original: determined by disabled and isLocked flags
  const status = personnel.disabled ? "disabled" : personnel.isLocked ? "locked" : "active";
  const depName = personnel.branch?.name || "Unassigned";
  const mainIsPrimary = !!personnel.branch?.isPrimary;

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevents row selection/details opening when toggling assignments
    setIsExpanded(!isExpanded);
  };

  return (
    <>
      <motion.tr
        layoutId={`person-${personnel.id}`} // Preserved for layout transitions
        onClick={onClick}
        role="button"
        aria-pressed={isSelected}
        aria-label={`Personnel details for ${personnel.name}`} // Preserved accessibility
        className={`group transition-all cursor-pointer border-b border-slate-100 dark:border-slate-800/50 last:border-none ${
          isSelected ? "bg-blue-50/40 dark:bg-blue-900/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
        }`}
      >
        {/* Column 1: Staff Identification */}
        <td className="px-5 py-4 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-md">
              <Fingerprint className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-bold text-slate-800 dark:text-white truncate">
                {personnel.name}
              </span>
              <span className="font-mono text-[10px] text-slate-500 font-medium uppercase tracking-tight">
                {personnel.staffCode || "PENDING"}
              </span>
            </div>
            {!personnel.lastActivityAt && (
              <div 
                className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" 
                title="Pending OTP Verification" // Preserved original indicator logic
              />
            )}
          </div>
        </td>

        {/* Column 2: Communication Node */}
        <td className="px-5 py-4 whitespace-nowrap">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400" title={personnel.email}>
            <Mail className="w-3.5 h-3.5 opacity-50" />
            <span className="text-[12px] font-normal truncate max-w-[180px]">
              {personnel.email}
            </span>
          </div>
        </td>

        {/* Column 3: Assigned Role */}
        <td className="px-5 py-4 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-slate-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 dark:bg-slate-800/50 border border-black/[0.03] px-2 py-0.5 rounded truncate">
              {personnel.role}
            </span>
          </div>
        </td>

        {/* Column 4: Operational Branch */}
        <td className="px-5 py-4 whitespace-nowrap">
          <div className="flex items-center gap-2 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-sm w-fit max-w-full">
            <MapPin className={`w-3 h-3 ${mainIsPrimary ? "text-blue-600" : "text-slate-400"}`} />
            <span className={`text-[11px] truncate ${mainIsPrimary ? "font-bold text-blue-600 dark:text-blue-400" : "font-medium text-slate-600 dark:text-slate-300"}`}>
              {depName}
            </span>
            {hasMultipleAssignments && (
              <button
                onClick={handleToggleExpand}
                className="ml-1 p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
              >
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        </td>

        {/* Column 5: Clearance Status */}
        <td className="px-5 py-4 text-right whitespace-nowrap">
          <div className="flex justify-end">
            <StatusGridBadge status={status} />
          </div>
        </td>
      </motion.tr>

      {/* Expanded Section: Secondary Assignments */}
      <AnimatePresence>
        {isExpanded && hasMultipleAssignments && (
          <tr className="bg-slate-50/30 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800/50">
            <td colSpan={5} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-20 py-3 space-y-2.5">
                  {personnel.branchAssignments
                    .filter(a => !a.isPrimary)
                    .map((assignment, idx) => (
                      <div key={idx} className="flex items-center gap-3 text-[12px]">
                        <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                        <span className="font-medium text-slate-600 dark:text-slate-400">
                          {assignment.name}
                        </span>
                        <span className="text-[10px] text-slate-400 uppercase tracking-tighter bg-white dark:bg-slate-800 px-1 border border-black/[0.05] dark:border-slate-700 rounded shadow-sm">
                          Secondary Access
                        </span>
                      </div>
                    ))}
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}