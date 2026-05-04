"use client";

import React, { useState, useMemo, useEffect, FormEvent, JSX } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useAnimation } from "framer-motion";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/**
 * MASA - Password Update Interface
 * Professional version optimized for clarity and security.
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
    // Generates a simple session identifier for support reference
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
    if (strengthScore === 4) return { label: "Good", color: "bg-blue-500", width: "w-3/4" };
    return { label: "Strong", color: "bg-emerald-500", width: "w-full" };
  }, [strengthScore, newPassword]);

  const isStarted = confirmPassword.length > 0;
  const isMatch = isStarted && newPassword === confirmPassword;
  const canSubmit = isMatch && strengthScore >= 3 && currentPassword.length > 0 && !loading;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) {
      await controls.start({ x: [-8, 8, -6, 6, 0], transition: { duration: 0.4 } });
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

      // Sync the local session so the middleware knows the change is complete
      await update({
        ...data.profile,
        requiresPasswordChange: false,
      });

      dispatch({
        kind: "PUSH",
        type: "SUCCESS",
        title: "Password Updated",
        message: "Your security settings have been saved. Redirecting...",
      });

      setTimeout(() => {
        window.location.href = "/";
      }, 1200);

    } catch (err: any) {
      await controls.start({ x: [-8, 8, -6, 6, 0], transition: { duration: 0.4 } });
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
      animate={controls}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      className="flex flex-col bg-white overflow-hidden w-full h-full lg:w-auto lg:h-auto lg:max-w-[850px] lg:rounded-[2rem] lg:border lg:border-slate-100 lg:shadow-[0_40px_80px_-15px_rgba(0,0,0,0.1)]"
    >
      <header className="px-8 py-6 text-center border-b border-slate-50">
        <h2 className="text-xl font-bold text-slate-900">Update Your Password</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
          Security Update Required
        </p>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row">
        <form id="password-form" onSubmit={handleSubmit} className="flex-1 p-8 space-y-6 lg:border-r lg:border-slate-50">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Current Password</label>
            <div className="relative flex items-center">
              <i className="bx bx-lock-open-alt absolute left-4 text-slate-400 text-lg" />
              <input
                type={showPass ? "text" : "password"}
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                required
              />
            </div>
          </div>

          <div className="h-px w-full bg-slate-100" />

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">New Password</label>
            <div className="relative flex items-center">
              <i className="bx bx-shield-quarter absolute left-4 text-slate-400 text-lg" />
              <input
                type={showPass ? "text" : "password"}
                placeholder="Create new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-4 text-slate-400 hover:text-blue-600 transition-colors"
              >
                <i className={`bx ${showPass ? "bx-hide" : "bx-show"} text-xl`} />
              </button>
            </div>
          </div>
        </form>

        <div className="flex-1 p-8 space-y-6 bg-slate-50/50">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase text-slate-400">
                <span>Strength: <span className="text-slate-900">{strengthDetails.label}</span></span>
                <span>{strengthScore}/4</span>
              </div>
              <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-500 ${strengthDetails.color} ${strengthDetails.width}`} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <CriteriaItem met={criteria.length} label="8+ Chars" />
              <CriteriaItem met={criteria.casing} label="A/a Case" />
              <CriteriaItem met={criteria.number} label="Number" />
              <CriteriaItem met={criteria.symbol} label="Symbol" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Confirm Password</label>
            <div className="relative flex items-center">
              <i className="bx bx-check-shield absolute left-4 text-slate-400 text-lg" />
              <input
                type={showPass ? "text" : "password"}
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full pl-12 pr-12 py-3.5 border rounded-xl text-sm transition-all
                  ${!isStarted ? "bg-slate-50 border-slate-200" : isMatch ? "border-emerald-500 bg-emerald-50/30" : "border-red-400 bg-red-50/30"}
                `}
                required
              />
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 bg-white border-t border-slate-100 flex flex-col lg:flex-row items-center justify-between gap-4">
        <p className="text-[11px] text-slate-400 font-medium text-center lg:text-left">
          Ensure your password is unique and not used on other platforms.
        </p>
        <button
          type="submit"
          form="password-form"
          disabled={!canSubmit || loading}
          className="w-full lg:w-48 py-4 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-30"
        >
          {loading ? <i className="bx bx-loader-alt animate-spin text-lg" /> : "Save Changes"}
        </button>
      </div>

      <footer className="bg-slate-50 px-8 py-3 flex items-center justify-between border-t border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">System Online</span>
        </div>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Session: {sessionId}</span>
      </footer>
    </motion.div>
  );
};

function CriteriaItem({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <i className={`bx ${met ? "bx-check-circle text-emerald-500" : "bx-circle text-slate-300"} text-base`} />
      <span className={`text-[11px] font-bold ${met ? "text-slate-900" : "text-slate-400"}`}>{label}</span>
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
    <div className="h-screen w-full bg-[#F8FAFC] flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -left-20 -top-20 w-[600px] h-[600px] bg-blue-50 rounded-full blur-3xl" />
        <div className="absolute -right-20 -bottom-20 w-[600px] h-[600px] bg-indigo-50 rounded-full blur-3xl" />
      </div>

      <header className="h-20 flex-none z-30">
        <nav className="max-w-7xl mx-auto px-8 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black">M</div>
            <span className="text-xl font-bold tracking-tight text-slate-900">MASA</span>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/signin" })} className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors">
            Sign Out
          </button>
        </nav>
      </header>

      <main className="flex-1 relative z-20 flex items-center justify-center px-6">
        <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <section className="hidden lg:flex flex-col space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-amber-100">
                Action Required
              </div>
              <h1 className="text-6xl font-extrabold leading-[1.1] tracking-tight text-slate-900">
                Secure <br />
                <span className="text-blue-600">Your Account.</span>
              </h1>
              <p className="text-lg text-slate-600 max-w-md font-medium leading-relaxed">
                You are using a temporary password. Please set a new, secure password to continue to your dashboard.
              </p>
            </div>
          </section>

          <section className="flex justify-center lg:justify-end">
            <ResetPasswordForm />
          </section>
        </div>
      </main>

      <footer className="h-16 border-t border-slate-100 z-30 bg-white/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-8 h-full flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <div className="flex gap-8">
            <button onClick={() => signOut({ callbackUrl: "/signin" })} className="hover:text-red-500 transition-colors">Cancel</button>
            <Link href="/support" className="hover:text-slate-900 transition-colors">Tech Support</Link>
          </div>
          <p>&copy; 2026 MASA Ecosystem</p>
        </div>
      </footer>
    </div>
  );
}