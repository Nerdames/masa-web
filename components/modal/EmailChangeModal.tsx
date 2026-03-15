"use client";

import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CriticalAction } from "@prisma/client";
import { useToast } from "@/components/feedback/ToastProvider";

interface EmailChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  personnelId: string;
  organizationId: string;
  branchId: string | null;
}

export default function EmailChangeModal({
  isOpen,
  onClose,
  personnelId,
  organizationId,
  branchId,
}: EmailChangeModalProps) {
  const [newEmail, setNewEmail] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const { addToast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/approvals/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: CriticalAction.EMAIL_CHANGE,
          targetId: personnelId,
          organizationId,
          branchId,
          changes: { email: newEmail.trim() },
        }),
      });

      if (!res.ok) throw new Error();

      addToast({
        type: "success",
        title: "Request Logged",
        message: "Pending manager review.",
      });

      onClose();
    } catch {
      addToast({
        type: "error",
        title: "Error",
        message: "Failed to submit request.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60]" />

        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-2xl shadow-2xl z-[70] outline-none">
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <i className="bx bx-envelope text-blue-600 text-xl"></i>
              <Dialog.Title className="text-lg font-bold text-slate-800">
                Change Email
              </Dialog.Title>
            </div>

            <Dialog.Close className="text-slate-400 hover:text-slate-900 transition-colors">
              <i className="bx bx-x text-2xl"></i>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="p-3 bg-amber-50 rounded-lg flex gap-3 border border-amber-100">
              <i className="bx bx-info-circle text-amber-600 text-lg shrink-0"></i>
              <p className="text-xs text-amber-800 font-medium">
                This is a critical action. Access will remain on your current email until approved.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">
                New Email Address
              </label>

              <div className="relative">
                <i className="bx bx-at absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg"></i>

                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                  placeholder="name@domain.com"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20"
              >
                {isSubmitting ? (
                  <i className="bx bx-loader-alt animate-spin"></i>
                ) : (
                  "Submit Request"
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}