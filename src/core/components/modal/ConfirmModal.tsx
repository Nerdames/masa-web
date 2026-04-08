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

// Simplified variants to avoid "jumping" from top to center
const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const contentVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: { type: "spring", duration: 0.4, bounce: 0.3 }
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
            {/* CENTRAL FIX: 
              We make the overlay a flex container that centers its children.
              This ensures the modal is ALWAYS centered regardless of the page height.
            */}
            <Dialog.Overlay asChild>
              <motion.div
                initial="hidden"
                animate="visible"
                exit="hidden"
                variants={overlayVariants}
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-[4px] z-[10000] flex items-center justify-center p-4"
              >
                <Dialog.Content asChild>
                  <motion.div
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    variants={contentVariants}
                    // Removed 'top-1/2 left-1/2 -translate...' as the parent flex handles it now
                    className={`relative w-full max-w-[400px] bg-white rounded-[24px] p-6 
                      shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-slate-100 
                      focus:outline-none ${className}`}
                  >
                    <Dialog.Title className="text-xl font-bold text-slate-900 tracking-tight">
                      {title}
                    </Dialog.Title>

                    {message && (
                      <Dialog.Description className="mt-2 text-[15px] text-slate-500 leading-relaxed">
                        {message}
                      </Dialog.Description>
                    )}

                    {children && <div className="mt-4">{children}</div>}

                    <div className="mt-8 flex items-center justify-end gap-3">
                      <Dialog.Close asChild>
                        <button
                          disabled={loading}
                          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 
                            hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                          {cancelLabel}
                        </button>
                      </Dialog.Close>

                      <button
                        onClick={handleConfirm}
                        disabled={loading}
                        className={`min-w-[100px] px-6 py-2.5 rounded-xl text-sm font-semibold 
                          transition-all flex items-center justify-center gap-2
                          ${destructive 
                            ? "bg-red-500 text-white hover:bg-red-600 shadow-md shadow-red-200" 
                            : "bg-slate-900 text-white hover:bg-slate-800 shadow-md shadow-slate-200"
                          } disabled:opacity-70`}
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmLabel}
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