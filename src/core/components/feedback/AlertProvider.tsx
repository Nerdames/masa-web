"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import * as RadixToast from "@radix-ui/react-toast";
import { motion, AnimatePresence } from "framer-motion";
import { NotificationType } from "@prisma/client";
import "boxicons/css/boxicons.min.css";

/* -------------------------------------------------- */
/* TYPES */
/* -------------------------------------------------- */

export type AlertKind = "TOAST" | "PUSH";

export interface MASAAlert {
  id: string;
  kind: AlertKind;
  type: NotificationType;
  title: string;
  message: string;
  duration?: number;
  approvalId?: string;
  activityId?: string;
  createdAt: number; 
}

interface AlertContextType {
  dispatch: (alert: Omit<MASAAlert, "id" | "createdAt">) => void;
  remove: (id: string) => void;
}

/* -------------------------------------------------- */
/* CONFIGURATION */
/* -------------------------------------------------- */

const TYPE_CONFIG: Record<NotificationType, { icon: string; color: string; bg: string }> = {
  SECURITY: { icon: "bx-shield-quarter", color: "text-red-600", bg: "bg-red-50" },
  SYSTEM: { icon: "bx-cog", color: "text-slate-600", bg: "bg-slate-50" },
  APPROVAL: { icon: "bx-lock-open", color: "text-amber-600", bg: "bg-amber-50" }, 
  APPROVAL_DECISION: { icon: "bx-git-commit", color: "text-indigo-600", bg: "bg-indigo-50" },
  SUCCESS: { icon: "bx-check-circle", color: "text-emerald-600", bg: "bg-emerald-50" },
  WARNING: { icon: "bx-error", color: "text-orange-600", bg: "bg-orange-50" },
  INFO: { icon: "bx-info-circle", color: "text-blue-600", bg: "bg-blue-50" },
  INVENTORY: { icon: "bx-package", color: "text-purple-600", bg: "bg-purple-50" },
  TRANSACTIONAL: { icon: "bx-receipt", color: "text-emerald-600", bg: "bg-emerald-50" },
};

/* -------------------------------------------------- */
/* CONTEXT & HOOK */
/* -------------------------------------------------- */

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlerts = () => {
  const context = useContext(AlertContext);
  if (!context) throw new Error("useAlerts must be used within an AlertProvider");
  return context;
};

/* -------------------------------------------------- */
/* PROVIDER COMPONENT */
/* -------------------------------------------------- */

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<MASAAlert[]>([]);

  const remove = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const dispatch = useCallback((alert: Omit<MASAAlert, "id" | "createdAt">) => {
    const id = crypto.randomUUID();
    setAlerts((prev) => [...prev, { ...alert, id, createdAt: Date.now() }]);
  }, []);

  const activePushes = useMemo(() => alerts.filter(a => a.kind === "PUSH"), [alerts]);
  const activeToasts = useMemo(() => alerts.filter(a => a.kind === "TOAST"), [alerts]);

  return (
    <AlertContext.Provider value={{ dispatch, remove }}>
      {children}
      
      {/* PUSH VIEWPORT - Center Top Pile */}
      <RadixToast.Provider swipeDirection="up">
        <RadixToast.Viewport className="fixed top-6 left-1/2 -translate-x-1/2 z-[10000] w-full max-w-[420px] h-24 pointer-events-none px-4" />
        <AnimatePresence mode="popLayout">
          {activePushes.map((a, index) => (
            <AlertItem 
              key={a.id} 
              alert={a} 
              onRemove={remove} 
              stackIndex={activePushes.length - 1 - index} 
            />
          ))}
        </AnimatePresence>
      </RadixToast.Provider>

      {/* TOAST VIEWPORT - Bottom Right Pile */}
      <RadixToast.Provider swipeDirection="right">
        <RadixToast.Viewport className="fixed bottom-10 right-10 z-[10000] w-[340px] h-24 pointer-events-none" />
        <AnimatePresence mode="popLayout">
          {activeToasts.map((a, index) => (
            <AlertItem 
              key={a.id} 
              alert={a} 
              onRemove={remove} 
              stackIndex={activeToasts.length - 1 - index} 
            />
          ))}
        </AnimatePresence>
      </RadixToast.Provider>
    </AlertContext.Provider>
  );
}

/* -------------------------------------------------- */
/* ITEM COMPONENT */
/* -------------------------------------------------- */

function AlertItem({ alert, onRemove, stackIndex = 0 }: { alert: MASAAlert; onRemove: (id: string) => void; stackIndex: number }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [timeStr, setTimeStr] = useState("now");

  const isPush = alert.kind === "PUSH";
  const config = TYPE_CONFIG[alert.type] || TYPE_CONFIG.INFO;

  useEffect(() => {
    const interval = setInterval(() => {
      const mins = Math.floor((Date.now() - alert.createdAt) / 60000);
      setTimeStr(mins < 1 ? "now" : `${mins}m`);
    }, 10000);
    return () => clearInterval(interval);
  }, [alert.createdAt]);

  // "Whot Card" Stacking Logic: Cards translate on the Y axis and scale down as they get deeper in the pile
  // Pushes stack downwards from top, Toasts stack upwards from bottom.
  const yOffset = isPush ? stackIndex * 10 : stackIndex * -10;
  const scale = Math.max(1 - stackIndex * 0.05, 0.8);
  const blur = stackIndex > 0 ? `blur(${stackIndex * 0.5}px)` : "none";

  return (
    <RadixToast.Root 
      forceMount 
      duration={isExpanded ? Infinity : alert.duration || 6000} 
      onOpenChange={(open) => !open && onRemove(alert.id)} 
      asChild
    >
      <motion.div
        layout
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        initial={{ opacity: 0, y: isPush ? -80 : 80, scale: 0.9 }}
        animate={{ 
          opacity: stackIndex < 4 ? 1 : 0, 
          y: yOffset, 
          scale,
          filter: blur,
          zIndex: 100 - stackIndex,
          // When hovered, the whole pile lifts slightly but stays compact
          translateY: isHovered ? (isPush ? 5 : -5) : 0
        }}
        exit={{ 
          opacity: 0, 
          scale: 0.5, 
          x: isPush ? 0 : 150,
          y: isPush ? -100 : 0, 
          transition: { duration: 0.3 } 
        }}
        transition={{ type: "spring", stiffness: 350, damping: 25 }}
        style={{ position: "absolute", left: 0, right: 0 }}
        className={`
          pointer-events-auto group flex gap-4 p-4 bg-white border border-slate-200/70 shadow-2xl rounded-xl
          ${isPush ? "w-full" : "w-[340px] ml-auto"}
          transition-shadow duration-300
        `}
      >
        {/* Status Icon */}
        <div className={`flex-shrink-0 w-11 h-11 rounded-xl ${config.bg} flex items-center justify-center border border-white shadow-sm mt-0.5`}>
          <i className={`bx ${config.icon} text-2xl ${config.color}`} />
        </div>

        {/* Text Content */}
        <div className="flex-1 min-w-0 pr-6">
          <div className="flex justify-between items-start">
            <RadixToast.Title className="text-[14px] font-bold text-slate-900 truncate leading-tight">
              {alert.title} <span className="text-slate-400 font-medium ml-1">· {timeStr}</span>
            </RadixToast.Title>
          </div>
          
          <motion.div layout>
            <RadixToast.Description 
              className={`text-[13px] text-slate-500 leading-relaxed font-medium mt-0.5
                ${isPush && !isExpanded ? "line-clamp-1" : ""}
              `}
            >
              {alert.message}
            </RadixToast.Description>

            <AnimatePresence>
              {(!isPush || isExpanded) && (alert.approvalId || alert.type === "SECURITY") && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto", marginTop: 10 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] w-fit px-2.5 py-1 rounded-full border ${
                    alert.type === "SECURITY" ? "text-red-600 bg-red-50 border-red-100" : "text-amber-600 bg-amber-50 border-amber-100"
                  }`}>
                    <i className={`bx ${alert.type === "SECURITY" ? "bx-shield-x animate-pulse" : "bxs-lock-open"}`} />
                    {alert.type === "SECURITY" ? "Critical Threat" : "Action Required"}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Action Controls */}
        <div className="absolute top-3.5 right-3.5 flex items-center">
          {isPush ? (
            <button 
              onClick={(e) => { e.preventDefault(); setIsExpanded(!isExpanded); }}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-50 transition-colors"
            >
              <i className={`bx bx-chevron-down text-2xl text-slate-400 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} />
            </button>
          ) : (
            <RadixToast.Close className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-50 transition-colors">
              <i className="bx bx-x text-xl text-slate-400 hover:text-slate-600" />
            </RadixToast.Close>
          )}
        </div>
      </motion.div>
    </RadixToast.Root>
  );
}