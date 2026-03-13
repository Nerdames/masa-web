"use client";

import { createContext, useContext, useState, ReactNode, useCallback, useMemo } from "react";
import * as RadixToast from "@radix-ui/react-toast";
import { motion, AnimatePresence } from "framer-motion";
import "boxicons/css/boxicons.min.css";

// Types remain the same
export type ToastType = "success" | "error" | "info" | "welcome" | "login" | "notification";

export interface Toast {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
  onClick?: () => void;
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // 1. Memoize removeToast to prevent unnecessary downstream re-renders
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 2. Memoize addToast. This is the most common cause of the "Maximum depth" error
  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 10);

    const duration = toast.duration ?? 5000;
    setToasts((prev) => [...prev, { id, ...toast, duration }]);
  }, []);

  // 3. Memoize the context value
  const contextValue = useMemo(() => ({ addToast, removeToast }), [addToast, removeToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <RadixToast.Provider swipeDirection="right">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onRemove={removeToast} />
          ))}
        </AnimatePresence>
        <RadixToast.Viewport className="fixed bottom-5 right-5 flex flex-col-reverse gap-2.5 z-[100] items-end w-auto max-w-[90vw]" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

// 4. Extracting the Item to its own component isolates state and prevents logic leaks
function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  return (
    <RadixToast.Root
      duration={toast.duration}
      onOpenChange={(open) => {
        if (!open) onRemove(toast.id);
      }}
      asChild
    >
      <motion.div
        layout
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className={`
          flex items-start justify-between gap-2.5 px-4 py-3
          rounded-lg shadow-lg cursor-pointer bg-white border-l-4
          ${getBorderClass(toast.type)}
          max-w-[350px] min-w-[280px] pointer-events-auto
        `}
        onClick={() => toast.onClick?.()}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className={`p-1.5 rounded-full ${getIconBgClass(toast.type)}`}>
            <i className={`bx ${getIconClass(toast.type)} ${getIconTextClass(toast.type)} text-lg`} />
          </div>
          <div className="flex flex-col min-w-0">
            {toast.title && (
              <span className={`font-semibold truncate ${getTextClass(toast.type)}`}>
                {toast.title}
              </span>
            )}
            <span className={`text-sm whitespace-pre-wrap ${getTextClass(toast.type)}`}>
              {toast.message}
            </span>
          </div>
        </div>
        <RadixToast.Close asChild>
          <button className="text-gray-400 hover:text-gray-600 p-1">
            <i className="bx bx-x text-lg" />
          </button>
        </RadixToast.Close>
      </motion.div>
    </RadixToast.Root>
  );
}

// Helper functions (defined outside component to prevent re-creation)
const getIconClass = (type: ToastType) => ({
  success: "bxs-check-circle", error: "bxs-x-circle", info: "bxs-info-circle",
  welcome: "bxs-smile", login: "bxs-log-in", notification: "bxs-bell"
}[type]);

const getIconBgClass = (type: ToastType) => ({
  success: "bg-green-100", error: "bg-red-100", info: "bg-blue-100",
  welcome: "bg-yellow-100", login: "bg-indigo-100", notification: "bg-teal-100"
}[type]);

const getIconTextClass = (type: ToastType) => ({
  success: "text-green-600", error: "text-red-600", info: "text-blue-600",
  welcome: "text-yellow-600", login: "text-indigo-600", notification: "text-teal-600"
}[type]);

const getTextClass = (type: ToastType) => ({
  success: "text-green-700", error: "text-red-700", info: "text-blue-700",
  welcome: "text-yellow-700", login: "text-indigo-700", notification: "text-teal-700"
}[type]);

const getBorderClass = (type: ToastType) => ({
  success: "border-green-500", error: "border-red-500", info: "border-blue-500",
  welcome: "border-yellow-500", login: "border-indigo-500", notification: "border-teal-500"
}[type]);