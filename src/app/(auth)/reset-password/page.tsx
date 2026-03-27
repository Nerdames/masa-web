"use client";

import React, { useState, useMemo, useEffect, FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useAnimation } from "framer-motion";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/**
 * MASA Terminal v3.0 - Mandatory Credential Rotation
 * Security Protocol: Optimized for Single-Screen Stability (Zero Scroll)
 *
 * Production-ready: responsive, zero-scroll, accessible, and resilient to zoom/large fonts.
 */

const ResetPasswordForm: React.FC = () => {
  const { data: session, update } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hwId, setHwId] = useState("");
  const controls = useAnimation();
  const router = useRouter();
  const { dispatch } = useAlerts();

  useEffect(() => {
    setHwId(Math.random().toString(36).substring(2, 8).toUpperCase());
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
    if (newPassword.length === 0)
      return { label: "Required", color: "bg-slate-200", width: "w-0" };
    if (strengthScore <= 2)
      return { label: "Weak", color: "bg-red-400", width: "w-1/4" };
    if (strengthScore === 3)
      return { label: "Fair", color: "bg-amber-400", width: "w-2/4" };
    if (strengthScore === 4)
      return { label: "Good", color: "bg-blue-500", width: "w-3/4" };
    return { label: "Strong", color: "bg-emerald-500", width: "w-full" };
  }, [strengthScore, newPassword]);

  const isStarted = confirmPassword.length > 0;
  const isMatch = isStarted && newPassword === confirmPassword;
  const canSubmit =
    isMatch && strengthScore >= 3 && currentPassword.length > 0 && !loading;

  const handleRotation = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) {
      await controls.start({
        x: [-8, 8, -6, 6, -4, 4, 0],
        transition: { duration: 0.4 },
      });
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
      if (!res.ok) throw new Error(data.message || "Protocol rejection.");

      await fetch(
        `/api/preferences?category=SYSTEM&key=TEMP_CREDENTIAL&scope=USER&target=${session?.user?.email}&isGlobal=true`,
        { method: "DELETE" }
      );

      await update({ requiresPasswordChange: false });

      dispatch({
        kind: "PUSH",
        type: "SUCCESS",
        title: "Protocol Success",
        message: "Temporary credentials purged. Session fortified.",
      });

      setTimeout(() => {
        router.replace("/dashboard");
        router.refresh();
      }, 800);
    } catch (err: any) {
      await controls.start({
        x: [-8, 8, -6, 6, -4, 4, 0],
        transition: { duration: 0.4 },
      });
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Update Failed",
        message: err?.message ?? "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
      className={`
        flex flex-col bg-white/95 backdrop-blur-3xl overflow-hidden
        w-full h-full rounded-none border-0 min-h-0 min-w-0
        lg:w-auto lg:h-auto lg:max-w-[900px] lg:rounded-2xl lg:border lg:border-white lg:shadow-[0_40px_80px_-15px_rgba(0,0,0,0.08)]
      `}
    >
      <header className="px-6 py-4 text-center border-b border-slate-100/60 bg-white/50 shrink-0">
        <h2 className="text-[clamp(16px,2.6vw,20px)] font-black tracking-tight text-slate-800">
          Security Hardening
        </h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.25em] mt-1">
          Credential Rotation Required
        </p>
      </header>

      {/* Main content: no internal scroll, flexible shrink */}
      <div className="flex-1 no-scroll min-h-0 flex flex-col">
        <form
          id="rotation-form"
          onSubmit={handleRotation}
          className="h-full flex flex-col lg:flex-row gap-3 min-h-0"
        >
          {/* Left Wing */}
          <div className="flex-1 p-4 lg:p-8 space-y-4 lg:border-r lg:border-slate-100/60 min-h-0">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2 block">
                Current Protocol
              </label>
              <div className="relative flex items-center">
                <i className="bx bx-lock-open-alt absolute left-4 text-slate-400 text-lg" />
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="Temporary Password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-3.5 bg-slate-50/80 border border-slate-200/60 rounded-xl text-[14px] font-semibold text-slate-800 focus:bg-white focus:border-blue-500/50 outline-none transition-all min-w-0"
                  required
                />
              </div>
            </div>

            <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200/60 to-transparent" />

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2 block">
                New Credential
              </label>
              <div className="relative flex items-center">
                <i className="bx bx-shield-quarter absolute left-4 text-slate-400 text-lg" />
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="Create new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50/80 border border-slate-200/60 rounded-xl text-[14px] font-semibold text-slate-800 focus:bg-white focus:border-blue-500/50 outline-none transition-all min-w-0"
                  required
                />
              </div>
            </div>
          </div>

          {/* Right Wing */}
          <div className="flex-1 p-4 lg:p-8 space-y-4 bg-slate-50/30 min-h-0">
            <div className="space-y-4">
              <div className="space-y-2 px-1">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>
                    Strength: <span className="text-slate-700">{strengthDetails.label}</span>
                  </span>
                  <span>{strengthScore}/4</span>
                </div>

                <div className="h-1.5 w-full bg-slate-200/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${strengthDetails.color} ${strengthDetails.width}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <CriteriaItem met={criteria.length} label="8+ Chars" />
                <CriteriaItem met={criteria.casing} label="A/a Case" />
                <CriteriaItem met={criteria.number} label="Number" />
                <CriteriaItem met={criteria.symbol} label="Symbol" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2 block">
                Verify Credential
              </label>

              <div className="relative flex items-center">
                <i className="bx bx-check-shield absolute left-4 text-slate-400 text-lg" />
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full pl-12 pr-12 py-3.5 bg-slate-50/80 border rounded-xl text-[14px] font-semibold transition-all min-w-0
                    ${!isStarted ? "border-slate-200/60" : isMatch ? "border-emerald-500/50 bg-emerald-50/30" : "border-red-400/50 bg-red-50/30"}
                  `}
                  required
                />
                {isStarted && (
                  <i
                    className={`bx ${isMatch ? "bx-check-circle text-emerald-500" : "bx-error-circle text-red-400"} absolute right-4 text-xl`}
                  />
                )}
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Bottom Sticky Action Area */}
      <div className="p-4 lg:p-6 shrink-0 bg-white border-t border-slate-100/60 lg:flex lg:items-center lg:justify-between lg:gap-6">
        <div className="hidden lg:block flex-1">
          <p className="text-[11px] text-slate-400 font-medium leading-tight">
            Once rotated, temporary credentials will be permanently purged from the security node.
          </p>
        </div>

        <button
          type="submit"
          form="rotation-form"
          disabled={!canSubmit || loading}
          className="w-full lg:w-64 py-3.5 flex items-center justify-center gap-2 bg-slate-900 text-white rounded-xl text-[12px] font-bold uppercase tracking-[0.15em] shadow-lg hover:bg-slate-800 transition-all active:scale-[0.98] disabled:opacity-40 btn-primary"
        >
          {loading ? <i className="bx bx-loader-alt animate-spin text-lg" /> : "Authorize Rotation"}
        </button>
      </div>

      <footer className="bg-slate-50/80 px-6 py-3 flex items-center justify-between border-t border-slate-100/80 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Node Active</span>
        </div>

        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">HW-ID: {hwId}</span>
      </footer>
    </motion.div>
  );
};

function CriteriaItem({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300 ${met ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 scale-110" : "bg-slate-200 text-slate-400"}`}
      >
        <i className={`bx ${met ? "bx-check" : "bx-minus"} text-[10px] font-black`} />
      </div>
      <span className={`text-[10.5px] font-bold tracking-wide transition-colors duration-300 ${met ? "text-slate-800" : "text-slate-400"}`}>
        {label}
      </span>
    </div>
  );
}

export default function PasswordResetPage(): JSX.Element {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/signin");
    if (status === "authenticated" && !session?.user?.requiresPasswordChange) router.replace("/dashboard");
  }, [status, session, router]);

  if (status === "loading") return null;

  return (
    <div className="h-screen w-full bg-[#f8fafc] text-slate-900 font-sans relative overflow-hidden flex flex-col no-scroll-root">
      <style jsx global>{`
        /* Enforce zero-scroll at root */
        html, body, #__next {
          height: 100%;
          width: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden !important;
        }

        /* Utility: prevent internal scrolls */
        .no-scroll, .no-scroll-root { overflow: hidden !important; }
        .no-scroll-root > * { min-height: 0; min-width: 0; }

        /* Responsive spacing and typography */
        :root {
          --space-xs: clamp(6px, 1.2vw, 12px);
          --space-sm: clamp(8px, 1.6vw, 16px);
          --space-md: clamp(12px, 2.4vw, 24px);
          --space-lg: clamp(16px, 3.2vw, 32px);
        }

        /* Floating orbs are decorative and cannot cause layout overflow */
        .orb-1, .orb-2 { pointer-events: none; will-change: transform; position: absolute; }

        /* Inputs and buttons must not force overflow */
        input, button, textarea, select {
          min-width: 0;
          max-width: 100%;
          box-sizing: border-box;
        }

        /* Primary button compress behavior */
        .btn-primary { flex-shrink: 1; min-width: 0; }

        /* Scale fallback for very small viewports to avoid scrollbars */
        @media (max-height: 640px), (max-width: 360px) {
          .scale-down-small { transform-origin: top center; transform: scale(0.94); }
        }

        /* Reduce paddings on very small screens */
        @media (max-width: 420px) {
          .px-6 { padding-left: 10px !important; padding-right: 10px !important; }
          .py-4 { padding-top: 8px !important; padding-bottom: 8px !important; }
          .text-5xl { font-size: clamp(28px, 6vw, 40px) !important; }
        }

        /* Custom scrollbar removed to avoid any scrollbars */
        .custom-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Background Decor */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden bg-gradient-to-br from-blue-50/50 via-slate-50 to-indigo-50/30">
        <div className="absolute top-[-10%] left-[-5%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] bg-gradient-to-br from-blue-400/20 to-indigo-500/20 rounded-full blur-[80px] orb-1" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[45vw] h-[45vw] max-w-[500px] max-h-[500px] bg-gradient-to-tl from-cyan-400/20 to-emerald-400/10 rounded-full blur-[80px] orb-2" />
      </div>

      {/* Header */}
      <header className="shrink-0 z-30 h-[72px] flex items-center">
        <nav className="w-full max-w-7xl mx-auto px-6 lg:px-12 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black shadow-lg shadow-slate-900/20">M</div>
          <span className="text-xl font-black tracking-tighter text-slate-900">MASA</span>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 relative z-20 flex items-center justify-center px-4 lg:px-12">
        <div className="max-w-7xl w-full h-full grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-center overflow-hidden scale-down-small">
          <section className="hidden lg:flex flex-col space-y-6">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 bg-amber-100/50 border border-amber-200/60 px-3.5 py-1.5 rounded-full w-fit backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)] animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Action Required: Rotation</span>
              </div>

              <h1 className="text-5xl lg:text-6xl xl:text-7xl font-black leading-[1.05] tracking-tight text-slate-900">
                Fortify <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500">Your Identity.</span>
              </h1>

              <p className="text-[15px] text-slate-600 max-w-md font-medium leading-relaxed">
                Initial login detected. You must establish a personalized security protocol to activate your MASA personnel profile.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-[340px]">
              <div className="p-4 bg-white/40 border border-white/60 rounded-xl backdrop-blur-md shadow-sm">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-0.5">Compliance</p>
                <p className="text-[12px] text-slate-700 font-bold">Mandatory Rotation</p>
              </div>

              <div className="p-4 bg-white/40 border border-white/60 rounded-xl backdrop-blur-md shadow-sm">
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-0.5">Integrity</p>
                <p className="text-[12px] text-slate-700 font-bold">Encrypted Vault</p>
              </div>
            </div>
          </section>

          <section className="flex justify-center lg:justify-end h-full py-2 items-center overflow-hidden">
            <ResetPasswordForm />
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="shrink-0 h-[64px] border-t border-slate-200/40 z-30 bg-white/30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-full flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
          <div className="flex gap-8">
            <Link href="/support" className="hover:text-slate-800 transition-colors">Security HQ</Link>
            <Link href="/privacy" className="hover:text-slate-800 transition-colors">Privacy</Link>
          </div>

          <span className="text-[9px] font-black tracking-widest uppercase text-slate-300">MASA-CORE-V3.0</span>
        </div>
      </footer>
    </div>
  );
}
