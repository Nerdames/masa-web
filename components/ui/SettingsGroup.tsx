"use client";

import { FC, ReactNode, useState, useEffect, useMemo } from "react";
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
  initialExpanded = false,
}) => {
  /* -------------------------------- */
  /* Stable LocalStorage Key */
  /* -------------------------------- */

  const storageKey = useMemo(
    () =>
      `settings-group-expanded-${header
        .toLowerCase()
        .replace(/\s+/g, "-")}`,
    [header]
  );

  /* -------------------------------- */
  /* State */
  /* -------------------------------- */

  const [isExpanded, setIsExpanded] =
    useState<boolean>(initialExpanded);

  const [hasMounted, setHasMounted] = useState(false);

  /* -------------------------------- */
  /* Load persisted state on mount
  /* -------------------------------- */

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const saved = localStorage.getItem(storageKey);

      if (saved !== null) {
        setIsExpanded(saved === "true");
      }
    } catch {
      /* ignore storage errors */
    }

    setHasMounted(true);
  }, [storageKey]);

  /* -------------------------------- */
  /* Toggle handler
  /* -------------------------------- */

  const toggleExpanded = () => {
    const nextState = !isExpanded;

    setIsExpanded(nextState);

    try {
      localStorage.setItem(storageKey, String(nextState));
    } catch {
      /* ignore storage errors */
    }
  };

  /* -------------------------------- */
  /* Render
  /* -------------------------------- */

  return (
    <div className="w-full space-y-2">

      <div
        className="
        bg-white/90 backdrop-blur-md
        border border-black/[0.05]
        rounded-2xl overflow-hidden
        shadow-sm shadow-black/5
        transition-all duration-200
        hover:shadow-md
        "
      >

        {/* Header */}

        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={toggleExpanded}
          className="
          w-full flex items-center justify-between
          px-5 py-4 text-left
          cursor-pointer select-none
          active:bg-black/[0.02]
          "
        >

          <div className="flex items-center gap-4 min-w-0">

            {icon && (
              <div
                className="
                w-10 h-10 shrink-0
                rounded-xl bg-black/5
                flex items-center justify-center
                "
              >
                <i
                  className={`bx ${icon} text-lg text-black/60`}
                />
              </div>
            )}

            <div className="min-w-0">

              <h3
                className="
                text-sm font-black tracking-tight
                text-black/90 uppercase italic
                truncate
                "
              >
                {header}
              </h3>

              {count !== undefined && (
                <span
                  className="
                  text-[10px] font-bold
                  text-black/30 uppercase
                  tracking-widest
                  "
                >
                  {count} {count === 1 ? "Entry" : "Entries"}
                </span>
              )}

            </div>
          </div>

          {/* Chevron */}

          <motion.i
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="bx bx-chevron-down text-xl text-black/30 shrink-0"
          />

        </button>

        {/* Collapsible Content */}

        <AnimatePresence initial={false}>

          {hasMounted && isExpanded && (

            <motion.div
              layout
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                type: "spring",
                stiffness: 350,
                damping: 35,
              }}
            >

              <div
                className="
                px-2 pb-4 space-y-1
                divide-y divide-black/[0.03]
                "
              >
                {children}
              </div>

            </motion.div>

          )}

        </AnimatePresence>

      </div>

      {/* Footer */}

      {footer && (
        <p
          className="
          px-5 text-[11px]
          text-black/40
          leading-tight italic
          "
        >
          {footer}
        </p>
      )}

    </div>
  );
};