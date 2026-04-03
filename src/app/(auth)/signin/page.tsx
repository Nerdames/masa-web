"use client";

import React, { useState, FormEvent, Suspense, useEffect } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, useAnimation } from "framer-motion";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/**
 * MASA Terminal v3.0 - Unified SignIn
 * Fully synchronized with "Fortress Protocol" backend logic.
 */

interface AuthErrorConfig {
  title: string;
  message: string;
  type: "ERROR" | "SECURITY" | "WARNING";
  kind: "PUSH" | "TOAST";
}

const ERROR_MAP: Record<string, AuthErrorConfig> = {
  // Account Status Errors
  ACCOUNT_DISABLED: { title: "Node Decommissioned", message: "Access revoked by Admin.", type: "SECURITY", kind: "PUSH" },
  ORGANIZATION_SUSPENDED: { title: "Sector Offline", message: "Org-level suspension active.", type: "ERROR", kind: "PUSH" },
  
  // Lockout & Security Errors (Synchronized with auth.ts lock reasons)
  ACCOUNT_LOCKED_ADMIN: { title: "Security Lockout", message: "Terminal frozen by Admin override.", type: "ERROR", kind: "PUSH" },
  EXCESSIVE_FAILED_ATTEMPTS: { title: "Security Lockout", message: "Too many failed attempts. Cooling down...", type: "ERROR", kind: "PUSH" },
  TEMPORARY_SECURITY_LOCKOUT: { title: "Access Restricted", message: "Terminal cooling down. Please wait 15m.", type: "SECURITY", kind: "PUSH" },
  
  // Validation Errors
  INVALID_CREDENTIALS: { title: "Access Denied", message: "Invalid credentials.", type: "ERROR", kind: "TOAST" },
  CredentialsSignin: { title: "Access Denied", message: "Invalid credentials.", type: "ERROR", kind: "TOAST" },
  SessionExpired: { title: "Session Terminated", message: "Re-authentication required.", type: "SECURITY", kind: "PUSH" },
};

const SignInForm = () => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hwId, setHwId] = useState("");

  const controls = useAnimation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dispatch } = useAlerts();

  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const urlError = searchParams.get("error");

  useEffect(() => {
    // Generate transient Hardware ID for visual fidelity
    setHwId(Math.random().toString(36).substring(2, 8).toUpperCase());

    if (urlError && ERROR_MAP[urlError]) {
      const config = ERROR_MAP[urlError];
      dispatch({ kind: config.kind, type: config.type, title: config.title, message: config.message });
      controls.start({ x: [-8, 8, -8, 8, 0], transition: { duration: 0.4 } });
    }
  }, [urlError, dispatch, controls]);

  const handleSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        identifier: identifier.trim(),
        password: password.trim(),
        callbackUrl,
      });

      if (result?.error) {
        await controls.start({ x: [-8, 8, -8, 8, 0], transition: { duration: 0.4 } });
        
        // Match specific error string from backend or fallback
        const config = ERROR_MAP[result.error] || ERROR_MAP.INVALID_CREDENTIALS;
        
        dispatch({ 
          kind: config.kind, 
          type: config.type, 
          title: config.title, 
          message: config.message 
        });
      } else {
        // Success: Verify session for security flags (e.g. requiresPasswordChange)
        const session = await getSession();
        const user = session?.user;

        dispatch({
          kind: "PUSH",
          type: user?.requiresPasswordChange ? "WARNING" : "SUCCESS",
          title: user?.requiresPasswordChange ? "Rotation Required" : "Identity Verified",
          message: "Synchronizing security protocols...",
        });

        // Delay slightly for visual feedback/sync
        setTimeout(() => {
          if (user?.requiresPasswordChange) {
            router.replace("/reset-password");
          } else {
            router.replace(callbackUrl === "/" ? "/admin/overview" : callbackUrl);
          }
          router.refresh(); 
        }, 800);
      }
    } catch (err) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Gateway Fault", message: "Network timeout." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-[400px] bg-white rounded-[2.5rem] shadow-[0_40px_80px_-15px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden"
    >
      <header className="p-8 pb-6 text-center border-b border-slate-50">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">Terminal Login</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-1.5">Fortress Protocol v3.0</p>
      </header>

      <div className="p-8 space-y-6">
        <motion.form animate={controls} onSubmit={handleSignIn} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Personnel ID</label>
            <div className="relative flex items-center">
              <i className="bx bx-user-circle absolute left-4 text-slate-300 text-xl" />
              <input 
                type="text"
                placeholder="Staff ID or Email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Security Key</label>
            <div className="relative flex items-center">
              <i className="bx bx-shield-alt-2 absolute left-4 text-slate-300 text-xl" />
              <input 
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                required
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 text-slate-300 hover:text-indigo-600 transition-colors"
              >
                <i className={showPassword ? "bx bx-hide" : "bx bx-show"} />
              </button>
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 flex justify-center bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-blue-600 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {loading ? <i className="bx bx-loader-alt animate-spin text-lg" /> : "Initiate Session"}
          </button>
        </motion.form>

        <div className="flex flex-col items-center gap-2 pt-1 border-t border-slate-50/50 mt-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-300 mt-4">New Personnel?</p>
          <Link href="/register" className="text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700 transition-colors">
              Create Terminal Account
          </Link>
        </div>
      </div>

      <div className="bg-slate-50/80 px-8 py-3 flex items-center justify-between border-t border-slate-100">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">AES-256 Tunnel</span>
        </div>
        <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">HW-ID: {hwId}</span>
      </div>
    </motion.div>
  );
};

export default function SignInPage() {
  return (
    <div className="h-[100dvh] w-full bg-gradient-to-br from-[#DBEAFE] via-[#E0F2FE] to-[#EFF6FF] text-slate-900 font-sans relative overflow-hidden flex flex-col">
      <style jsx global>{`
        html, body { 
          height: 100%; 
          width: 100%;
          overflow: hidden !important; 
          margin: 0; 
          padding: 0;
          position: fixed; 
        }
        .pulse-slow { animation: pulse 4s ease-in-out infinite; }
        .float-slow { animation: float 6s ease-in-out infinite; }
        @keyframes float { 
          0%, 100% { transform: translateY(0); } 
          50% { transform: translateY(-6px); } 
        }
      `}</style>

      {/* Background Decor */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <svg className="absolute -left-10 -top-10 opacity-20 float-slow" viewBox="0 0 600 600" style={{ width: "min(45vw, 450px)" }}>
          <defs>
            <linearGradient id="gA" x1="0" x2="1">
              <stop offset="0" stopColor="#463aed" />
              <stop offset="1" stopColor="#06B6D4" />
            </linearGradient>
          </defs>
          <circle cx="300" cy="300" r="260" fill="url(#gA)" />
        </svg>

        <svg className="absolute -right-10 -bottom-10 opacity-15 pulse-slow" viewBox="0 0 600 600" style={{ width: "min(40vw, 400px)" }}>
          <defs>
            <linearGradient id="gB" x1="0" x2="1">
              <stop offset="0" stopColor="#FF7AB6" />
              <stop offset="1" stopColor="#FFD580" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="600" height="600" rx="120" fill="url(#gB)" />
        </svg>
      </div>

      {/* Header */}
      <header className="flex-none z-30 h-[64px] md:h-[72px]">
        <nav className="max-w-7xl mx-auto px-6 h-full gap-3 flex items-center justify-start">
            <div className="w-10 h-10 rounded-xl bg-white text-indigo-900 flex items-center justify-center font-black shadow-lg">M</div>
            <span className="text-lg font-black tracking-tighter text-slate-900">MASA</span>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative z-20 flex flex-col items-center justify-center px-6 min-h-0">
        <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          <section className="flex flex-col space-y-4 md:space-y-6 order-2 lg:order-1 hidden sm:block ">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full w-fit">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">v3.0 Secure Terminal</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-7xl font-black leading-[1.1] tracking-tight text-slate-900">
                Authorized <br /> 
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-blue-500 to-cyan-500">Access Only.</span>
              </h1>

              <p className="text-sm md:text-base text-slate-600 max-w-md font-medium leading-relaxed">
                Connect to the MASA multi-tenant infrastructure. High-fidelity branch management and real-time personnel auditing start here.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-sm pt-4">
                <div className="p-4 bg-white/50 border border-slate-100 rounded-2xl backdrop-blur-md">
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Enterprise</p>
                  <p className="text-[11px] text-slate-500 font-bold">Branch Isolation</p>
                </div>
                <div className="p-4 bg-white/50 border border-slate-100 rounded-2xl backdrop-blur-md">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Security</p>
                  <p className="text-[11px] text-slate-500 font-bold">Encrypted Tunnel</p>
                </div>
            </div>
          </section>

          <section className="flex justify-center lg:justify-end order-1 lg:order-2">
            <Suspense fallback={<div className="animate-pulse font-black text-slate-300 uppercase tracking-widest text-xs">Waking Core...</div>}>
              <SignInForm />
            </Suspense>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-none h-[60px] border-t border-slate-100/50 z-30">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-indigo-600 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-indigo-600 transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}