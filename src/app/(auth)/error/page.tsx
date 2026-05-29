"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, AlertTriangle, ArrowLeft, Home } from "lucide-react";

/**
 * MASA Terminal v3.0 - Authentication Error Page
 * Redesigned to exactly match the Unified Sign In layout architecture.
 * Fortified against reverse-proxy infinite redirect loops.
 */

interface ErrorConfig {
  title: string;
  message: string;
}

const ERROR_MAP: Record<string, ErrorConfig> = {
  // Credentials / Security Locks
  ACCOUNT_DISABLED: { title: "Account Disabled", message: "Your access has been revoked. Contact your admin." },
  ORGANIZATION_SUSPENDED: { title: "Organization Suspended", message: "Access is temporarily offline for your organization." },
  ACCOUNT_LOCKED_ADMIN: { title: "Account Locked", message: "Your account is locked for security reasons." },
  EXCESSIVE_FAILED_ATTEMPTS: { title: "Too Many Attempts", message: "Security lockout active. Please try again in 15 minutes." },
  TEMPORARY_SECURITY_LOCKOUT: { title: "Temporary Lockout", message: "Please wait 15 minutes before trying again." },
  INVALID_CREDENTIALS: { title: "Login Failed", message: "The email or password provided is incorrect." },
  CredentialsSignin: { title: "Login Failed", message: "The email or password provided is incorrect." },
  SessionExpired: { title: "Session Expired", message: "Please sign in again to continue." },
  
  // Google SSO B2B Guard Errors
  AccessDenied: { title: "Access Denied", message: "This email is not registered for SSO access. Contact your administrator." },
  OrgSuspended: { title: "Organization Suspended", message: "Your organization's access is currently suspended." },
  AccountLocked: { title: "Account Locked", message: "Your account is currently locked or disabled." },
  OAuthSignin: { title: "SSO Connection Failed", message: "Could not connect to Google servers. Please try again." },
  OAuthCallback: { title: "SSO Interrupted", message: "Authentication via Google was interrupted." },
  
  // NextAuth Engine Internal Faults
  Configuration: { title: "Configuration Fault", message: "There is an issue with the server security configuration." },
  Verification: { title: "Link Expired", message: "The security verification link has expired or was already consumed." },
  Default: { title: "Authentication Failed", message: "An unexpected system-level authentication error occurred." },
};

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error") || "Default";
  
  const config = ERROR_MAP[urlError] || ERROR_MAP.Default;

  // Resolves explicit sign-in link with parameters to break proxy double-redirect state-machines
  const targetSignInUrl = `/signin?error=${encodeURIComponent(urlError)}`;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-[360px] bg-white rounded-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden"
    >
      <header className="p-6 pb-4 text-center">
        {/* Animated Error Indicator Badge */}
        <div className="relative inline-block mb-3">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto border border-red-100 shadow-sm">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="absolute -right-1 -top-1 w-3 h-3 rounded-full bg-white border border-red-50 flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
          </div>
        </div>

        <h2 className="text-xl font-bold tracking-tight text-slate-900">{config.title}</h2>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{config.message}</p>
      </header>

      <div className="px-6 pb-6 space-y-4">
        {/* Developer / Security Diagnostics Panel */}
        <div className="text-center bg-slate-50 rounded-xl p-3 border border-slate-100">
          <span className="text-[9px] font-mono block text-slate-400 uppercase tracking-widest">
            Security Trace: {urlError}
          </span>
        </div>

        {/* Dynamic Navigation CTAs */}
        <div className="space-y-2">
          <Link 
            href={targetSignInUrl}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Try Signing In Again
          </Link>

          <Link 
            href="/"
            className="w-full py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold tracking-wide hover:bg-slate-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Home className="w-3.5 h-3.5 text-slate-400" />
            Return Home
          </Link>
        </div>

        <div className="flex flex-col items-center gap-2 pt-4 border-t border-slate-100">
          <p className="text-[10px] text-slate-400">Encountering persistent access errors?</p>
          <Link href="/support" className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors">
            Contact System Administrator
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] flex flex-col overflow-y-auto overflow-x-hidden relative">
      {/* Background Decorative Blur Gradients */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden hidden lg:block">
        <div className="absolute -left-20 -top-20 w-[400px] h-[400px] bg-red-100/40 rounded-full blur-3xl" />
        <div className="absolute -right-20 -bottom-20 w-[400px] h-[400px] bg-indigo-100/50 rounded-full blur-3xl" />
      </div>

      {/* Global Application Nav Header */}
      <header className="flex-none z-30 h-16">
        <nav className="max-w-7xl mx-auto px-6 h-full flex items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-blue-600 text-white flex items-center justify-center font-black text-sm">M</div>
            <span className="text-lg font-bold tracking-tight text-slate-900">MASA</span>
          </div>
        </nav>
      </header>

      {/* Split Responsive Container */}
      <main className="flex-1 relative z-20 flex items-center justify-center px-4 py-8">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          
          {/* Left Hero Section (Hidden on Mobile) */}
          <section className="hidden lg:flex flex-col space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border border-red-100">
                Security Perimeter Guard
              </div>
              <h1 className="text-4xl lg:text-5xl font-extrabold leading-[1.1] tracking-tight text-slate-900">
                Authentication <br />
                <span className="text-red-500">was interrupted.</span>
              </h1>
              <p className="text-sm lg:text-base text-slate-600 max-w-sm font-medium leading-relaxed">
                Your authorization context could not be parsed safely. Please verify your identity profiles or check with system engineers.
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

          {/* Right Interface Container */}
          <section className="flex justify-center lg:justify-end">
            <Suspense 
              fallback={
                <div className="text-slate-400 font-bold animate-pulse text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> 
                  Loading Security Portal...
                </div>
              }
            >
              <AuthErrorContent />
            </Suspense>
          </section>
        </div>
      </main>
    </div>
  );
}