"use client";

import React, { useState, useMemo } from "react";
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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const { addToast } = useToast();

  // --- Password Strength & Criteria Logic ---
  const criteria = useMemo(() => {
    return {
      length: newPassword.length >= 8,
      uppercase: /[A-Z]/.test(newPassword),
      lowercase: /[a-z]/.test(newPassword),
      number: /[0-9]/.test(newPassword),
      symbol: /[^A-Za-z0-9]/.test(newPassword),
    };
  }, [newPassword]);

  const strengthScore = Object.values(criteria).filter(Boolean).length;

  const strengthDetails = useMemo(() => {
    if (newPassword.length === 0) return { label: "", color: "bg-slate-200", width: "w-0" };
    if (strengthScore <= 2) return { label: "Weak", color: "bg-red-500", width: "w-1/4" };
    if (strengthScore === 3) return { label: "Fair", color: "bg-amber-500", width: "w-2/4" };
    if (strengthScore === 4) return { label: "Good", color: "bg-blue-500", width: "w-3/4" };
    return { label: "Strong", color: "bg-emerald-500", width: "w-full" };
  }, [strengthScore, newPassword]);

  // --- Match Validation Logic ---
  const isStarted = confirmPassword.length > 0;
  const isMatch = isStarted && newPassword === confirmPassword;
  const isMismatch = isStarted && newPassword !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!isMatch) {
      addToast({
        type: "error",
        title: "Mismatch",
        message: "Please ensure your new passwords match before submitting.",
      });
      return;
    }

    if (strengthScore < 3) {
      addToast({
        type: "warning",
        title: "Password too weak",
        message: "Please meet more security criteria before submitting.",
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
        title: "Request Sent",
        message: "Your request is now pending administrative review.",
      });

      handleClose();
    } catch {
      addToast({
        type: "error",
        title: "System Error",
        message: "Failed to log security request. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowPass(false);
    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[60] animate-in fade-in duration-300" />

        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[440px] bg-white rounded-2xl shadow-2xl z-[70] outline-none overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
          
          {/* Header */}
          <header className="px-8 pt-8 pb-4 shrink-0">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                <i className="bx bx-shield-quarter text-blue-600 text-2xl"></i>
              </div>
              <Dialog.Title className="text-xl font-bold text-slate-900">
                Update Password
              </Dialog.Title>
            </div>
            <Dialog.Description className="text-slate-500 text-sm leading-relaxed">
              Create a strong password to secure your account.
            </Dialog.Description>
          </header>

          {/* Main Content Area */}
          <main className="px-8 pb-8 overflow-y-auto">
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Current Password */}
              <div className="group">
                <label className="block text-[13px] font-semibold text-slate-700 mb-1.5 ml-1">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                    placeholder="Enter current password"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                    aria-label={showPass ? "Hide password" : "Show password"}
                  >
                    <i className={`bx ${showPass ? 'bx-hide' : 'bx-show'} text-xl`}></i>
                  </button>
                </div>
              </div>

              <hr className="border-slate-100" />

              {/* New Password & Strength */}
              <div className="space-y-3">
                <div className="group">
                  <label className="block text-[13px] font-semibold text-slate-700 mb-1.5 ml-1">
                    New Password
                  </label>
                  <input
                    type={showPass ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                    placeholder="Create new password"
                  />
                </div>

                {/* Strength Meter */}
                {newPassword.length > 0 && (
                  <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-xs font-medium text-slate-500">Password strength</span>
                      <span className={`text-xs font-bold ${
                        strengthScore <= 2 ? 'text-red-500' :
                        strengthScore === 3 ? 'text-amber-500' :
                        strengthScore === 4 ? 'text-blue-500' : 'text-emerald-500'
                      }`}>
                        {strengthDetails.label}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ease-out ${strengthDetails.color} ${strengthDetails.width}`}
                      />
                    </div>
                  </div>
                )}

                {/* Google-style Criteria List */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 grid grid-cols-2 gap-2 mt-2">
                  <CriteriaItem met={criteria.length} label="8+ characters" />
                  <CriteriaItem met={criteria.uppercase || criteria.lowercase} label="Upper & lowercase" />
                  <CriteriaItem met={criteria.number} label="At least 1 number" />
                  <CriteriaItem met={criteria.symbol} label="At least 1 symbol" />
                </div>
              </div>

              {/* Confirm Password with Visual Validation */}
              <div className="group space-y-1.5">
                <label className="block text-[13px] font-semibold text-slate-700 ml-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`w-full px-4 py-2.5 bg-white border rounded-xl outline-none transition-all pr-10
                      ${!isStarted ? 'border-slate-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500' : ''}
                      ${isMatch ? 'border-emerald-500 focus:ring-4 focus:ring-emerald-500/10' : ''}
                      ${isMismatch ? 'border-red-500 focus:ring-4 focus:ring-red-500/10' : ''}
                    `}
                    placeholder="Repeat new password"
                  />
                  {/* Validation Icons */}
                  {isStarted && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {isMatch ? (
                        <i className="bx bx-check-circle text-emerald-500 text-xl animate-in zoom-in"></i>
                      ) : (
                        <i className="bx bx-x-circle text-red-500 text-xl animate-in zoom-in"></i>
                      )}
                    </div>
                  )}
                </div>
                {isMismatch && (
                  <p className="text-xs text-red-500 font-medium ml-1 animate-in slide-in-from-top-1 fade-in">
                    Passwords do not match
                  </p>
                )}
              </div>

              {/* Footer Actions */}
              <footer className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 mt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || !isMatch || strengthScore < 3}
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

// Helper component for the criteria checklist
function CriteriaItem({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className={`flex items-center justify-center w-4 h-4 rounded-full transition-colors ${
        met ? "bg-emerald-100 text-emerald-600" : "bg-slate-200 text-slate-400"
      }`}>
        <i className={`bx ${met ? 'bx-check' : 'bx-minus'} text-[10px] font-bold`}></i>
      </div>
      <span className={`transition-colors ${met ? "text-slate-700 font-medium" : "text-slate-400"}`}>
        {label}
      </span>
    </div>
  );
}