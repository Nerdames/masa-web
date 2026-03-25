"use client";

import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CriticalAction } from "@prisma/client";
import { useAlerts } from "@/src/core/components/feedback/AlertProvider";

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
  const [newEmail, setNewEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { dispatch } = useAlerts();

  const isValidEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // Live validation state
  const isStarted = newEmail.length > 0;
  const isEmailValid = isValidEmail(newEmail);
  const isEmailInvalid = isStarted && !isEmailValid;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const email = newEmail.trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Invalid Email",
        message: "Please enter a valid email address.",
      });
      return;
    }

    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/approvals/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actionType: CriticalAction.EMAIL_CHANGE,
          targetId: personnelId,
          organizationId,
          branchId,
          changes: { email },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Request failed");
      }

      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Request Logged",
        message:
          "Your email change request is pending administrative review.",
      });

      handleClose();
    } catch (err: unknown) {
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "System Error",
        message:
          err instanceof Error
            ? err.message
            : "Failed to submit request. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setNewEmail("");
    onClose();
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[60] animate-in fade-in duration-300" />

        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[440px] bg-white rounded-2xl shadow-2xl z-[70] outline-none overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
          aria-describedby="email-change-description"
        >
          {/* Header */}
          <header className="px-8 pt-8 pb-4 shrink-0">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                <i className="bx bx-envelope text-blue-600 text-2xl"></i>
              </div>
              <Dialog.Title className="text-xl font-bold text-slate-900">
                Update Email
              </Dialog.Title>
            </div>
            <Dialog.Description className="text-slate-500 text-sm leading-relaxed">
              Submit a request to change your primary contact email.
            </Dialog.Description>
          </header>

          {/* Main Content Area */}
          <main className="px-8 pb-8 overflow-y-auto">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Context Notice */}
              <div
                id="email-change-description"
                className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex gap-3"
              >
                <i className="bx bx-info-circle text-amber-600 text-lg mt-0.5"></i>
                <p className="text-[13px] text-amber-800 leading-snug">
                  This is a critical action. You will continue to log in and
                  receive communications at your <strong>current</strong> email
                  until this is approved.
                </p>
              </div>

              <hr className="border-slate-100" />

              {/* Email Input */}
              <div className="group space-y-1.5">
                <label className="block text-[13px] font-semibold text-slate-700 ml-1">
                  New Email Address
                </label>
                <div className="relative">
                  <i
                    className={`bx bx-at absolute left-4 top-1/2 -translate-y-1/2 text-lg transition-colors ${
                      isStarted ? "text-blue-500" : "text-slate-400"
                    }`}
                  ></i>

                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value.trim())}
                    placeholder="name@domain.com"
                    autoComplete="email"
                    className={`w-full pl-11 pr-10 py-2.5 bg-white border rounded-xl outline-none transition-all
                      ${!isStarted ? "border-slate-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" : ""}
                      ${isEmailValid ? "border-emerald-500 focus:ring-4 focus:ring-emerald-500/10" : ""}
                      ${isEmailInvalid ? "border-amber-500 focus:ring-4 focus:ring-amber-500/10" : ""}
                    `}
                  />

                  {/* Validation Icon */}
                  {isStarted && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {isEmailValid ? (
                        <i className="bx bx-check-circle text-emerald-500 text-xl animate-in zoom-in"></i>
                      ) : (
                        <i className="bx bx-error-circle text-amber-500 text-xl animate-in zoom-in"></i>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <footer className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 mt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || !isEmailValid}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                >
                  {isSubmitting ? (
                    <i className="bx bx-loader-alt animate-spin text-lg"></i>
                  ) : (
                    "Submit Request"
                  )}
                </button>
              </footer>
            </form>
          </main>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}