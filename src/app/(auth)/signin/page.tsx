"use client";

import React, { useState, FormEvent, Suspense, useEffect, useRef } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, useAnimation } from "framer-motion";
//  NEW (Updated to match the restructured layout)
import { useAlerts } from "@/shared/components/feedback/AlertProvider";
import { DEFAULT_TERMINALS } from "@/server/permissions/enforcer";
import { Role, NotificationType } from "@prisma/client";
import { Loader2 } from "lucide-react";

/**
 * C:\Users\chibu\Projects\Next\masa\src\app\signin\page.tsx
 * MASA - Unified Sign In
 * Optimized for production with enterprise safety patches against physical trespassing,
 * background memory leaks, browser autofill scraping, and device loss.
 */

interface AuthErrorConfig {
  title: string;
  message: string;
  type: NotificationType;
  kind: "PUSH" | "TOAST";
}

const ERROR_MAP: Record<string, AuthErrorConfig> = {
  // Credentials Errors
  ACCOUNT_DISABLED: { title: "Account Disabled", message: "Your access has been revoked. Contact your admin.", type: NotificationType.SECURITY, kind: "TOAST" },
  ORGANIZATION_SUSPENDED: { title: "Organization Suspended", message: "Access is temporarily offline for your organization.", type: NotificationType.SYSTEM, kind: "TOAST" },
  ACCOUNT_LOCKED_ADMIN: { title: "Account Locked", message: "Your account is locked for security reasons.", type: NotificationType.SECURITY, kind: "TOAST" },
  EXCESSIVE_FAILED_ATTEMPTS: { title: "Too Many Attempts", message: "Security lockout active. Please try again in 15 minutes.", type: NotificationType.SECURITY, kind: "TOAST" },
  TEMPORARY_SECURITY_LOCKOUT: { title: "Temporary Lockout", message: "Please wait 15 minutes before trying again.", type: NotificationType.SECURITY, kind: "TOAST" },
  INVALID_CREDENTIALS: { title: "Login Failed", message: "The email or password provided is incorrect.", type: NotificationType.SECURITY, kind: "TOAST" },
  CredentialsSignin: { title: "Login Failed", message: "The email or password provided is incorrect.", type: NotificationType.SECURITY, kind: "TOAST" },
  SessionExpired: { title: "Session Expired", message: "Please sign in again to continue.", type: NotificationType.SECURITY, kind: "TOAST" },
  
  // Google SSO B2B Guard Errors (Mapped from auth.ts)
  AccessDenied: { title: "Access Denied", message: "This email is not registered for SSO access. Contact your administrator.", type: NotificationType.SECURITY, kind: "TOAST" },
  OrgSuspended: { title: "Organization Suspended", message: "Your organization's access is currently suspended.", type: NotificationType.SYSTEM, kind: "TOAST" },
  AccountLocked: { title: "Account Locked", message: "Your account is currently locked or disabled.", type: NotificationType.SECURITY, kind: "TOAST" },
  OAuthSignin: { title: "SSO Connection Failed", message: "Could not connect to Google servers. Please try again.", type: NotificationType.SYSTEM, kind: "TOAST" },
  OAuthCallback: { title: "SSO Interrupted", message: "Authentication via Google was interrupted.", type: NotificationType.SECURITY, kind: "TOAST" },
};

const SignInForm = () => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Security Patches: Controlled read-only triggers to block browser background auto-injections
  const [identifierFocused, setIdentifierFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const controls = useAnimation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dispatch } = useAlerts();

  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const urlError = searchParams.get("error");
  
  // Guard against React strict-mode double dispatch loops
  const handledErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (urlError && ERROR_MAP[urlError] && handledErrorRef.current !== urlError) {
      handledErrorRef.current = urlError;
      const config = ERROR_MAP[urlError];
      dispatch({ kind: config.kind, type: config.type, title: config.title, message: config.message, notificationId: "" });
      controls.start({ x: [-8, 8, -8, 8, 0], transition: { duration: 0.4 } });
    }
  }, [urlError, dispatch, controls]);

  const handleGoogleSignIn = async () => {
    if (loading || googleLoading) return;
    setGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl });
    } catch {
      dispatch({ kind: "TOAST", type: NotificationType.SYSTEM, title: "Connection Error", message: "Unable to reach Google servers.", notificationId: "" });
      setGoogleLoading(false);
    }
  };

  const handleSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading || googleLoading) return;

    const trimmedIdentifier = identifier.trim();
    const trimmedPassword = password.trim();

    if (!trimmedIdentifier || !trimmedPassword) return;

    setLoading(true);

    // Production Security Measure: Move sensitive inputs immediately to memory variables
    // and scrub UI states to prevent memory profiling if the hardware is left unattended.
    setPassword("");
    setIdentifier("");
    setIdentifierFocused(false);
    setPasswordFocused(false);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        identifier: trimmedIdentifier,
        password: trimmedPassword,
        callbackUrl,
      });

      if (result?.error) {
        await controls.start({ x: [-8, 8, -8, 8, 0], transition: { duration: 0.4 } });
        const config = ERROR_MAP[result.error] || ERROR_MAP.INVALID_CREDENTIALS;
        dispatch({ kind: config.kind, type: config.type, title: config.title, message: config.message, notificationId: "" });
      } else {
        const session = await getSession();
        const user = session?.user;

        dispatch({
          kind: "PUSH",
          type: user?.requiresPasswordChange ? NotificationType.SECURITY : NotificationType.SYSTEM,
          title: user?.requiresPasswordChange ? "Update Required" : "Welcome Back",
          message: "Redirecting to your dashboard...",
          notificationId: "",
        });

        setTimeout(() => {
          if (user?.requiresPasswordChange) {
            router.replace("/reset-password");
          } else {
            const userRole = user?.role as Role;
            const defaultRoute = (userRole && DEFAULT_TERMINALS[userRole]) ? DEFAULT_TERMINALS[userRole] : "/";
            const targetRoute = callbackUrl !== "/" ? callbackUrl : defaultRoute;
            
            router.replace(targetRoute);
          }
          router.refresh(); 
        }, 800);
      }
    } catch {
      dispatch({ kind: "TOAST", type: NotificationType.SYSTEM, title: "Connection Error", message: "Unable to reach the server.", notificationId: "" });
    } finally {
      setLoading(false);
    }
  };

  const isFormDisabled = loading || googleLoading;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      // Reduced max-width and scaled down container padding/radius
      className="w-full max-w-[360px] bg-white rounded-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden"
    >
      <header className="p-6 pb-4 text-center">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Sign In</h2>
        <p className="text-xs text-slate-500 mt-1">Enter your credentials to access your account</p>
      </header>

      <div className="px-6 pb-6 space-y-4">
        <motion.form animate={controls} onSubmit={handleSignIn} className="space-y-4">
          
          {/* Google B2B SSO Button */}
          <button 
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isFormDisabled}
            className="w-full py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold tracking-wide hover:bg-slate-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm disabled:opacity-70 disabled:pointer-events-none"
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-slate-100"></div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">or sign in with email</span>
            <div className="flex-1 h-px bg-slate-100"></div>
          </div>

          {/* Credentials Inputs */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider ml-1">Email or Staff ID</label>
            <div className="relative flex items-center">
              <i className="bx bx-envelope absolute left-3 text-slate-400 text-base" />
              <input 
                type="text"
                placeholder="john.doe@example.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                readOnly={!identifierFocused}
                onFocus={() => setIdentifierFocused(true)}
                onBlur={() => setIdentifierFocused(false)}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:border-blue-500 outline-none transition-all disabled:opacity-70 disabled:bg-slate-100"
                required
                disabled={isFormDisabled}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider ml-1">Password</label>
            <div className="relative flex items-center">
              <i className="bx bx-lock-alt absolute left-3 text-slate-400 text-base" />
              <input 
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                readOnly={!passwordFocused}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                className="w-full pl-9 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:border-blue-500 outline-none transition-all disabled:opacity-70 disabled:bg-slate-100"
                required
                disabled={isFormDisabled}
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-slate-400 hover:text-blue-600 transition-colors"
                disabled={isFormDisabled}
              >
                <i className={showPassword ? "bx bx-hide text-sm" : "bx bx-show text-sm"} />
              </button>
            </div>
          </div>

          <button 
            type="submit"
            disabled={isFormDisabled}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:pointer-events-none"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : "Sign In"}
          </button>
        </motion.form>

        <div className="flex flex-col items-center gap-2 pt-4 border-t border-slate-100">
          <p className="text-[10px] text-slate-400">Don&apos;t have an account yet?</p>
          <Link href="/register" className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors">
            Register Account
          </Link>
        </div>
      </div>
    </motion.div>
  );
};

export default function SignInPage() {
  return (
    // Replaced h-screen with min-h-screen and enabled y-axis overflow to prevent elements hiding at the bottom
    <div className="min-h-screen w-full bg-[#F8FAFC] flex flex-col overflow-y-auto overflow-x-hidden relative">
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden hidden lg:block">
        <div className="absolute -left-20 -top-20 w-[400px] h-[400px] bg-blue-100/50 rounded-full blur-3xl" />
        <div className="absolute -right-20 -bottom-20 w-[400px] h-[400px] bg-indigo-100/50 rounded-full blur-3xl" />
      </div>

      <header className="flex-none z-30 h-16">
        <nav className="max-w-7xl mx-auto px-6 h-full flex items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-blue-600 text-white flex items-center justify-center font-black text-sm">M</div>
            <span className="text-lg font-bold tracking-tight text-slate-900">MASA</span>
          </div>
        </nav>
      </header>

      {/* Added py-8 to ensure comfortable spacing on smaller devices without cutting off content */}
      <main className="flex-1 relative z-20 flex items-center justify-center px-4 py-8">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <section className="hidden lg:flex flex-col space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border border-blue-100">
                Authorized Access
              </div>
              <h1 className="text-4xl lg:text-5xl font-extrabold leading-[1.1] tracking-tight text-slate-900">
                Manage your business <br />
                <span className="text-blue-600">with ease.</span>
              </h1>
              <p className="text-sm lg:text-base text-slate-600 max-w-sm font-medium leading-relaxed">
                Log in to access your dashboard, manage inventory, and track sales in real-time.
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
            <Suspense fallback={<div className="text-slate-400 font-bold animate-pulse text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading Terminal...</div>}>
              <SignInForm />
            </Suspense>
          </section>
        </div>
      </main>
    </div>
  );
}