"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import * as RadixToast from "@radix-ui/react-toast";
import { motion, AnimatePresence } from "framer-motion";
import "boxicons/css/boxicons.min.css";

export type ToastType =
  | "success"
  | "error"
  | "info"
  | "welcome"
  | "login"
  | "notification";

export interface Toast {
  id: string;
  type: ToastType;
  title?: string;       // optional title
  message: string;
  duration?: number;
  onClick?: () => void; // optional click handler
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const addToast = (toast: Omit<Toast, "id">) => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 10);

    const duration = toast.duration ?? 5000; // default 5s
    setToasts((prev) => [...prev, { id, ...toast, duration }]);
  };

  const iconByType: Record<ToastType, string> = {
    success: "bxs-check-circle",
    error: "bxs-x-circle",
    info: "bxs-info-circle",
    welcome: "bxs-smile",
    login: "bxs-log-in",
    notification: "bxs-bell",
  };

  const iconBgByType: Record<ToastType, string> = {
    success: "bg-green-100",
    error: "bg-red-100",
    info: "bg-blue-100",
    welcome: "bg-yellow-100",
    login: "bg-indigo-100",
    notification: "bg-teal-100",
  };

  const iconTextByType: Record<ToastType, string> = {
    success: "text-green-600",
    error: "text-red-600",
    info: "text-blue-600",
    welcome: "text-yellow-600",
    login: "text-indigo-600",
    notification: "text-teal-600",
  };

  const textByType: Record<ToastType, string> = {
    success: "text-green-700",
    error: "text-red-700",
    info: "text-blue-700",
    welcome: "text-yellow-700",
    login: "text-indigo-700",
    notification: "text-teal-700",
  };

  const borderByType: Record<ToastType, string> = {
    success: "border-l-4 border-green-500",
    error: "border-l-4 border-red-500",
    info: "border-l-4 border-blue-500",
    welcome: "border-l-4 border-yellow-500",
    login: "border-l-4 border-indigo-500",
    notification: "border-l-4 border-teal-500",
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}

      <RadixToast.Provider swipeDirection="right">
        <AnimatePresence>
          {toasts.map((t) => (
            <RadixToast.Root
              key={t.id}
              open
              duration={t.duration}
              onOpenChange={(open) => !open && removeToast(t.id)}
            >
              <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 50, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className={`
                  flex items-start justify-between gap-2.5 px-4 py-2.5
                  rounded-lg shadow-lg w-[300px] cursor-pointer bg-white ${borderByType[t.type]}
                `}
                onClick={() => t.onClick?.()}
              >
                {/* Icon + Text */}
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className={`flex items-center justify-center p-1.5 rounded-full ${iconBgByType[t.type]}`}
                  >
                    <i className={`bx ${iconByType[t.type]} ${iconTextByType[t.type]} text-lg`} />
                  </span>

                  <div className="flex flex-col truncate min-w-0">
                    {t.title && (
                      <span className={`font-semibold truncate ${textByType[t.type]}`}>
                        {t.title.length > 30 ? t.title.slice(0, 30) + "..." : t.title}
                      </span>
                    )}
                    <span className={`text-sm truncate ${textByType[t.type]}`}>
                      {t.message.length > 80 ? t.message.slice(0, 80) + "..." : t.message}
                    </span>
                  </div>
                </div>

                {/* Close button */}
                <RadixToast.Close asChild>
                  <button className="flex items-center justify-center text-gray-400 hover:text-gray-600 transition p-1">
                    <i className="bx bx-x text-lg" />
                  </button>
                </RadixToast.Close>
              </motion.div>
            </RadixToast.Root>
          ))}
        </AnimatePresence>

        {/* Bottom-right viewport */}
        <RadixToast.Viewport
          className="
            fixed bottom-5 right-5 flex flex-col-reverse gap-2.5 z-50
            items-end w-auto max-w-[90vw]
          "
        />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}