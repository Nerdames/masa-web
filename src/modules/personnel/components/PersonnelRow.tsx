import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Personnel } from "./types";
import { getDepartmentColor, getBranchColor } from "./utils";
import { StatusGridBadge } from "./StatusGridBadge";

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
        className={`flex items-center px-4 md:px-8 py-3 transition-colors cursor-pointer text-[13px] whitespace-nowrap ${
          isSelected ? "bg-blue-50/50" : "hover:bg-slate-50/80"
        }`}
      >
        {/* Staff Code */}
        <div className="w-[120px] md:w-[140px] shrink-0 flex items-center gap-2 relative overflow-hidden">
          <span className="font-mono text-slate-600 font-medium tracking-tight truncate">
            {personnel.staffCode || "PENDING"}
          </span>
          {!personnel.lastActivityAt && (
            <div
              className="absolute right-4 md:right-6 top-1.5 w-0 h-0 border-l-[4px] border-r-[4px] border-b-[4px] border-l-transparent border-r-transparent border-b-amber-400 rotate-45 shrink-0"
              role="img"
              aria-label="Pending OTP Verification"
              title="Pending OTP Verification"
            />
          )}
        </div>

        {/* Branch Section */}
        <div className="w-[120px] md:w-[160px] shrink-0 flex items-center pr-2 overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-1 bg-black/[0.02] border border-black/[0.04] rounded-md max-w-full overflow-hidden">
            {/* Dot Logic: Blue if Primary, else Dept Color */}
            <span
              className={`w-1.5 h-1.5 shrink-0 rounded-full ${
                mainIsPrimary ? "bg-blue-600" : getDepartmentColor(depName)
              }`}
            />
            {/* Text Logic: color from helper; font-weight applied here for clarity */}
            <span
              className={`text-[11px] truncate ${getBranchColor(mainIsPrimary)} ${mainIsPrimary ? "font-semibold" : "font-medium"}`}
              title={depName}
            >
              {depName}
            </span>
          </div>
        </div>

        {/* Email */}
        <div className="flex-1 min-w-[100px] text-slate-500 truncate pr-4 hidden sm:block" title={personnel.email}>
          {personnel.email}
        </div>

        {/* Role */}
        <div className="w-[90px] md:w-[120px] shrink-0 pr-2 overflow-hidden">
          <span
            className="text-[10px] md:text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider truncate block w-fit max-w-full"
            title={personnel.role}
          >
            {personnel.role}
          </span>
        </div>

        {/* Name */}
        <div className="flex-1 min-w-[120px] text-slate-800 font-medium truncate pr-4" title={personnel.name}>
          {personnel.name}
        </div>

        {/* Status */}
        <div className="w-[80px] md:w-[100px] shrink-0">
          <StatusGridBadge status={status} />
        </div>
      </motion.div>

      {/* Expanded Assignments */}
      <AnimatePresence>
        {hasMultipleAssignments && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-slate-50/50 flex flex-col w-full border-t border-black/[0.02] shadow-inner overflow-hidden"
          >
            {personnel.branchAssignments.map((assignment, idx) => {
              const assignmentIsPrimary = !!assignment.isPrimary;
              return (
                <div
                  key={idx}
                  className="flex items-center px-4 md:px-8 py-2 border-b border-black/[0.02] last:border-none text-[12px] pl-[32px] md:pl-[144px] whitespace-nowrap overflow-hidden"
                >
                  <div className="w-[120px] md:w-[160px] shrink-0 flex items-center pr-2 overflow-hidden">
                    <div className="flex items-center gap-2 px-2 py-0.5 max-w-full truncate">
                      {/* Secondary Dot Logic: Blue if primary */}
                      <span
                        className={`w-1 h-1 shrink-0 rounded-full ${
                          assignmentIsPrimary ? "bg-blue-600" : getDepartmentColor(assignment.branch.name)
                        }`}
                      />
                      {/* Secondary Text Logic: color from helper; font-weight applied here */}
                      <span
                        className={`text-[11px] truncate ${getBranchColor(assignmentIsPrimary)} ${assignmentIsPrimary ? "font-semibold" : "font-medium"}`}
                        title={assignment.branch.name}
                      >
                        {assignment.branch.name}
                      </span>

                      {assignmentIsPrimary && (
                        <span className="text-[8px] bg-blue-600 text-white px-1.5 py-0.5 rounded-md font-black uppercase tracking-tighter shrink-0">
                          Main
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-[100px] text-slate-400 italic text-[11px] hidden sm:block truncate pr-2">
                    {assignmentIsPrimary ? "Main Assignment" : "Secondary Assignment"}
                  </div>

                  <div className="w-[90px] md:w-[120px] shrink-0 overflow-hidden">
                    <span
                      className="text-[10px] font-semibold text-slate-400 bg-black/5 px-1.5 py-0.5 rounded uppercase tracking-wider truncate block w-fit max-w-full"
                      title={assignment.role}
                    >
                      {assignment.role}
                    </span>
                  </div>

                  <div className="flex-1 min-w-[120px]" />
                  <div className="w-[80px] md:w-[100px] shrink-0" />
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
