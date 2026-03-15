"use client";

import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useToast } from "@/components/feedback/ToastProvider";
import { CriticalAction } from "@prisma/client";

interface PasswordChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  personnelId: string;
  organizationId: string;
  branchId: string | null;
}

export default function PasswordChangeModal({
  isOpen,
  onClose,
  personnelId,
  organizationId,
  branchId,
}: PasswordChangeModalProps) {
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const { addToast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      addToast({
        type: "error",
        title: "Mismatch",
        message: "New passwords do not match.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/approvals/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: CriticalAction.PASSWORD_CHANGE,
          targetId: personnelId,
          organizationId,
          branchId,
          changes: { newPassword },
          metadata: { verification: currentPassword },
        }),
      });

      if (!res.ok) throw new Error();

      addToast({
        type: "success",
        title: "Request Pending",
        message: "Password change sent for administrative review.",
      });

      onClose();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      addToast({
        type: "error",
        title: "System Error",
        message: "Failed to log security request.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60]" />

        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-2xl shadow-2xl z-[70] outline-none overflow-hidden">
          
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <i className="bx bx-lock-open-alt text-blue-600 text-xl"></i>
              <Dialog.Title className="text-lg font-bold text-slate-800">
                Change Password
              </Dialog.Title>
            </div>

            <Dialog.Close className="text-slate-400 hover:text-slate-900 transition-colors p-1 rounded-md hover:bg-slate-50">
              <i className="bx bx-x text-2xl"></i>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-tight">
                Current Password
              </label>

              <div className="relative">
                <i className="bx bx-key absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-lg"></i>

                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-tight">
                  New Password
                </label>

                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-tight">
                  Confirm
                </label>

                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
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
                className="px-6 py-2 bg-slate-900 hover:bg-black text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
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