"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import * as RadixToast from "@radix-ui/react-toast";
import { motion, AnimatePresence } from "framer-motion";
import "boxicons/css/boxicons.min.css";

// --- Types (Synced with Notification Schema) ---
export type AlertType = "SECURITY" | "INFO" | "SUCCESS" | "WARNING" | "ERROR";
export type AlertKind = "TOAST" | "PUSH";

export interface MASAAlert {
  id: string;
  kind: AlertKind;
  type: AlertType;
  title: string;
  message: string;
  duration?: number;
  approvalId?: string;
}

const TYPE_CONFIG = {
  SECURITY: { icon: "bx-shield-quarter", color: "text-red-600", bg: "bg-red-50" },
  WARNING: { icon: "bx-error", color: "text-amber-600", bg: "bg-amber-50" },
  SUCCESS: { icon: "bx-check-circle", color: "text-emerald-600", bg: "bg-emerald-50" },
  ERROR: { icon: "bx-x-circle", color: "text-rose-600", bg: "bg-rose-50" },
  INFO: { icon: "bx-info-circle", color: "text-blue-600", bg: "bg-blue-50" },
};

interface AlertContextType {
  dispatch: (alert: Omit<MASAAlert, "id">) => void;
  remove: (id: string) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlerts = () => {
  const context = useContext(AlertContext);
  if (!context) throw new Error("useAlerts must be used within an AlertProvider");
  return context;
};

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<MASAAlert[]>([]);

  const remove = useCallback((id: string) => setAlerts((prev) => prev.filter((a) => a.id !== id)), []);
  const dispatch = useCallback((alert: Omit<MASAAlert, "id">) => {
    setAlerts((prev) => [...prev, { ...alert, id: crypto.randomUUID() }]);
  }, []);

  const activePushes = alerts.filter(a => a.kind === "PUSH");
  const activeToasts = alerts.filter(a => a.kind === "TOAST");

  return (
    <AlertContext.Provider value={{ dispatch, remove }}>
      {children}
      
      {/* PUSH VIEWPORT - Center Top */}
      <RadixToast.Provider>
        <RadixToast.Viewport className="fixed top-6 left-1/2 -translate-x-1/2 z-[10000] w-full max-w-[400px] h-20 flex justify-center pointer-events-none px-4" />
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

      {/* TOAST VIEWPORT - Bottom Right */}
      <RadixToast.Provider>
        <RadixToast.Viewport className="fixed bottom-10 right-10 z-[10000] w-[320px] h-20 flex items-end justify-end pointer-events-none" />
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

function AlertItem({ alert, onRemove, stackIndex = 0 }: { alert: MASAAlert; onRemove: (id: string) => void; stackIndex: number }) {
  const [isHovered, setIsHovered] = useState(false);
  const isPush = alert.kind === "PUSH";
  const config = TYPE_CONFIG[alert.type] || TYPE_CONFIG.INFO;

  // Hover Physics
  const yOffset = isHovered ? (isPush ? 10 : 0) : stackIndex * -12;
  const scale = isHovered ? 1.02 : 1 - stackIndex * 0.05;

  return (
    <RadixToast.Root 
      forceMount 
      duration={alert.duration || 5000} 
      onOpenChange={(open) => !open && onRemove(alert.id)} 
      asChild
    >
      <motion.div
        layout
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        initial={{ opacity: 0, y: isPush ? -50 : 50, scale: 0.8 }}
        animate={{ 
          opacity: stackIndex < 4 ? 1 : 0, 
          y: yOffset, 
          scale, 
          zIndex: isHovered ? 200 : 100 - stackIndex 
        }}
        // "Fly to Bell" Effect: Scales down and moves toward top-right corner
        exit={{ 
          opacity: 0, 
          scale: 0.2, 
          x: isPush ? 300 : 0, 
          y: isPush ? -150 : 0, 
          transition: { duration: 0.45, ease: "circIn" } 
        }}
        transition={{ type: "spring", stiffness: 350, damping: 28 }}
        style={{ position: "absolute", top: isPush ? 0 : "auto", bottom: isPush ? "auto" : 0 }}
        className={`
          pointer-events-auto group relative flex gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-2xl transition-shadow
          ${isPush ? "w-full max-w-[380px]" : "w-[320px]"}
          ${isHovered ? "shadow-black/10" : "shadow-black/5"}
        `}
      >
        {/* Dynamic Icon Box (Mirrors Dropdown) */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center shadow-sm`}>
          <i className={`bx ${config.icon} text-xl ${config.color}`} />
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex justify-between items-start mb-0.5">
            <RadixToast.Title className="text-[13px] font-bold text-slate-900 truncate">
              {alert.title}
            </RadixToast.Title>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.15em] ml-2 whitespace-nowrap">
              now
            </span>
          </div>
          <RadixToast.Description className="text-[12px] text-slate-500 line-clamp-2 leading-snug font-medium">
            {alert.message}
          </RadixToast.Description>

          {alert.approvalId && (
            <div className="mt-2.5 flex items-center gap-1.5 text-[9px] font-black uppercase text-amber-600 tracking-[0.2em] bg-amber-50 w-fit px-2 py-0.5 rounded-md border border-amber-100/50">
              <i className="bx bxs-lock-open animate-pulse" />
              Auth Required
            </div>
          )}
        </div>

        <RadixToast.Close className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <i className="bx bx-x text-xl text-slate-400 hover:text-slate-600" />
        </RadixToast.Close>
      </motion.div>
    </RadixToast.Root>
  );
}