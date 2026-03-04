"use client";

import { FC, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PreferenceScope } from "@prisma/client";

interface Props {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  variant?: "ghost" | "muted";
  /** * Highest priority scope currently active within this section's children 
   * to communicate status while collapsed.
   */
  badgeScope?: PreferenceScope | "DEFAULT";
}

const CollapseSection: FC<Props> = ({ 
  title, 
  expanded, 
  onToggle, 
  children,
  variant = "ghost",
  badgeScope = "DEFAULT"
}) => {
  // Map backend scope to indicator colors for the summary dot
  const getIndicatorColor = (scope: string) => {
    switch (scope) {
      case "USER": return "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]";
      case "BRANCH": return "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]";
      case "ORGANIZATION": return "bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]";
      default: return "bg-transparent";
    }
  };

  return (
    <div className="w-full transition-all duration-200">
      <button
        onClick={onToggle}
        className={`
          w-full group flex items-center justify-between py-1.5 px-2 rounded-lg text-left transition-all duration-200
          ${variant === "muted" ? "bg-black/[0.02] hover:bg-black/[0.04]" : "hover:bg-black/[0.03]"}
          active:scale-[0.99]
        `}
      >
        <div className="flex items-center gap-2">
          {/* macOS Style Chevron */}
          <motion.span
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="flex items-center justify-center text-black/30 group-hover:text-black/50"
          >
            <i className="bx bx-chevron-right text-[20px]" />
          </motion.span>

          <span className={`
            text-[11px] font-black uppercase tracking-[0.05em] select-none transition-colors
            ${expanded ? "text-blue-600/80" : "text-black/40 group-hover:text-black/60"}
          `}>
            {title}
          </span>
        </div>

        {/* Aggregate Status Badge: 
            Only visible when collapsed to signal overrides inside 
        */}
        <AnimatePresence>
          {!expanded && badgeScope !== "DEFAULT" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className={`mr-2 w-1.5 h-1.5 rounded-full ${getIndicatorColor(badgeScope)}`}
            />
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ 
              height: "auto", 
              opacity: 1,
              transition: {
                height: { type: "spring", stiffness: 400, damping: 40 },
                opacity: { duration: 0.2, delay: 0.05 }
              }
            }}
            exit={{ 
              height: 0, 
              opacity: 0,
              transition: {
                height: { type: "spring", stiffness: 400, damping: 40 },
                opacity: { duration: 0.1 }
              }
            }}
            className="overflow-hidden"
          >
            {/* Indent aligns children under the text label with a subtle vertical guide wire */}
            <div className="pl-6 pr-1 py-1 space-y-0.5 border-l border-black/[0.03] ml-[15px] mt-0.5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CollapseSection;