"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { Suspense } from "react";

/**
 * AuthErrorContent - Handles the logic for displaying the specific auth error.
 * Matches the "MASA" Welcome Page design system.
 */
function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  // Map common NextAuth/Auth.js error codes to human-readable messages
  const errorMessages: Record<string, string> = {
    Configuration: "There is a problem with the server configuration. Check if your options are correct.",
    AccessDenied: "You do not have permission to sign in. Please contact your administrator.",
    Verification: "The verification link has expired or has already been used.",
    Default: "An unexpected authentication error occurred.",
  };

  const displayMessage = error && errorMessages[error] ? errorMessages[error] : errorMessages.Default;

  return (
    <main className="flex-1 relative z-20 flex flex-col items-center justify-center px-6 min-h-0">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Error Icon / Visual */}
        <div className="relative inline-block">
          <div className="w-20 h-20 rounded-3xl bg-red-50 flex items-center justify-center mx-auto border border-red-100 shadow-sm">
            <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="Ref-12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="absolute -right-2 -top-2 w-6 h-6 rounded-full bg-white border border-red-100 shadow-sm flex items-center justify-center">
             <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">
            Authentication <span className="text-red-500">Error</span>
          </h1>
          <p className="text-sm md:text-base text-slate-500 leading-relaxed">
            {displayMessage}
            <br />
            <span className="text-[10px] font-mono mt-2 block text-slate-400 uppercase tracking-widest">
              Error Code: {error || "UNDEFINED_CALLBACK"}
            </span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link 
            href="/signin" 
            className="px-8 py-3.5 rounded-xl bg-slate-900 text-white font-bold text-sm shadow-xl hover:bg-indigo-700 transition transform hover:-translate-y-0.5"
          >
            Try Signing In Again
          </Link>
          <Link 
            href="/" 
            className="px-8 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition"
          >
            Return Home
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function AuthErrorPage() {
  return (
    <div
      className="h-[100dvh] w-full bg-gradient-to-br from-[#DBEAFE] via-[#E0F2FE] to-[#EFF6FF] text-slate-900 font-sans relative overflow-hidden flex flex-col"
      style={{ boxSizing: "border-box" }}
    >
      <style jsx global>{`
        html, body { 
          height: 100%; 
          width: 100%;
          overflow: hidden !important; 
          margin: 0; 
          padding: 0;
          position: fixed;
        }
      `}</style>

      {/* Background Decorative Elements (Consistent with Welcome Page) */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <svg className="absolute -left-10 -top-10 opacity-20" viewBox="0 0 600 600" style={{ width: "min(45vw, 450px)" }}>
          <circle cx="300" cy="300" r="260" fill="url(#gA)" />
          <defs><linearGradient id="gA" x1="0" x2="1"><stop offset="0" stopColor="#463aed" /><stop offset="1" stopColor="#06B6D4" /></linearGradient></defs>
        </svg>
      </div>

      {/* Header */}
      <header className="flex-none z-30 h-[64px] md:h-[72px]">
        <nav className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white text-indigo-900 flex items-center justify-center font-black shadow-lg">M</div>
            <span className="text-lg font-black tracking-tighter text-slate-900">MASA</span>
          </Link>
        </nav>
      </header>

      {/* Content - Suspense is required when using useSearchParams in Next.js App Router */}
      <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 font-bold animate-pulse">LOADING...</div>}>
        <AuthErrorContent />
      </Suspense>

      {/* Footer */}
      <footer className="flex-none h-[60px] border-t border-slate-100/50 z-30">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
          <div className="flex gap-6">
            <Link href="/support" className="hover:text-indigo-600 transition-colors">Get Help</Link>
            <Link href="/status" className="hover:text-indigo-600 transition-colors">System Status</Link>
          </div>
          <span className="hidden sm:block">Secure Enterprise Portal</span>
        </div>
      </footer>
    </div>
  );
}