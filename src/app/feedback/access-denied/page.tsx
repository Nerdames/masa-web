"use client";

import React, { Suspense } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { signOut } from "next-auth/react";
import Link from "next/link";

/**
 * AccessDeniedContent — Synchronized with MASA v3.0 Branding
 */
const AccessDeniedContent = ({
  message = "Your current role does not have permission to access this resource.",
}: {
  message?: string;
}) => {
  const router = useRouter();

  return (
    <div className="h-[100dvh] w-full bg-gradient-to-br from-[#DBEAFE] via-[#E0F2FE] to-[#EFF6FF] text-slate-900 font-sans relative overflow-hidden flex flex-col">
      <style jsx global>{`
        html, body { 
          height: 100%; 
          overflow: hidden !important; 
          position: fixed;
          width: 100%;
        }
      `}</style>

      {/* Background Decorative Elements (Mirrored from Welcome Page) */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <svg className="absolute -left-10 -top-10 opacity-20" viewBox="0 0 600 600" style={{ width: "min(45vw, 450px)" }}>
          <circle cx="300" cy="300" r="260" fill="url(#gA)" />
          <defs><linearGradient id="gA"><stop offset="0" stopColor="#463aed" /><stop offset="1" stopColor="#06B6D4" /></linearGradient></defs>
        </svg>
        <svg className="absolute -right-10 -bottom-10 opacity-15" viewBox="0 0 600 600" style={{ width: "min(40vw, 400px)" }}>
          <rect x="0" y="0" width="600" height="600" rx="120" fill="url(#gB)" />
          <defs><linearGradient id="gB"><stop offset="0" stopColor="#FF7AB6" /><stop offset="1" stopColor="#FFD580" /></linearGradient></defs>
        </svg>
      </div>

      {/* Header */}
      <header className="flex-none z-30 h-[64px] md:h-[72px]">
        <nav className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white text-indigo-900 flex items-center justify-center font-black shadow-lg">M</div>
            <span className="text-lg font-black tracking-tighter text-slate-900 uppercase">MASA</span>
          </Link>
          <button 
            onClick={() => signOut({ callbackUrl: "/signin" })}
            className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-red-600 transition flex items-center gap-2"
          >
            <i className="bx bx-log-out-circle text-lg"></i>
            Switch Account
          </button>
        </nav>
      </header>

      {/* Main UI */}
      <main className="flex-1 relative z-20 flex flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm bg-white/60 backdrop-blur-2xl border border-white/40 p-8 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.08)] text-center space-y-6"
        >
          {/* Status Icon */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-3xl bg-red-50 text-red-500 flex items-center justify-center shadow-inner relative">
                <i className="bx bx-shield-x text-4xl"></i>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping opacity-20" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Access Restricted
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed font-medium">
              {message}
            </p>
          </div>

          {/* Action Buttons - Matching the "Start Trial" and "FAQ" Styles */}
          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={() => router.push("/")}
              className="w-full py-4 rounded-2xl bg-slate-900 text-white font-bold text-sm shadow-xl hover:bg-indigo-600 transition transform active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <i className="bx bx-doughnut-chart text-lg"></i>
              Return to Overview
            </button>
            
            <button
              onClick={() => router.back()}
              className="w-full py-4 rounded-2xl border border-slate-200 bg-white/50 text-slate-600 font-bold text-sm hover:bg-slate-50 transition transform active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <i className="bx bx-arrow-back text-lg"></i>
              Go Back
            </button>
          </div>

          {/* Error Code Footer */}
          <div className="pt-4 flex items-center justify-center gap-2 opacity-40">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
            <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500">Security-Block 403</span>
          </div>
        </motion.div>
      </main>

      {/* Fixed Footer */}
      <footer className="flex-none h-[60px] border-t border-slate-200/30 z-30">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-center text-[9px] font-bold uppercase tracking-[0.25em] text-slate-400">
          MASA Protocol v3.0 • Secured Enterprise Environment
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="h-[100dvh] flex items-center justify-center bg-[#DBEAFE]">
          <div className="flex flex-col items-center gap-4">
             <div className="w-12 h-12 rounded-2xl bg-white shadow-xl flex items-center justify-center animate-bounce">
                <span className="font-black text-indigo-900">M</span>
             </div>
             <div className="h-1 w-24 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 animate-[loading_1.5s_infinite]" />
             </div>
          </div>
        </div>
      }
    >
      <AccessDeniedContent />
    </Suspense>
  );
}