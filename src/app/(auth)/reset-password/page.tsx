"use client";

import React, { useState, useMemo, useEffect, FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useAnimation } from "framer-motion";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/**
 * MASA Terminal v3.0 - Mandatory Credential Rotation
 * Security Protocol: Implements Password PATCH + Preference DELETE (Zero Residue)
 */

const ResetPasswordForm = () => {
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

  // --- Logic: Security Criteria ---
  const criteria = useMemo(() => ({
    length: newPassword.length >= 8,
    casing: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
    symbol: /[^A-Za-z0-9]/.test(newPassword),
  }), [newPassword]);

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

  const handleRotation = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) {
      controls.start({ x: [-8, 8, -6, 6, -4, 4, 0], transition: { duration: 0.4 } });
      return;
    }

    setLoading(true);
    try {
      // 1. Update actual User Password
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Protocol rejection.");

      // 2. PERMANENT DELETE (Zero Residue Logic)
      // We include isGlobal=true to ensure we hit the branch-agnostic record.
      // We keep the target to pinpoint the specific email record.
      await fetch(`/api/preferences?category=SYSTEM&key=TEMP_CREDENTIAL&scope=USER&target=${session?.user?.email}&isGlobal=true`, {
        method: "DELETE",
      });

      // 3. Update Session Identity
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
      await controls.start({ x: [-8, 8, -6, 6, -4, 4, 0], transition: { duration: 0.4 } });
      dispatch({ kind: "TOAST", type: "ERROR", title: "Update Failed", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className="w-full max-w-[420px] max-h-[85vh] flex flex-col bg-white/95 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_40px_80px_-15px_rgba(0,0,0,0.08)] border border-white overflow-hidden relative"
    >
      <header className="px-8 py-7 text-center border-b border-slate-100/60 bg-white/50 shrink-0 z-10">
        <h2 className="text-[22px] font-black tracking-tight text-slate-800">Security Hardening</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.25em] mt-1.5">Credential Rotation Required</p>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-6">
        <motion.form animate={controls} onSubmit={handleRotation} className="space-y-6">
          {/* Current Password */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2 block">Current Protocol</label>
            <div className="relative flex items-center shadow-sm rounded-2xl">
              <i className="bx bx-lock-open-alt absolute left-4 text-slate-400 text-lg" />
              <input 
                type={showPass ? "text" : "password"}
                placeholder="Temporary Password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-3.5 bg-slate-50/80 border border-slate-200/60 rounded-2xl text-[14px] font-semibold text-slate-800 focus:bg-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-300 placeholder:font-medium"
                required
              />
              <button 
                type="button" 
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors active:scale-95"
              >
                <i className={showPass ? "bx bx-hide text-lg" : "bx bx-show text-lg"} />
              </button>
            </div>
          </div>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200/60 to-transparent" />

          {/* New Password */}
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2 block">New Credential</label>
              <div className="relative flex items-center shadow-sm rounded-2xl">
                <i className="bx bx-shield-quarter absolute left-4 text-slate-400 text-lg" />
                <input 
                  type={showPass ? "text" : "password"}
                  placeholder="Create new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50/80 border border-slate-200/60 rounded-2xl text-[14px] font-semibold text-slate-800 focus:bg-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-300 placeholder:font-medium"
                  required
                />
              </div>
            </div>

            {/* Strength Visualizer */}
            <div className="space-y-2.5 px-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Strength: <span className="text-slate-700">{strengthDetails.label}</span></span>
                <span className="text-[10px] font-black text-slate-400">{strengthScore}/4</span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                <div className={`h-full transition-all duration-500 ease-out rounded-full ${strengthDetails.color} ${strengthDetails.width}`} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100/80">
              <CriteriaItem met={criteria.length} label="8+ Chars" />
              <CriteriaItem met={criteria.casing} label="A/a Case" />
              <CriteriaItem met={criteria.number} label="Number" />
              <CriteriaItem met={criteria.symbol} label="Symbol" />
            </div>
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2 block">Verify Credential</label>
            <div className="relative flex items-center shadow-sm rounded-2xl">
              <i className="bx bx-check-shield absolute left-4 text-slate-400 text-lg" />
              <input 
                type={showPass ? "text" : "password"}
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full pl-12 pr-12 py-3.5 bg-slate-50/80 border rounded-2xl text-[14px] font-semibold text-slate-800 outline-none transition-all placeholder:text-slate-300 placeholder:font-medium
                  ${!isStarted ? 'border-slate-200/60 focus:bg-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10' : 
                  isMatch ? 'border-emerald-500/50 bg-emerald-50/30 focus:ring-4 focus:ring-emerald-500/10' : 
                  'border-red-400/50 bg-red-50/30 focus:ring-4 focus:ring-red-500/10'}
                `}
                required
              />
              {isStarted && (
                <i className={`bx ${isMatch ? 'bx-check-circle text-emerald-500' : 'bx-error-circle text-red-400'} absolute right-4 text-xl animate-in zoom-in duration-300`} />
              )}
            </div>
          </div>

          <div className="pt-2">
            <button 
              type="submit"
              disabled={!canSubmit || loading}
              className="w-full py-4 flex items-center justify-center gap-2 bg-slate-900 text-white rounded-2xl text-[12px] font-bold uppercase tracking-[0.15em] shadow-lg shadow-slate-900/15 hover:bg-slate-800 hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none disabled:transform-none transition-all active:scale-[0.98]"
            >
              {loading ? <i className="bx bx-loader-alt animate-spin text-lg" /> : "Authorize Rotation"}
            </button>
          </div>
        </motion.form>
      </div>
      
      {/* Footer of Card */}
      <div className="bg-slate-50/80 px-8 py-3.5 flex items-center justify-between border-t border-slate-100/80 shrink-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse" />
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Security Node Active</span>
        </div>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">HW-ID: {hwId}</span>
      </div>
    </motion.div>
  );
};

function CriteriaItem({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300 ${met ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 scale-110" : "bg-slate-200 text-slate-400"}`}>
        <i className={`bx ${met ? 'bx-check' : 'bx-minus'} text-[10px] font-black`} />
      </div>
      <span className={`text-[10.5px] font-bold tracking-wide transition-colors duration-300 ${met ? "text-slate-800" : "text-slate-400"}`}>
        {label}
      </span>
    </div>
  );
}

export default function PasswordResetPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/signin");
    if (status === "authenticated" && !session?.user?.requiresPasswordChange) router.replace("/dashboard");
  }, [status, session, router]);

  if (status === "loading") return null;

  return (
    <div className="h-[100dvh] w-full bg-[#f8fafc] text-slate-900 font-sans relative overflow-hidden flex flex-col">
      <style jsx global>{`
        html, body { height: 100%; width: 100%; overflow: hidden !important; margin: 0; padding: 0; position: fixed; }
        .orb-1 { animation: float-1 15s ease-in-out infinite alternate; }
        .orb-2 { animation: float-2 20s ease-in-out infinite alternate; }
        @keyframes float-1 { 0% { transform: translate(0, 0) scale(1); } 100% { transform: translate(30px, -50px) scale(1.1); } }
        @keyframes float-2 { 0% { transform: translate(0, 0) scale(1); } 100% { transform: translate(-40px, 40px) scale(1.05); } }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      `}</style>

      {/* Abstract iOS/macOS Style Background Decor */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden bg-gradient-to-br from-blue-50/50 via-slate-50 to-indigo-50/30">
        <div className="absolute top-[-10%] left-[-5%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] bg-gradient-to-br from-blue-400/20 to-indigo-500/20 rounded-full blur-[80px] orb-1" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[45vw] h-[45vw] max-w-[500px] max-h-[500px] bg-gradient-to-tl from-cyan-400/20 to-emerald-400/10 rounded-full blur-[80px] orb-2" />
      </div>

      {/* Header */}
      <header className="flex-none z-30 h-[72px]">
        <nav className="max-w-7xl mx-auto px-6 lg:px-12 h-full gap-3 flex items-center justify-start">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black shadow-lg shadow-slate-900/20">M</div>
            <span className="text-xl font-black tracking-tighter text-slate-900">MASA</span>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative z-20 flex flex-col items-center justify-center px-6 lg:px-12 min-h-0 py-6">
        <div className="max-w-7xl w-full h-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          
          <section className="flex flex-col space-y-6 lg:order-1 hidden sm:flex">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 bg-amber-100/50 border border-amber-200/60 px-3.5 py-1.5 rounded-full w-fit backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)] animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Action Required: Rotation</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black leading-[1.05] tracking-tight text-slate-900">
                Fortify <br /> 
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500">Your Identity.</span>
              </h1>
              
              <p className="text-[15px] text-slate-600 max-w-md font-medium leading-relaxed">
                Initial login detected. You must establish a personalized security protocol to activate your MASA personnel profile and access the dashboard.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-[340px] pt-4">
                <div className="p-4 bg-white/40 border border-white/60 rounded-2xl backdrop-blur-md shadow-sm">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-0.5">Compliance</p>
                  <p className="text-[12px] text-slate-700 font-bold">Mandatory Rotation</p>
                </div>
                <div className="p-4 bg-white/40 border border-white/60 rounded-2xl backdrop-blur-md shadow-sm">
                  <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-0.5">Integrity</p>
                  <p className="text-[12px] text-slate-700 font-bold">Encrypted Vault</p>
                </div>
            </div>
          </section>

          <section className="flex justify-center lg:justify-end lg:order-2 h-full items-center">
            <ResetPasswordForm />
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-none h-[64px] border-t border-slate-200/40 z-30 bg-white/30 backdrop-blur-md">
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