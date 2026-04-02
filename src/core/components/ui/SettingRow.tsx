"use client";

import { FC, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { Tooltip } from "@/core/components/feedback/Tooltip";
import { PreferenceScope } from "@prisma/client";

interface SettingRowProps {
  label: string;
  value: any;
  type: "switch" | "select" | "number";
  options?: { label: string; value: any }[];
  isMini?: boolean;
  isOverride?: boolean;
  isLocked?: boolean;
  activeScope?: PreferenceScope | "DEFAULT";
  onChange: (newValue: any) => void;
  onReset: () => void;
  onToggleLock?: () => void;
}

export const SettingRow: FC<SettingRowProps> = ({
  label,
  value,
  type,
  options,
  isMini,
  isOverride,
  isLocked,
  activeScope = "DEFAULT",
  onChange,
  onReset,
  onToggleLock,
}) => {

  /* -------------------------------- */
  /* Dropdown State */
  /* -------------------------------- */

  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);

  const [coords, setCoords] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  /* -------------------------------- */
  /* Calculate dropdown position
  /* Updates on open, scroll, resize */
  /* -------------------------------- */

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (!buttonRef.current) return;

      const rect = buttonRef.current.getBoundingClientRect();

      setCoords({
        top: rect.bottom + window.scrollY + 6,
        left: rect.left + window.scrollX,
      });
    };

    updatePosition();

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };

  }, [isOpen]);

  /* -------------------------------- */
  /* Scope Styling */
  /* -------------------------------- */

  const getScopeStyles = (scope: PreferenceScope | "DEFAULT") => {

    if (isLocked && !isMini)
      return "bg-red-500/10 text-red-600 border-red-500/20";

    switch (scope) {
      case "USER":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";

      case "BRANCH":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";

      case "ORGANIZATION":
        return "bg-purple-500/10 text-purple-600 border-purple-500/20";

      default:
        return "bg-black/5 text-black/40 border-transparent";
    }
  };

  return (
    <div
      className={`flex items-center justify-between px-4 transition-all duration-200 group ${
        isMini
          ? "py-2 border-l-2 border-black/5 ml-4 bg-transparent"
          : `py-4 rounded-xl ${
              isOverride
                ? "bg-blue-50/30"
                : "hover:bg-black/[0.01]"
            }`
      } ${isLocked && !isMini ? "opacity-90" : ""}`}
    >

      {/* ================================= */}
      {/* LEFT SIDE : STATUS + LABEL */}
      {/* ================================= */}

      <div className="flex items-center gap-3 min-w-0 overflow-hidden">

        {/* Status Indicator */}

        {isLocked && !isMini ? (
          <div className="w-1.5 h-1.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
        ) : isOverride && !isMini ? (
          <Tooltip content="Personal Override Active" side="right">
            <motion.div
              layoutId={`glow-${label}`}
              className="w-1.5 h-1.5 shrink-0 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)] cursor-help"
            />
          </Tooltip>
        ) : (
          !isMini && (
            <div className="w-1.5 h-1.5 shrink-0 rounded-full bg-black/10" />
          )
        )}

        {/* Label + Scope */}

        <div className="flex items-center gap-2 min-w-0">

          <span
            className={`truncate tracking-tight transition-colors ${
              isMini
                ? "text-[10px] font-bold text-black/30 uppercase tracking-widest"
                : `text-[13px] font-bold ${
                    isLocked
                      ? "text-red-700/80"
                      : isOverride
                      ? "text-blue-700"
                      : "text-black/80"
                  }`
            }`}
          >
            {label}

            {isLocked && !isMini && (
              <i className="bx bx-lock-alt ml-1 opacity-30 text-[10px]" />
            )}
          </span>

          {!isMini && (
            <div
              className={`px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter border shrink-0 ${getScopeStyles(
                activeScope
              )}`}
            >
              {activeScope === "ORGANIZATION" ? "ORG" : activeScope}
            </div>
          )}
        </div>
      </div>

      {/* ================================= */}
      {/* RIGHT SIDE : CONTROLS + ACTIONS */}
      {/* ================================= */}

      <div className="flex items-center gap-3 shrink-0">

        {/* Controls */}

        <div
          className={`flex items-center ${
            isLocked && !isMini
              ? "pointer-events-none opacity-50"
              : ""
          }`}
        >

          {/* SWITCH */}

          {type === "switch" && (
            <button
              onClick={() => onChange(!value)}
              className={`relative flex h-5 w-9 items-center rounded-full transition-colors ${
                value ? "bg-blue-600" : "bg-black/10"
              } ${isMini ? "scale-90" : ""}`}
            >
              <motion.div
                animate={{ x: value ? 18 : 3 }}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 30,
                }}
                className="h-3.5 w-3.5 rounded-full bg-white shadow-sm"
              />
            </button>
          )}

          {/* SELECT */}

          {type === "select" && (
            <>
              <button
                ref={buttonRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all ${
                  isOverride
                    ? "bg-blue-100/50 text-blue-700 hover:bg-blue-100"
                    : "bg-black/5 text-black/60 hover:text-black/90"
                }`}
              >
                {options?.find((o) => o.value === value)?.label ?? value}

                <i
                  className={`bx bx-chevron-down transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {mounted &&
                createPortal(
                  <AnimatePresence>
                    {isOpen && coords && (
                      <>
                        {/* Backdrop */}

                        <div
                          className="fixed inset-0 z-[999]"
                          onClick={() => setIsOpen(false)}
                        />

                        {/* Dropdown */}

                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.96 }}
                          style={{
                            position: "absolute",
                            top: coords.top,
                            left: coords.left,
                            zIndex: 1000,
                          }}
                          className="min-w-[140px] bg-white border border-black/5 shadow-xl shadow-black/10 rounded-xl overflow-hidden p-1"
                        >
                          {options?.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => {
                                onChange(opt.value);
                                setIsOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-lg text-[11px] font-bold transition-colors ${
                                value === opt.value
                                  ? "bg-blue-500 text-white"
                                  : "hover:bg-black/5 text-black/70"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>,
                  document.body
                )}
            </>
          )}

          {/* NUMBER */}

          {type === "number" && (
            <input
              type="number"
              value={value}
              onChange={(e) =>
                onChange(Number(e.target.value))
              }
              className="bg-black/5 hover:bg-black/10 transition-colors w-14 px-2 py-1 rounded-md text-[11px] font-black text-right outline-none text-black/70 focus:bg-blue-50 focus:text-blue-700"
            />
          )}
        </div>

        {/* ================================= */}
        {/* ACTION COLUMN */}
        {/* ================================= */}

        <div className="w-8 flex justify-center border-l border-black/[0.05] ml-1">

          {isOverride && !isLocked ? (
            <Tooltip content={`Reset ${activeScope} override`} side="left">
              <motion.button
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.1, color: "#ef4444" }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onReset();
                }}
                className="text-black/20 transition-colors"
              >
                <i className="bx bx-repost text-xl" />
              </motion.button>
            </Tooltip>
          ) : (
            <Tooltip
              content={
                isLocked
                  ? `Mandatory ${activeScope} Policy`
                  : onToggleLock
                  ? value
                    ? "Lock this policy"
                    : "Enable to lock"
                  : `Value set by ${activeScope}`
              }
              side="left"
            >
              <button
                disabled={!onToggleLock}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLock?.();
                }}
                className={`transition-all ${
                  onToggleLock
                    ? "cursor-pointer hover:scale-110"
                    : "cursor-default opacity-20"
                }`}
              >
                <i
                  className={`bx ${
                    isLocked
                      ? "bx-lock-alt text-red-500"
                      : onToggleLock
                      ? "bx-lock-open-alt hover:text-black/40"
                      : "bx-lock-open-alt"
                  } text-[14px]`}
                />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
};