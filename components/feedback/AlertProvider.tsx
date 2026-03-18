"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import * as RadixToast from "@radix-ui/react-toast";
import { motion, AnimatePresence } from "framer-motion";
import "boxicons/css/boxicons.min.css";

// --- Types ---
export type AlertType = "INFO" | "WARNING" | "ERROR" | "SUCCESS" | "SYSTEM" | "SECURITY";
export type AlertKind = "TOAST" | "PUSH";

export interface MASAAlert {
  id: string;
  kind: AlertKind;
  type: AlertType;
  title?: string;
  message: string;
  duration?: number;
  code?: string;
  approvalId?: string;
}

interface AlertContextType {
  dispatch: (alert: Omit<MASAAlert, "id">) => void;
  remove: (id: string) => void;
  processApproval: (approvalId: string, decision: "APPROVED" | "REJECTED") => Promise<void>;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlerts = () => {
  const context = useContext(AlertContext);
  if (!context) throw new Error("useAlerts must be used within an AlertProvider");
  return context;
};

// --- Config for iOS Aesthetic ---
const UI_CONFIG: Record<AlertType, { icon: string; color: string; label: string }> = {
  INFO: { icon: "bx-info-circle", color: "bg-blue-500", label: "Information" },
  WARNING: { icon: "bx-error", color: "bg-amber-500", label: "Warning" },
  ERROR: { icon: "bx-x-circle", color: "bg-rose-500", label: "Critical" },
  SUCCESS: { icon: "bx-check-circle", color: "bg-emerald-500", label: "Success" },
  SYSTEM: { icon: "bx-cog", color: "bg-zinc-500", label: "System" },
  SECURITY: { icon: "bx-shield-quarter", color: "bg-indigo-500", label: "Security" },
};

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<MASAAlert[]>([]);

  const remove = useCallback((id: string) => setAlerts((prev) => prev.filter((a) => a.id !== id)), []);
  const dispatch = useCallback((alert: Omit<MASAAlert, "id">) => {
    setAlerts((prev) => [...prev, { ...alert, id: crypto.randomUUID() }]);
  }, []);

  const processApproval = useCallback(async (approvalId: string, decision: "APPROVED" | "REJECTED") => {
    // API logic remains same...
    dispatch({ kind: "TOAST", type: "SUCCESS", message: `Request ${decision.toLowerCase()}` });
  }, [dispatch]);

  const contextValue = useMemo(() => ({ dispatch, remove, processApproval }), [dispatch, remove, processApproval]);

  return (
    <AlertContext.Provider value={contextValue}>
      {children}
      {/* PUSH - Top Center */}
      <RadixToast.Provider swipeDirection="up" duration={5000}>
        <RadixToast.Viewport className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-full max-w-[400px] px-4" />
        <AnimatePresence mode="popLayout">
          {alerts.filter(a => a.kind === "PUSH").map(a => (
            <AlertItem key={a.id} alert={a} onRemove={remove} onAction={processApproval} />
          ))}
        </AnimatePresence>
      </RadixToast.Provider>

      {/* TOAST - Bottom Right */}
      <RadixToast.Provider swipeDirection="right">
        <RadixToast.Viewport className="fixed bottom-6 right-6 z-[9999] flex flex-col-reverse gap-3 w-auto items-end" />
        <AnimatePresence mode="popLayout">
          {alerts.filter(a => a.kind === "TOAST").map(a => (
            <AlertItem key={a.id} alert={a} onRemove={remove} onAction={processApproval} />
          ))}
        </AnimatePresence>
      </RadixToast.Provider>
    </AlertContext.Provider>
  );
}

function AlertItem({ alert, onRemove, onAction }: { alert: MASAAlert; onRemove: (id: string) => void; onAction: (id: string, d: any) => void }) {
  const isPush = alert.kind === "PUSH";
  const ui = UI_CONFIG[alert.type];
  
  // Logic: Critical actions (approval) prevent auto-dismiss
  const duration = alert.approvalId ? Infinity : (alert.duration || 6000);

  return (
    <RadixToast.Root
      forceMount
      duration={duration}
      onOpenChange={(open) => !open && onRemove(alert.id)}
      asChild
    >
      <motion.div
        layout
        initial={{ opacity: 0, y: isPush ? -20 : 0, x: isPush ? 0 : 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
        className={`
          pointer-events-auto overflow-hidden group
          ${isPush 
            ? "w-full bg-[#1c1c1e]/70 backdrop-blur-2xl rounded-[22px] border border-white/10 shadow-2xl p-3.5" 
            : "w-80 bg-white border-l-4 border-l-zinc-900 rounded-xl shadow-lg p-4"
          }
        `}
      >
        {isPush ? (
          /* iOS PUSH DESIGN */
          <div className="flex flex-col gap-2">
            {/* Header: App Info */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`${ui.color} w-5 h-5 rounded-[5px] flex items-center justify-center shadow-inner`}>
                  <i className={`bx ${ui.icon} text-white text-[12px]`} />
                </div>
                <span className="text-[11px] font-semibold text-white/50 uppercase tracking-widest">{ui.label}</span>
              </div>
              <span className="text-[11px] text-white/40 font-medium">now</span>
            </div>

            {/* Content */}
            <div className="flex flex-col pr-4">
              {alert.title && <RadixToast.Title className="text-white font-bold text-[15px] leading-tight">{alert.title}</RadixToast.Title>}
              <RadixToast.Description className="text-white/80 text-[14px] leading-snug font-normal mt-0.5">
                {alert.message}
              </RadixToast.Description>
            </div>

            {/* Action Buttons for iOS */}
            {alert.approvalId && (
              <div className="flex gap-2 mt-2 pt-2 border-t border-white/5">
                <button 
                  onClick={() => onAction(alert.approvalId!, "APPROVED")}
                  className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-white text-[13px] font-semibold rounded-xl transition-colors"
                >
                  Confirm
                </button>
                <button 
                  onClick={() => onRemove(alert.id)}
                  className="flex-1 py-2.5 bg-transparent hover:bg-white/5 text-white/60 text-[13px] font-medium rounded-xl transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        ) : (
          /* STANDARD TOAST DESIGN */
          <div className="flex gap-3 items-start">
             <div className={`p-2 rounded-lg ${ui.color} bg-opacity-10`}>
                <i className={`bx ${ui.icon} ${ui.color.replace('bg-', 'text-')}`} />
             </div>
             <div className="flex-1">
                {alert.title && <RadixToast.Title className="font-bold text-zinc-900 text-sm">{alert.title}</RadixToast.Title>}
                <RadixToast.Description className="text-zinc-500 text-xs mt-0.5">{alert.message}</RadixToast.Description>
             </div>
          </div>
        )}

        <RadixToast.Close className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
           <i className="bx bx-x text-white/30 hover:text-white text-xl" />
        </RadixToast.Close>
      </motion.div>
    </RadixToast.Root>
  );
}