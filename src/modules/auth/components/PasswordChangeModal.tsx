"use client";

import React, { useState, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSession } from "next-auth/react";

interface PasswordChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMandatory?: boolean; 
}

export default function PasswordChangeModal({
  isOpen,
  onClose,
  isMandatory = false,
}: PasswordChangeModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const { dispatch } = useAlerts();
  const { update } = useSession();

  // --- Logic: Security Criteria ---
  const criteria = useMemo(() => ({
    length: newPassword.length >= 8,
    casing: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
    symbol: /[^A-Za-z0-9]/.test(newPassword),
  }), [newPassword]);

  const strengthScore = Object.values(criteria).filter(Boolean).length;

  const strengthDetails = useMemo(() => {
    if (newPassword.length === 0) return { label: "", color: "bg-slate-200", width: "w-0" };
    if (strengthScore <= 2) return { label: "Weak", color: "bg-red-500", width: "w-1/4" };
    if (strengthScore === 3) return { label: "Fair", color: "bg-amber-500", width: "w-2/4" };
    if (strengthScore === 4) return { label: "Good", color: "bg-blue-600", width: "w-3/4" };
    return { label: "Strong", color: "bg-emerald-500", width: "w-full" };
  }, [strengthScore, newPassword]);

  const isStarted = confirmPassword.length > 0;
  const isMatch = isStarted && newPassword === confirmPassword;
  const isMismatch = isStarted && newPassword !== confirmPassword;

  // Global Check: Disable submission unless all core protocols are met
  const canSubmit = isMatch && strengthScore >= 3 && currentPassword.length > 0 && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update security credentials.");

      // Refresh JWT to clear mandatory change flags
      await update({ requiresPasswordChange: false });

      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Protocol Success",
        message: "Credentials updated. Session state refreshed.",
      });

      handleClose();
    } catch (err: any) {
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Update Failed",
        message: err.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isMandatory) return;
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={isMandatory ? undefined : handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] animate-in fade-in duration-300" />
        <Dialog.Content 
          onPointerDownOutside={(e) => isMandatory && e.preventDefault()}
          onEscapeKeyDown={(e) => isMandatory && e.preventDefault()}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-32px)] max-w-[420px] bg-white rounded-3xl shadow-2xl z-[70] outline-none overflow-hidden animate-in zoom-in-95 fade-in duration-200"
        >
          <header className="p-8 pb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-lg shadow-slate-900/20">
                <i className="bx bxs-lock-open text-xl"></i>
              </div>
              <Dialog.Title className="text-xl font-black uppercase tracking-tight text-slate-900">
                {isMandatory ? "Initial Security" : "Update Credentials"}
              </Dialog.Title>
            </div>
            <Dialog.Description className="text-slate-500 text-[13px] font-medium leading-relaxed">
              {isMandatory 
                ? "First-time login detected. You must establish a new security protocol." 
                : "Modify your access credentials to maintain account integrity."}
            </Dialog.Description>
          </header>

          <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5">
            {/* Current Password */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Current Protocol</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-black/[0.06] rounded-xl text-sm font-bold focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 transition-colors"
                >
                  <i className={`bx ${showPass ? "bx-hide" : "bx-show"} text-lg`}></i>
                </button>
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            {/* New Password */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">New Credential</label>
                <input
                  type={showPass ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-black/[0.06] rounded-xl text-sm font-bold focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all"
                />
              </div>

              {/* Strength Visualizer */}
              {newPassword.length > 0 && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-500 ${strengthDetails.color} ${strengthDetails.width}`} />
                  </div>
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Complexity: {strengthDetails.label}</span>
                    <span className="text-[10px] font-black text-slate-900">{strengthScore}/4</span>
                  </div>
                </div>
              )}

              {/* Criteria Grid */}
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-black/[0.03]">
                <CriteriaItem met={criteria.length} label="8+ Chars" />
                <CriteriaItem met={criteria.casing} label="A/a Case" />
                <CriteriaItem met={criteria.number} label="Number" />
                <CriteriaItem met={criteria.symbol} label="Symbol" />
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Verify Credential</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full px-4 py-3 bg-white border rounded-xl text-sm font-bold outline-none transition-all
                    ${!isStarted ? 'border-black/[0.06]' : isMatch ? 'border-emerald-500 ring-4 ring-emerald-500/5' : 'border-red-500 ring-4 ring-red-500/5'}
                  `}
                />
                {isStarted && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <i className={`bx ${isMatch ? 'bx-check-circle text-emerald-500' : 'bx-error-circle text-red-500'} text-xl animate-in zoom-in`} />
                  </div>
                )}
              </div>
            </div>

            <footer className="pt-4 flex flex-col gap-3">
              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full py-3.5 bg-slate-900 text-white text-[13px] font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-slate-900/20 hover:bg-slate-800 disabled:opacity-20 disabled:grayscale transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isSubmitting ? <i className="bx bx-loader-alt animate-spin text-lg" /> : "Authorize Change"}
              </button>
              
              {!isMandatory && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full py-2 text-[11px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Dismiss Protocol
                </button>
              )}
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CriteriaItem({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-all ${met ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400"}`}>
        <i className={`bx ${met ? 'bx-check' : 'bx-minus'} text-[10px] font-black`} />
      </div>
      <span className={`text-[10px] font-bold uppercase tracking-tight ${met ? "text-slate-700" : "text-slate-400"}`}>
        {label}
      </span>
    </div>
  );
}