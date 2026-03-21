"use client";

import React, { useState, FormEvent, Suspense, ChangeEvent, useEffect } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, useAnimation, AnimatePresence } from "framer-motion";
import { useAlerts } from "@/components/feedback/AlertProvider";

/**
 * MASA Terminal Authentication v3.0 - "Fortress" Edition
 * Optimized for high-security environments and multi-tenant branch resolution.
 */

interface AuthErrorConfig {
  title: string;
  message: string;
  type: "ERROR" | "SECURITY" | "WARNING";
  kind: "PUSH" | "TOAST";
}

const ERROR_MAP: Record<string, AuthErrorConfig> = {
  ACCOUNT_DISABLED: {
    title: "Node Decommissioned",
    message: "Identity disabled by administration. Access revoked.",
    type: "SECURITY",
    kind: "PUSH",
  },
  ORGANIZATION_SUSPENDED: {
    title: "Sector Offline",
    message: "Organization access suspended. Contact head office.",
    type: "ERROR",
    kind: "PUSH",
  },
  ACCOUNT_LOCKED: {
    title: "Security Lockout",
    message: "Terminal frozen. Manual override required by Admin.",
    type: "ERROR",
    kind: "PUSH",
  },
  EXCESSIVE_FAILED_ATTEMPTS: {
    title: "Brute Force Protection",
    message: "Multiple verification failures. Terminal locked.",
    type: "SECURITY",
    kind: "PUSH",
  },
  TEMPORARY_LOCKOUT: {
    title: "Access Throttled",
    message: "15-minute cooldown active. Security protocol cooling.",
    type: "WARNING",
    kind: "TOAST",
  },
  INVALID_CREDENTIALS: {
    title: "Access Denied",
    message: "Invalid identity credentials provided.",
    type: "ERROR",
    kind: "TOAST",
  },
  CredentialsSignin: {
    title: "Access Denied",
    message: "Authentication failed. Check your identifier.",
    type: "ERROR",
    kind: "TOAST",
  },
  Configuration: {
    title: "System Fault",
    message: "Authentication gateway mismatch. Contact Dev team.",
    type: "ERROR",
    kind: "PUSH",
  },
};

const SignInForm = () => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const controls = useAnimation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dispatch } = useAlerts();

  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const urlError = searchParams.get("error");

  // Sync with URL-based error redirects
  useEffect(() => {
    if (urlError && ERROR_MAP[urlError]) {
      const config = ERROR_MAP[urlError];
      dispatch({
        kind: config.kind,
        type: config.type,
        title: config.title,
        message: config.message,
      });
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
        const config = ERROR_MAP[result.error] || ERROR_MAP.INVALID_CREDENTIALS;
        
        dispatch({
          kind: config.kind,
          type: config.type,
          title: config.title,
          message: config.message,
        });
      } else {
        const session = await getSession();
        const isFirstTime = session?.user?.requiresPasswordChange;

        dispatch({
          kind: "PUSH",
          type: isFirstTime ? "WARNING" : "SUCCESS",
          title: isFirstTime ? "Hardening Required" : "Identity Verified",
          message: isFirstTime 
            ? "New node detected. Mandatory access key rotation initiated." 
            : "Welcome to MASA. Synchronizing core...",
        });

        setTimeout(() => {
          if (isFirstTime) {
            router.replace("/auth/reset-password");
          } else {
            router.replace(callbackUrl);
          }
          router.refresh();
        }, 800);
      }
    } catch {
      dispatch({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Gateway Fault", 
        message: "Network layer timeout." 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative w-full max-w-sm flex flex-col bg-white rounded-[1.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden z-10"
    >
      <header className="p-8 pb-4 text-center border-b border-slate-50 relative">
        <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none">
            <i className="bx bx-hive text-7xl rotate-12" />
        </div>
        <h1 className="text-4xl font-black tracking-tighter text-slate-900 leading-none">MASA</h1>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.4em] mt-2">Core Identity</p>
      </header>

      <div className="p-8 flex flex-col gap-6">
        <motion.form animate={controls} onSubmit={handleSignIn} className="space-y-5">
          <InputField 
            label="Security Identifier" 
            icon="bx bx-fingerprint" 
            type="text" 
            placeholder="Email or Staff Code" 
            value={identifier}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setIdentifier(e.target.value)}
            required
            autoComplete="username"
          />
          
          <div className="relative">
            <InputField 
              label="Access Key" 
              icon="bx bx-key" 
              type={showPassword ? "text" : "password"} 
              placeholder="••••••••" 
              value={password}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-[36px] text-slate-300 hover:text-slate-900 transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <i className={showPassword ? "bx bx-low-vision" : "bx bx-show"} />
            </button>
          </div>

          <button 
            type="submit"
            disabled={!identifier || !password || loading}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-blue-600 disabled:bg-slate-100 disabled:text-slate-300 transition-all flex items-center justify-center gap-3 active:scale-[0.97]"
          >
            {loading ? (
              <i className="bx bx-loader-alt animate-spin text-lg" />
            ) : (
              <>Authorize Entry <i className="bx bx-chevron-right text-lg" /></>
            )}
          </button>
        </motion.form>

        <div className="pt-4 border-t border-slate-50 flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
            <span className="text-slate-300">Unregistered?</span>
            <Link href="/auth/register" className="text-slate-900 hover:text-blue-600 transition-colors">
              Request Node
            </Link>
        </div>
      </div>

      <footer className="px-8 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between opacity-50">
          <div className="flex items-center gap-1">
            <i className="bx bxs-circle text-[6px] text-emerald-500 animate-pulse" />
            <span className="text-[8px] font-bold uppercase tracking-widest text-slate-500">Gateway Active</span>
          </div>
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic">Encrypted AES-256</span>
      </footer>
    </motion.div>
  );
};

const InputField = ({ label, icon, ...props }: { label: string; icon: string; [key: string]: any }) => (
  <div className="space-y-2 group">
    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 group-focus-within:text-slate-900 transition-colors">
      {label}
    </label>
    <div className="relative flex items-center">
      <i className={`${icon} absolute left-4 text-slate-300 group-focus-within:text-slate-900 transition-colors duration-300 text-lg`} />
      <input 
        {...props} 
        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200/60 rounded-2xl text-sm font-semibold outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-200 text-slate-900" 
      />
    </div>
  </div>
);

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6 relative bg-[#F8FAFC] font-sans overflow-hidden">
      {/* Background Aesthetic Layer */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-blue-100/60 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-blue-50/50 blur-[100px] rounded-full" />
        <div 
          className="absolute inset-0 opacity-[0.015]" 
          style={{ 
            backgroundImage: `radial-gradient(#1e40af 1px, transparent 1px)`, 
            backgroundSize: '40px 40px' 
          }} 
        />
      </div>

      {/* Support Float */}
      <div className="fixed bottom-12 right-8 z-50">
        <Link href="/auth/support">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="group flex items-center gap-3 bg-white/80 backdrop-blur-md border border-white p-1 pr-2 rounded-full shadow-[0_20px_40px_-10px_rgba(0,0,0,0.05)] transition-all hover:shadow-[0_25px_50px_-12px_rgba(59,130,246,0.1)]"
          >
            <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center text-white shadow-lg transition-colors group-hover:bg-blue-600">
              <i className="bx bx-support text-lg" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Support</span>
            </div>
          </motion.div>
        </Link>
      </div>

      <Suspense fallback={<div className="text-slate-400 font-black animate-pulse uppercase tracking-[0.4em]">Initializing...</div>}>
        <SignInForm />
      </Suspense>
    </main>
  );
}