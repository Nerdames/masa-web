"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { useCallback } from "react";
import { Loader2 } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message?: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  className?: string;
}

const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const contentVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 6 },
  visible: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: { type: "spring", duration: 0.3, bounce: 0.2 }
  },
};

export default function ConfirmModal({
  open,
  title,
  message,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  onClose,
  onConfirm,
  className = "",
}: ConfirmModalProps) {
  
  const handleConfirm = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    if (loading) return;
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      console.error("Confirmation Error:", err);
    }
  }, [loading, onConfirm, onClose]);

  return (
    <Dialog.Root open={open} onOpenChange={(val) => !loading && !val && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial="hidden"
                animate="visible"
                exit="hidden"
                variants={overlayVariants}
                className="fixed inset-0 bg-slate-900/30 backdrop-blur-[2px] z-[10000] flex items-center justify-center p-4"
              >
                <Dialog.Content asChild>
                  <motion.div
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    variants={contentVariants}
                    className={`relative w-full max-w-[320px] bg-white rounded-xl p-4 
                      shadow-xl border border-slate-100 focus:outline-none ${className}`}
                  >
                    <Dialog.Title className="text-sm font-semibold text-slate-900 tracking-tight">
                      {title}
                    </Dialog.Title>

                    {message && (
                      <Dialog.Description className="mt-1.5 text-[11px] text-slate-500 leading-normal">
                        {message}
                      </Dialog.Description>
                    )}

                    {children && <div className="mt-3">{children}</div>}

                    <div className="mt-5 flex items-center justify-end gap-2">
                      <Dialog.Close asChild>
                        <button
                          disabled={loading}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-slate-500 
                            hover:bg-slate-50 transition-colors disabled:opacity-40"
                        >
                          {cancelLabel}
                        </button>
                      </Dialog.Close>

                      <button
                        onClick={handleConfirm}
                        disabled={loading}
                        className={`min-w-[76px] px-3.5 py-1.5 rounded-lg text-[11px] font-medium 
                          transition-all flex items-center justify-center gap-1.5
                          ${destructive 
                            ? "bg-red-600 text-white hover:bg-red-700" 
                            : "bg-slate-900 text-white hover:bg-slate-800"
                          } disabled:opacity-50`}
                      >
                        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : confirmLabel}
                      </button>
                    </div>
                  </motion.div>
                </Dialog.Content>
              </motion.div>
            </Dialog.Overlay>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}