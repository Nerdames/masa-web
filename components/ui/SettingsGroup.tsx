"use client";

import { FC, ReactNode, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface GroupProps {
  children: ReactNode;
  header: string;
  icon?: string;
  count?: number;
  footer?: string;
  initialExpanded?: boolean;
}

export const SettingsGroup: FC<GroupProps> = ({ 
  children, 
  header, 
  icon, 
  count, 
  footer, 
  initialExpanded = false 
}) => {
  // Use a unique key based on the header to store state in local storage
  const storageKey = `settings-group-expanded-${header.toLowerCase().replace(/\s+/g, "-")}`;
  
  const [isExpanded, setIsExpanded] = useState<boolean>(initialExpanded);
  const [hasMounted, setHasMounted] = useState(false);

  // Sync with Local Storage on Mount
  useEffect(() => {
    const savedState = localStorage.getItem(storageKey);
    if (savedState !== null) {
      setIsExpanded(savedState === "true");
    }
    setHasMounted(true);
  }, [storageKey]);

  // Update Local Storage on Toggle
  const toggleExpanded = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    localStorage.setItem(storageKey, String(newState));
  };

  return (
    <div className="w-full space-y-2">
      <div className="bg-white/90 backdrop-blur-md border border-black/[0.05] rounded-2xl overflow-hidden shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
        
        {/* Category Header */}
        <div
          className="flex items-center justify-between px-5 py-4 cursor-pointer select-none active:bg-black/[0.02]"
          onClick={toggleExpanded}
        >
          <div className="flex items-center gap-4">
            {icon && (
              <div className="w-10 h-10 rounded-xl bg-black/5 flex items-center justify-center">
                <i className={`bx ${icon} text-lg text-black/60`} />
              </div>
            )}
            <div>
              <h3 className="text-sm font-black tracking-tight text-black/90 uppercase italic">
                {header}
              </h3>
              {count !== undefined && (
                <span className="text-[10px] font-bold text-black/30 uppercase tracking-widest">
                  {count} {count === 1 ? 'Entry' : 'Entries'}
                </span>
              )}
            </div>
          </div>
          
          <motion.i 
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="bx bx-chevron-down text-xl text-black/30"
          />
        </div>

        {/* Collapsible Content */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 350, damping: 35 }}
            >
              <div className="px-2 pb-4 space-y-1 divide-y divide-black/[0.03]">
                {children}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {footer && (
        <p className="px-5 text-[11px] text-black/40 leading-tight italic">
          {footer}
        </p>
      )}
    </div>
  );
};