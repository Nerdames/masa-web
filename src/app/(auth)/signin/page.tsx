"use client";

import React, { useState, FormEvent, Suspense, useEffect } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, useAnimation } from "framer-motion";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/**
 * MASA - Unified Sign In
 * Optimized for production with relatable terminology.
 */

interface AuthErrorConfig {
  title: string;
  message: string;
  type: "ERROR" | "SECURITY" | "WARNING";
  kind: "PUSH" | "TOAST";
}

const ERROR_MAP: Record<string, AuthErrorConfig> = {
  ACCOUNT_DISABLED: { title: "Account Disabled", message: "Your access has been revoked. Contact your admin.", type: "SECURITY", kind: "PUSH" },
  ORGANIZATION_SUSPENDED: { title: "Organization Suspended", message: "Access is temporarily offline for your organization.", type: "ERROR", kind: "PUSH" },
  ACCOUNT_LOCKED_ADMIN: { title: "Account Locked", message: "Your account is locked for security reasons.", type: "ERROR", kind: "PUSH" },
  EXCESSIVE_FAILED_ATTEMPTS: { title: "Too Many Attempts", message: "Security lockout active. Please try again in 15 minutes.", type: "ERROR", kind: "PUSH" },
  TEMPORARY_SECURITY_LOCKOUT: { title: "Temporary Lockout", message: "Please wait 15 minutes before trying again.", type: "SECURITY", kind: "PUSH" },
  INVALID_CREDENTIALS: { title: "Login Failed", message: "The email or password provided is incorrect.", type: "ERROR", kind: "TOAST" },
  CredentialsSignin: { title: "Login Failed", message: "The email or password provided is incorrect.", type: "ERROR", kind: "TOAST" },
  SessionExpired: { title: "Session Expired", message: "Please sign in again to continue.", type: "SECURITY", kind: "PUSH" },
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

  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const urlError = searchParams.get("error");

  useEffect(() => {
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
        const config = ERROR_MAP[result.error] || ERROR_MAP.INVALID_CREDENTIALS;
        dispatch({ kind: config.kind, type: config.type, title: config.title, message: config.message });
      } else {
        const session = await getSession();
        const user = session?.user;

        dispatch({
          kind: "PUSH",
          type: user?.requiresPasswordChange ? "WARNING" : "SUCCESS",
          title: user?.requiresPasswordChange ? "Update Required" : "Welcome Back",
          message: "Redirecting to your dashboard...",
        });

        setTimeout(() => {
          if (user?.requiresPasswordChange) {
            router.replace("/reset-password");
          } else {
            router.replace("/");
          }
          router.refresh(); 
        }, 800);
      }
    } catch (err) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Connection Error", message: "Unable to reach the server." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-[420px] bg-white rounded-[2rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden"
    >
      <header className="p-10 pb-6 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sign In</h2>
        <p className="text-sm text-slate-500 mt-2">Enter your credentials to access your account</p>
      </header>

      <div className="px-10 pb-10 space-y-6">
        <motion.form animate={controls} onSubmit={handleSignIn} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider ml-1">Email or Staff ID</label>
            <div className="relative flex items-center">
              <i className="bx bx-envelope absolute left-4 text-slate-400 text-lg" />
              <input 
                type="text"
                placeholder="john.doe@example.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider ml-1">Password</label>
            <div className="relative flex items-center">
              <i className="bx bx-lock-alt absolute left-4 text-slate-400 text-lg" />
              <input 
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                required
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 text-slate-400 hover:text-blue-600 transition-colors"
              >
                <i className={showPassword ? "bx bx-hide" : "bx bx-show"} />
              </button>
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-blue-600 text-white rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? <i className="bx bx-loader-alt animate-spin text-lg" /> : "Sign In"}
          </button>
        </motion.form>

        <div className="flex flex-col items-center gap-3 pt-6 border-t border-slate-100">
          <p className="text-xs text-slate-400">Don't have an account yet?</p>
          <Link href="/register" className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors">
            Create Account
          </Link>
        </div>
      </div>
    </motion.div>
  );
};

export default function SignInPage() {
  return (
    <div className="h-screen w-full bg-[#F8FAFC] flex flex-col overflow-hidden relative">
      {/* Background Decor - Only visible on Large Screens */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden hidden lg:block">
        <div className="absolute -left-20 -top-20 w-[500px] h-[500px] bg-blue-100/50 rounded-full blur-3xl" />
        <div className="absolute -right-20 -bottom-20 w-[500px] h-[500px] bg-indigo-100/50 rounded-full blur-3xl" />
      </div>

      {/* Navigation */}
      <header className="flex-none z-30 h-20">
        <nav className="max-w-7xl mx-auto px-8 h-full flex items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black">M</div>
            <span className="text-xl font-bold tracking-tight text-slate-900">MASA</span>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative z-20 flex items-center justify-center px-6">
        <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Left Side: Info - Hidden on Mobile/Tablet */}
          <section className="hidden lg:flex flex-col space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-blue-100">
                Authorized Access
              </div>
              <h1 className="text-6xl font-extrabold leading-[1.1] tracking-tight text-slate-900">
                Manage your business <br />
                <span className="text-blue-600">with ease.</span>
              </h1>
              <p className="text-lg text-slate-600 max-w-md font-medium leading-relaxed">
                Log in to access your dashboard, manage inventory, and track sales in real-time.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Reliable</p>
                <p className="text-xs text-slate-500 font-bold">99.9% Uptime</p>
              </div>
              <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Secure</p>
                <p className="text-xs text-slate-500 font-bold">End-to-end encryption</p>
              </div>
            </div>
          </section>

          {/* Right Side: Form - Centered on Mobile/Tablet */}
          <section className="flex justify-center lg:justify-end">
            <Suspense fallback={<div className="text-slate-400 font-bold animate-pulse">Loading Terminal...</div>}>
              <SignInForm />
            </Suspense>
          </section>
        </div>
      </main>

    </div>
  );
}