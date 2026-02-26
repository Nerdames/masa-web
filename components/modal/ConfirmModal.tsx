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
  visible: { opacity: 0.25 },
};

const contentVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
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

  // Focus confirm button when modal opens
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

  // Keyboard accessibility: Enter = confirm, Escape = cancel
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading) return;

      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }

      if (e.key === "Enter") {
        const active = document.activeElement;
        if (
          active === confirmBtnRef.current ||
          active === cancelBtnRef.current ||
          active?.closest?.("[data-radix-dialog-content]")
        ) {
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
      <div className="h-5 w-40 bg-gray-200 rounded-full animate-pulse mb-2" />
    ) : (
      <Dialog.Title className="text-base font-semibold text-neutral-900">
        {title}
      </Dialog.Title>
    );

  const renderMessage = () =>
    loading ? (
      <div className="mt-2 space-y-1">
        <div className="h-2.5 w-full bg-gray-200 rounded-full animate-pulse" />
        <div className="h-2.5 w-5/6 bg-gray-200 rounded-full animate-pulse" />
      </div>
    ) : (
      message && (
        <Dialog.Description className="text-sm text-neutral-600 mt-1.5 leading-relaxed">
          {message}
        </Dialog.Description>
      )
    );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(val) => {
        if (!loading && !val) onClose();
      }}
    >
      <AnimatePresence>
        {open && (
          <>
            {/* Overlay */}
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial="hidden"
                animate="visible"
                exit="hidden"
                variants={overlayVariants}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black z-[9998]"
                onClick={handleClose}
              />
            </Dialog.Overlay>

            {/* Modal Content */}
            <Dialog.Content
              asChild
              forceMount
              data-radix-dialog-content
            >
              <motion.div
                initial="hidden"
                animate="visible"
                exit="hidden"
                variants={contentVariants}
                transition={{ duration: 0.25 }}
                className={`fixed z-[9999] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                  bg-white rounded-2xl border border-neutral-200 shadow-[0_8px_20px_rgba(0,0,0,0.08)]
                  w-full max-w-sm mx-4 p-5 focus:outline-none ${className}`}
              >
                {renderTitle()}
                {renderMessage()}

                {!loading && children && <div className="mt-3">{children}</div>}

                <div className="mt-4 flex justify-end gap-2.5">
                  {/* Cancel */}
                  <Dialog.Close asChild>
                    <button
                      ref={cancelBtnRef}
                      onClick={handleClose}
                      disabled={loading}
                      className="h-8 px-3 rounded-lg border border-neutral-300 bg-white text-neutral-900
                        hover:bg-neutral-50 focus:ring-2 focus:ring-offset-2 focus:ring-black
                        transition disabled:opacity-50 text-sm"
                    >
                      {cancelLabel}
                    </button>
                  </Dialog.Close>

                  {/* Confirm */}
                  <button
                    ref={confirmBtnRef}
                    onClick={handleConfirm}
                    disabled={loading}
                    className={`h-8 px-4 rounded-lg transition text-sm disabled:opacity-50
                      ${destructive
                        ? "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                        : "bg-black text-white hover:bg-neutral-800"}
                      flex items-center justify-center gap-2
                      focus:ring-2 focus:ring-offset-2 focus:ring-black`}
                  >
                    {loading ? (
                      <svg
                        className="animate-spin h-4 w-4 text-current"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>
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