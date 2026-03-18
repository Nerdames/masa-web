"use client";

import { FC, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CollapseProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export const CollapseSection: FC<CollapseProps> = ({ title, expanded, onToggle, children }) => {
  return (
    <div className="w-full border-b border-black/[0.04] last:border-0 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-4 group transition-colors hover:bg-black/[0.01]"
      >
        <span className="text-[12px] font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
          {title}
        </span>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="text-slate-400 group-hover:text-slate-600"
        >
          <i className="bx bx-chevron-down text-lg" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="pb-4 pt-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};