"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import * as RadixToast from "@radix-ui/react-toast";
import { motion, AnimatePresence } from "framer-motion";
import "boxicons/css/boxicons.min.css";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
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

    const duration = toast.duration ?? 3000;
    setToasts((prev) => [...prev, { id, ...toast, duration }]);
  };

  const iconByType: Record<ToastType, string> = {
    success: "bxs-check-circle",
    error: "bxs-x-circle",
    info: "bxs-info-circle",
  };

  const colorByType: Record<ToastType, string> = {
    success: "#16a34a",
    error: "#dc2626",
    info: "#3b82f6",
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}

      <RadixToast.Provider swipeDirection="right">
        <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-50 items-end">
          <AnimatePresence>
            {toasts.map((t) => (
              <RadixToast.Root
                key={t.id}
                open
                duration={t.duration}
                onOpenChange={(open) => !open && removeToast(t.id)}
              >
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className={`flex items-center justify-between gap-2 px-4 py-2 rounded-lg text-white shadow-lg max-w-[90vw] w-fit`}
                  style={{ backgroundColor: colorByType[t.type] }}
                >
                  <div className="flex items-center gap-2">
                    <i className={`bx ${iconByType[t.type]} text-xl`} />
                    <span className="break-words">{t.message}</span>
                  </div>

                  <RadixToast.Close asChild>
                    <button className="flex items-center justify-center text-white hover:text-gray-200 transition p-1">
                      <i className="bx bx-x text-lg" />
                    </button>
                  </RadixToast.Close>
                </motion.div>
              </RadixToast.Root>
            ))}
          </AnimatePresence>
        </div>
        <RadixToast.Viewport className="fixed bottom-0 right-0 p-4 flex flex-col gap-2" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
