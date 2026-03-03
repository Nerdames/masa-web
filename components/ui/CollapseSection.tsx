"use client";

import { FC, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

const CollapseSection: FC<Props> = ({ title, expanded, onToggle, children }) => {
  return (
    <div className="w-full transition-all duration-200">
      <button
        onClick={onToggle}
        className="w-full group flex items-center gap-2 py-1.5 px-2 rounded-[6px] text-left hover:bg-black/[0.04] active:bg-black/[0.08] transition-colors"
      >
        {/* macOS Style Chevron */}
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="flex items-center justify-center text-black/40 group-hover:text-black/60"
        >
          <i className="bx bx-chevron-right text-lg" />
        </motion.span>

        <span className="text-[13px] font-bold text-black/80 tracking-tight select-none">
          {title}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ 
              height: "auto", 
              opacity: 1,
              transition: {
                height: {
                  type: "spring",
                  stiffness: 400,
                  damping: 40,
                },
                opacity: { duration: 0.15, delay: 0.05 }
              }
            }}
            exit={{ 
              height: 0, 
              opacity: 0,
              transition: {
                height: {
                  type: "spring",
                  stiffness: 400,
                  damping: 40,
                },
                opacity: { duration: 0.1 }
              }
            }}
            className="overflow-hidden"
          >
            {/* Indent the children to align with the text, not the chevron */}
            <div className="pl-7 pr-2 py-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CollapseSection;