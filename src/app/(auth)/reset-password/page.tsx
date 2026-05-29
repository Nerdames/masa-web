"use client";

import React, { useState, useMemo, useEffect, FormEvent, JSX } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useAnimation } from "framer-motion";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { Loader2 } from "lucide-react";

/**
 * MASA - Password Update Terminal
 * Perfectly synchronized with SignInTerminal (360px constraints, font hierarchies, and spacing layouts)
 */

const ResetPasswordForm: React.FC = () => {
  const { update } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  
  const controls = useAnimation();
  const { dispatch } = useAlerts();

  useEffect(() => {
    setSessionId(Math.random().toString(36).substring(2, 8).toUpperCase());
  }, []);

  const criteria = useMemo(
    () => ({
      length: newPassword.length >= 8,
      casing: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword),
      number: /[0-9]/.test(newPassword),
      symbol: /[^A-Za-z0-9]/.test(newPassword),
    }),
    [newPassword]
  );

  const strengthScore = Object.values(criteria).filter(Boolean).length;

  const strengthDetails = useMemo(() => {
    if (newPassword.length === 0) return { label: "Required", color: "bg-slate-200", width: "w-0" };
    if (strengthScore <= 2) return { label: "Weak", color: "bg-red-400", width: "w-1/4" };
    if (strengthScore === 3) return { label: "Fair", color: "bg-amber-400", width: "w-2/4" };
    return { label: "Strong", color: "bg-emerald-500", width: "w-full" };
  }, [strengthScore, newPassword]);

  const isStarted = confirmPassword.length > 0;
  const isMatch = isStarted && newPassword === confirmPassword;
  const canSubmit = isMatch && strengthScore >= 3 && currentPassword.length > 0 && !loading;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) {
      await controls.start({ x: [-8, 8, -8, 8, 0], transition: { duration: 0.4 } });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update password.");

      await update({
        ...data.profile,
        requiresPasswordChange: false,
      });

      dispatch({
        kind: "PUSH",
        type: "SUCCESS",
        title: "Password Updated",
        message: "Redirecting to your dashboard...",
      });

      setTimeout(() => {
        window.location.href = "/";
      }, 800);

    } catch (err: any) {
      await controls.start({ x: [-8, 8, -8, 8, 0], transition: { duration: 0.4 } });
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Update Failed",
        message: err?.message || "An unexpected error occurred.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-[360px] bg-white rounded-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden"
    >
      <header className="p-6 pb-4 text-center">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Update Password</h2>
        <p className="text-xs text-slate-500 mt-1">Security mandatory profile initialization</p>
      </header>

      <div className="px-6 pb-6 space-y-4">
        <motion.form animate={controls} id="password-form" onSubmit={handleSubmit} className="space-y-4">
          
          {/* Current Password */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider ml-1">Current Password</label>
            <div className="relative flex items-center">
              <i className="bx bx-lock-open-alt absolute left-3 text-slate-400 text-base" />
              <input
                type={showPass ? "text" : "password"}
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={loading}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:border-blue-500 outline-none transition-all disabled:opacity-70 disabled:bg-slate-100"
                required
              />
            </div>
          </div>

          <div className="h-px w-full bg-slate-100 my-1" />

          {/* New Password */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider ml-1">New Password</label>
            <div className="relative flex items-center">
              <i className="bx bx-shield-quarter absolute left-3 text-slate-400 text-base" />
              <input
                type={showPass ? "text" : "password"}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={loading}
                className="w-full pl-9 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:border-blue-500 outline-none transition-all disabled:opacity-70 disabled:bg-slate-100"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                disabled={loading}
                className="absolute right-3 text-slate-400 hover:text-blue-600 transition-colors"
              >
                <i className={showPass ? "bx bx-hide text-sm" : "bx bx-show text-sm"} />
              </button>
            </div>
          </div>

          {/* Password Metrics Box */}
          <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl space-y-2.5">
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[9px] font-bold uppercase text-slate-400 tracking-wide">
                <span>Strength: <span className="text-slate-700">{strengthDetails.label}</span></span>
                <span>{strengthScore}/4</span>
              </div>
              <div className="h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-500 ${strengthDetails.color} ${strengthDetails.width}`} />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
              <CriteriaItem met={criteria.length} label="8+ Chars" />
              <CriteriaItem met={criteria.casing} label="A/a Case" />
              <CriteriaItem met={criteria.number} label="Number" />
              <CriteriaItem met={criteria.symbol} label="Symbol" />
            </div>
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider ml-1">Confirm Password</label>
            <div className="relative flex items-center">
              <i className="bx bx-check-shield absolute left-3 text-slate-400 text-base" />
              <input
                type={showPass ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                className={`w-full pl-9 pr-3 py-2.5 border rounded-lg text-xs outline-none transition-all disabled:opacity-70
                  ${!isStarted ? "bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500" : isMatch ? "border-emerald-500 bg-emerald-50/20" : "border-red-400 bg-red-50/20"}
                `}
                required
              />
            </div>
          </div>

          {/* Action Trigger */}
          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : "Save Changes"}
          </button>
        </motion.form>

        <div className="flex flex-col items-center gap-2 pt-4 border-t border-slate-100">
          <p className="text-[10px] text-slate-400">Changed your mind?</p>
          <button 
            onClick={() => signOut({ callbackUrl: "/signin" })}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
          >
            Cancel & Return to Sign In
          </button>
        </div>
      </div>
    </motion.div>
  );
};

function CriteriaItem({ met, label }: { met: boolean | number; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <i className={`bx ${met ? "bx-check-circle text-emerald-500" : "bx-circle text-slate-300"} text-xs`} />
      <span className={`text-[10px] font-bold tracking-wide ${met ? "text-slate-800" : "text-slate-400"}`}>{label}</span>
    </div>
  );
}

export default function PasswordResetPage(): JSX.Element | null {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/signin");
    } else if (status === "authenticated" && !session?.user?.requiresPasswordChange) {
      router.replace("/");
    }
  }, [status, session, router]);

  if (status === "loading" || (status === "authenticated" && !session?.user?.requiresPasswordChange)) {
    return null;
  }

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] flex flex-col overflow-y-auto overflow-x-hidden relative">
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden hidden lg:block">
        <div className="absolute -left-20 -top-20 w-[400px] h-[400px] bg-blue-100/50 rounded-full blur-3xl" />
        <div className="absolute -right-20 -bottom-20 w-[400px] h-[400px] bg-indigo-100/50 rounded-full blur-3xl" />
      </div>

      <header className="flex-none z-30 h-16">
        <nav className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-blue-600 text-white flex items-center justify-center font-black text-sm">M</div>
            <span className="text-lg font-bold tracking-tight text-slate-900">MASA</span>
          </div>
          <button 
            onClick={() => signOut({ callbackUrl: "/signin" })} 
            className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
          >
            Sign Out
          </button>
        </nav>
      </header>

      <main className="flex-1 relative z-20 flex items-center justify-center px-4 py-8">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <section className="hidden lg:flex flex-col space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border border-amber-100">
                Action Required
              </div>
              <h1 className="text-4xl lg:text-5xl font-extrabold leading-[1.1] tracking-tight text-slate-900">
                Secure <br />
                <span className="text-blue-600">Your Account.</span>
              </h1>
              <p className="text-sm lg:text-base text-slate-600 max-w-sm font-medium leading-relaxed">
                Set a highly resilient, unique security key to finish configuring your operational dashboard profile.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-xs">
              <div className="p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Reliable</p>
                <p className="text-[10px] text-slate-500 font-bold mt-0.5">99.9% Uptime</p>
              </div>
              <div className="p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Secure</p>
                <p className="text-[10px] text-slate-500 font-bold mt-0.5">End-to-end encryption</p>
              </div>
            </div>
          </section>

          <section className="flex justify-center lg:justify-end">
            <ResetPasswordForm />
          </section>
        </div>
      </main>
    </div>
  );
}