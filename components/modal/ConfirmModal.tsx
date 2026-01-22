"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";

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
}

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
}: ConfirmModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  /* Auto-focus confirm button when modal opens */
  useEffect(() => {
    if (open) setTimeout(() => confirmBtnRef.current?.focus(), 100);
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={(val) => !loading && !val && onClose()}>
      <AnimatePresence>
        {open && (
          <>
            {/* Overlay */}
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.45 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black z-[9998]"
              />
            </Dialog.Overlay>

            {/* Content */}
            <Dialog.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.2 }}
                className="fixed z-[9999] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl border border-neutral-200 shadow-xl w-full max-w-md mx-4 p-6 focus:outline-none"
              >
                {/* Title */}
                {loading ? (
                  <div className="h-6 w-48 bg-gray-200 rounded animate-pulse mb-2" />
                ) : (
                  <Dialog.Title className="text-lg font-semibold text-neutral-900">
                    {title}
                  </Dialog.Title>
                )}

                {/* Message */}
                {loading ? (
                  <div className="mt-2 space-y-2">
                    <div className="h-3 w-full bg-gray-200 rounded animate-pulse" />
                    <div className="h-3 w-5/6 bg-gray-200 rounded animate-pulse" />
                  </div>
                ) : (
                  message && <Dialog.Description className="text-sm text-neutral-600 mt-2">{message}</Dialog.Description>
                )}

                {/* Custom content */}
                {!loading && children && <div className="mt-4">{children}</div>}

                {/* Actions */}
                <div className="mt-6 flex justify-end gap-3">
                  <Dialog.Close asChild>
                    <button
                      onClick={onClose}
                      disabled={loading}
                      className="h-11 px-4 rounded-xl border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100 transition disabled:opacity-50"
                    >
                      {cancelLabel}
                    </button>
                  </Dialog.Close>

                  <button
                    ref={confirmBtnRef}
                    onClick={onConfirm}
                    disabled={loading}
                    className={`h-11 px-6 rounded-xl text-white transition disabled:opacity-50 ${
                      destructive ? "bg-red-600 hover:bg-red-700" : "bg-black hover:bg-neutral-800"
                    }`}
                  >
                    {loading ? "Please wait…" : confirmLabel}
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
