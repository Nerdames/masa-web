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
    <div className="border rounded p-2">
      <button
        onClick={onToggle}
        className="w-full flex justify-between items-center py-2 text-left text-gray-800 font-semibold"
      >
        <span>{title}</span>
        <span>{expanded ? "▲" : "▼"}</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-2"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CollapseSection;