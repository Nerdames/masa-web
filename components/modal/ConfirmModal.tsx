"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { useEffect, useRef, useCallback } from "react";

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
  autoFocus?: boolean;
  className?: string;
}

const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 0.4 }, // Slightly softer overlay
};

const contentVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1 },
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
  autoFocus = true,
  className = "",
}: ConfirmModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open && autoFocus) {
      requestAnimationFrame(() => confirmBtnRef.current?.focus());
    }
  }, [open, autoFocus]);

  const handleClose = useCallback(() => {
    if (!loading) onClose();
  }, [loading, onClose]);

  const handleConfirm = useCallback(async () => {
    if (loading) return;
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      console.error(err);
    }
  }, [loading, onConfirm, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading) return;
      if (e.key === "Escape") { e.preventDefault(); handleClose(); }
      if (e.key === "Enter") {
        const active = document.activeElement;
        if (active === confirmBtnRef.current || active === cancelBtnRef.current || active?.closest?.("[data-radix-dialog-content]")) {
          e.preventDefault();
          handleConfirm();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, loading, handleClose, handleConfirm]);

  const renderTitle = () =>
    loading ? (
      <div className="h-6 w-48 bg-neutral-100 rounded-full animate-pulse mb-3" />
    ) : (
      <Dialog.Title className="text-lg font-semibold text-neutral-900 mb-1.5">
        {title}
      </Dialog.Title>
    );

  const renderMessage = () =>
    loading ? (
      <div className="space-y-2 mt-2">
        <div className="h-3 w-full bg-neutral-100 rounded-full animate-pulse" />
        <div className="h-3 w-5/6 bg-neutral-100 rounded-full animate-pulse" />
      </div>
    ) : (
      message && (
        <Dialog.Description className="text-[15px] text-neutral-600 leading-relaxed">
          {message}
        </Dialog.Description>
      )
    );

  return (
    <Dialog.Root open={open} onOpenChange={(val) => { if (!loading && !val) onClose(); }}>
      <AnimatePresence>
        {open && (
          <>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial="hidden" animate="visible" exit="hidden"
                variants={overlayVariants}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[9998]"
                onClick={handleClose}
              />
            </Dialog.Overlay>

            <Dialog.Content asChild forceMount data-radix-dialog-content>
              <motion.div
                initial="hidden" animate="visible" exit="hidden"
                variants={contentVariants}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={`fixed z-[9999] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                  bg-white rounded-[24px] border border-neutral-100 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)]
                  w-[calc(100%-2rem)] max-w-[400px] p-6 focus:outline-none ${className}`}
              >
                {renderTitle()}
                {renderMessage()}

                {!loading && children && <div className="mt-5">{children}</div>}

                <div className="mt-8 flex justify-end gap-3">
                  <Dialog.Close asChild>
                    <button
                      ref={cancelBtnRef}
                      onClick={handleClose}
                      disabled={loading}
                      className="h-10 px-5 rounded-full border border-neutral-200 text-neutral-700
                        hover:bg-neutral-50 transition-colors disabled:opacity-50 text-sm font-medium"
                    >
                      {cancelLabel}
                    </button>
                  </Dialog.Close>

                  <button
                    ref={confirmBtnRef}
                    onClick={handleConfirm}
                    disabled={loading}
                    className={`h-10 px-6 rounded-full transition-all text-sm font-medium
                      ${destructive
                        ? "bg-red-50 text-red-600 hover:bg-red-100"
                        : "bg-neutral-900 text-white hover:bg-neutral-800"}
                      flex items-center justify-center gap-2 disabled:opacity-60`}
                  >
                    {loading ? (
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    ) : (
                      confirmLabel
                    )}
                  </button>
                </div>
              </motion.div>
            </Dialog.Content>
          </>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}