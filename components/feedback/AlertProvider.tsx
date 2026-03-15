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
  onClick?: () => void;
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

// --- Provider Component ---
export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<MASAAlert[]>([]);

  const remove = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const dispatch = useCallback((alert: Omit<MASAAlert, "id">) => {
    setAlerts((prev) => [...prev, { ...alert, id: crypto.randomUUID() }]);
  }, []);

  const processApproval = useCallback(async (approvalId: string, decision: "APPROVED" | "REJECTED") => {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, decision }),
      });

      if (!res.ok) throw new Error("Action Failed");

      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Success",
        message: `Request ${decision.toLowerCase()} successfully.`,
      });
    } catch (err) {
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Error",
        message: err instanceof Error ? err.message : "Failed to process approval.",
      });
    }
  }, [dispatch]);

  const contextValue = useMemo(() => ({ dispatch, remove, processApproval }), [dispatch, remove, processApproval]);

  return (
    <AlertContext.Provider value={contextValue}>
      {children}
      <RadixToast.Provider swipeDirection="right">
        {/* Top Center Viewport (For Push) */}
        <RadixToast.Viewport className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-3 w-full max-w-lg items-center pointer-events-none px-4" />
        
        {/* Bottom Right Viewport (For Toasts) */}
        <RadixToast.Viewport className="fixed bottom-6 right-6 z-[200] flex flex-col-reverse gap-3 w-auto items-end pointer-events-none" />

        <AnimatePresence mode="popLayout">
          {alerts.map((alert) => (
            <AlertItem key={alert.id} alert={alert} onRemove={remove} onAction={processApproval} />
          ))}
        </AnimatePresence>
      </RadixToast.Provider>
    </AlertContext.Provider>
  );
}

// --- Item Component ---
function AlertItem({ alert, onRemove, onAction }: { 
  alert: MASAAlert; 
  onRemove: (id: string) => void;
  onAction: (id: string, d: "APPROVED" | "REJECTED") => void 
}) {
  const isPush = alert.kind === "PUSH";

  return (
    <RadixToast.Root
      duration={alert.duration || (isPush ? 15000 : 5000)}
      onOpenChange={(open) => !open && onRemove(alert.id)}
      asChild
    >
      <motion.div
        layout
        initial={{ opacity: 0, y: isPush ? -40 : 20, scale: 0.9, x: isPush ? 0 : 20 }}
        animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
        className={`
          pointer-events-auto shadow-2xl overflow-hidden
          ${isPush 
            ? "rounded-[2rem] w-full bg-white/90 backdrop-blur-xl border border-white/20 ring-1 ring-black/5 p-2" 
            : `rounded-xl w-80 bg-white border-l-4 p-4 ${getBorder(alert.type)}`
          }
        `}
      >
        <div className={`flex ${isPush ? "items-center" : "items-start"} gap-3`}>
          {/* Icon Section */}
          <div className={`shrink-0 flex items-center justify-center 
            ${isPush ? "w-11 h-11 rounded-full shadow-inner" : "w-10 h-10 rounded-xl"} 
            ${getBg(alert.type)}`}
          >
            <i className={`bx ${getIcon(alert.type)} ${getColor(alert.type)} ${isPush ? "text-xl" : "text-lg"}`} />
          </div>

          {/* Content Section */}
          <div className="flex-1 min-w-0 pr-2">
            {alert.title && (
              <RadixToast.Title className={`font-bold tracking-tight ${isPush ? "text-sm text-slate-900" : `text-xs uppercase ${getColor(alert.type)}`}`}>
                {alert.title}
              </RadixToast.Title>
            )}
            <RadixToast.Description className={`text-slate-600 leading-tight ${isPush ? "text-sm mt-0.5" : "text-xs mt-1"}`}>
              {alert.message}
            </RadixToast.Description>

            {/* OTP Code Style */}
            {alert.code && (
              <div className="mt-3 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl p-2.5 flex justify-between items-center">
                <span className="font-mono font-bold text-lg tracking-[0.2em] text-slate-800 ml-2">{alert.code}</span>
                <button 
                  onClick={() => navigator.clipboard.writeText(alert.code!)}
                  className="px-3 py-1 bg-white shadow-sm border border-slate-200 rounded-full text-[10px] font-bold text-slate-500 hover:text-blue-600 active:scale-95 transition-all"
                >
                  COPY
                </button>
              </div>
            )}

            {/* Action Buttons for Push */}
            {isPush && alert.approvalId && (
              <div className="mt-3 flex gap-2">
                <button 
                  onClick={() => { onAction(alert.approvalId!, "APPROVED"); onRemove(alert.id); }}
                  className="flex-1 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-2xl hover:bg-black active:scale-[0.98] transition-all"
                >
                  Confirm
                </button>
                <button 
                  onClick={() => { onAction(alert.approvalId!, "REJECTED"); onRemove(alert.id); }}
                  className="px-4 py-2 bg-slate-100 text-slate-600 text-[11px] font-bold rounded-2xl hover:bg-slate-200 active:scale-[0.98] transition-all"
                >
                  Decline
                </button>
              </div>
            )}
          </div>

          <RadixToast.Close className="shrink-0 text-slate-300 hover:text-slate-600 p-1">
            <i className="bx bx-x text-xl" />
          </RadixToast.Close>
        </div>
      </motion.div>
    </RadixToast.Root>
  );
}

// --- Design Helpers ---
const getIcon = (t: AlertType) => ({
  INFO: "bx-info-circle", WARNING: "bx-error", ERROR: "bx-x-circle",
  SUCCESS: "bx-check-circle", SYSTEM: "bx-cog", SECURITY: "bx-shield-alt-2"
}[t] || "bx-bell");

const getBg = (t: AlertType) => ({
  INFO: "bg-blue-50", WARNING: "bg-orange-50", ERROR: "bg-red-50",
  SUCCESS: "bg-emerald-50", SYSTEM: "bg-slate-100", SECURITY: "bg-indigo-50"
}[t] || "bg-slate-50");

const getColor = (t: AlertType) => ({
  INFO: "text-blue-600", WARNING: "text-orange-600", ERROR: "text-red-600",
  SUCCESS: "text-emerald-600", SYSTEM: "text-slate-600", SECURITY: "text-indigo-600"
}[t] || "text-slate-600");

const getBorder = (t: AlertType) => ({
  INFO: "border-l-blue-500", WARNING: "border-l-orange-500", ERROR: "border-l-red-500",
  SUCCESS: "border-l-emerald-500", SYSTEM: "border-l-slate-500", SECURITY: "border-l-indigo-600"
}[t] || "border-l-slate-500");