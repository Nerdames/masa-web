"use client";

import React, { useState, FormEvent, Suspense, ChangeEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, useAnimation } from "framer-motion";
import { useAlerts } from "@/components/feedback/AlertProvider";

/* --- SHARED TACTICAL COMPONENTS --- */

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon: string;
}

const InputField = ({ label, icon, ...props }: InputFieldProps) => (
  <div className="space-y-1 group shrink-0">
    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 group-focus-within:text-blue-600 transition-colors">
      {label}
    </label>
    <div className="relative flex items-center">
      <i className={`${icon} absolute left-4 text-slate-300 group-focus-within:text-blue-600 transition-colors duration-300`} />
      <input 
        {...props} 
        className="w-full pl-11 pr-4 py-2.5 bg-slate-50/50 border border-slate-200/60 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-blue-600 transition-all placeholder:text-slate-300 text-slate-900" 
      />
    </div>
  </div>
);

interface ActionProps {
  label: string;
  loading: boolean;
  icon: string;
  disabled: boolean;
}

const PrimaryAction = ({ label, loading, icon, disabled }: ActionProps) => (
  <button 
    type="submit"
    disabled={disabled || loading}
    className="w-full py-3.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-blue-600 disabled:opacity-20 transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-900/10 hover:shadow-blue-600/20 active:scale-[0.98] shrink-0"
  >
    {loading ? (
      <i className="bx bx-loader-alt animate-spin text-lg" />
    ) : (
      <>
        {label} <i className={`${icon} text-lg`} />
      </>
    )}
  </button>
);

/* --- MAIN SIGN IN COMPONENT --- */

const SignInForm = () => {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  
  const controls = useAnimation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dispatch } = useAlerts();

  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const handleSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: email.trim().toLowerCase(),
        password: password.trim(),
        callbackUrl,
      });

      if (result?.error) {
        await controls.start({ x: [-10, 10, -10, 10, 0], transition: { duration: 0.4 } });
        dispatch({ kind: "TOAST", type: "ERROR", title: "Access Denied", message: "Invalid credentials." });
      } else {
        router.replace(callbackUrl);
        router.refresh();
      }
    } catch {
      dispatch({ kind: "TOAST", type: "ERROR", title: "System Fault", message: "Gateway timeout." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      animate={controls}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative w-full max-w-sm flex flex-col bg-white rounded-[2.5rem] shadow-[0_40px_80px_-15px_rgba(0,0,0,0.12)] border border-white h-auto max-h-[90vh] overflow-hidden z-10"
    >
      <header className="shrink-0 p-8 pb-4 text-center border-b border-slate-50 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <i className="bx bx-shield-quarter text-6xl rotate-12" />
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[9px] font-black tracking-[0.2em] uppercase mb-4 relative z-10">
          <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse" />
          Terminal v3.0
        </div>
        <h1 className="text-3xl font-black tracking-tighter text-slate-900 relative z-10 leading-none">MASA</h1>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">Identity Verification</p>
      </header>

      <div className="flex-1 p-8 flex flex-col justify-between overflow-hidden">
        <form onSubmit={handleSignIn} className="space-y-4">
          <InputField 
            label="Security Identity" 
            icon="bx bx-user-circle" 
            type="email" 
            placeholder="name@nexus.com" 
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            required
          />
          
          <div className="relative">
            <InputField 
              label="Access Key" 
              icon="bx bx-lock-open-alt" 
              type={showPassword ? "text" : "password"} 
              placeholder="••••••••" 
              value={password}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-[29px] text-slate-300 hover:text-slate-600 transition-colors"
            >
              <i className={showPassword ? "bx bx-hide text-lg" : "bx bx-show text-lg"} />
            </button>
          </div>

          <div className="pt-2">
            <PrimaryAction 
              label={loading ? "Verifying..." : "Authorize Access"} 
              loading={loading}
              icon="bx bx-right-arrow-alt"
              disabled={!email || !password}
            />
          </div>
        </form>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[10px] font-black uppercase tracking-widest shrink-0">
            <span className="text-slate-400">New Node?</span>
            <Link href="/auth/register" className="text-blue-600 hover:underline">
              Initialize Entry
            </Link>
        </div>
      </div>

      <footer className="shrink-0 px-8 py-5 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
         <div className="flex items-center gap-2 opacity-40">
            <i className="bx bx-revision text-xs animate-spin-slow" />
            <span className="text-[9px] font-bold uppercase tracking-[0.1em]">Core Sync: Active</span>
         </div>
         <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
           AES-256
         </span>
      </footer>

      <style jsx global>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow { animation: spin-slow 8s linear infinite; }
      `}</style>
    </motion.div>
  );
};

export default function SignInPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6 relative overflow-hidden font-sans select-none h-dvh">
      
      {/* SLANT BACKGROUND GRADIENT */}
      <div className="absolute inset-0 z-0 flex overflow-hidden pointer-events-none">
        <div className="w-full h-full bg-[#F8FAFC]" />
        <div 
          className="absolute inset-y-0 right-0 w-[60%] bg-gradient-to-br from-blue-50/50 to-indigo-100/40 transform -skew-x-12 translate-x-24 border-l border-blue-100/20"
        />
      </div>

      {/* GRID OVERLAY */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.04]">
        <div className="h-full w-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]" />
        <motion.div 
          animate={{ y: ["0%", "100%"] }} 
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-blue-400/20 to-transparent" 
        />
      </div>

      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>

      <Link
        href="/auth/support"
        className="fixed bottom-8 right-8 flex items-center gap-3 px-5 py-3 bg-white/90 backdrop-blur-xl border border-slate-200 shadow-2xl rounded-full text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-blue-600 transition-all active:scale-95 z-50"
      >
        <i className="bx bx-question-mark text-lg" />
        Support
      </Link>
    </main>
  );
}