"use client";

import Link from "next/link";
import { cn } from "@/core/utils";
import React from "react";

/**
 * WelcomePage — Strict Fit to Screen
 * 100dvh flexbox layout guarantees no overflow or layout shifts.
 * The Dashboard preview is a read-only "Non-Select" UI.
 */
export default function WelcomePage() {
  return (
    <div
      className="h-[100dvh] w-full bg-gradient-to-br from-[#DBEAFE] via-[#E0F2FE] to-[#EFF6FF] text-slate-900 font-sans relative overflow-hidden flex flex-col"
      style={{ boxSizing: "border-box" }}
    >
      <style jsx global>{`
        /* Hard-lock scrolling globally to prevent any bounce or shift */
        html, body, #__next { 
          height: 100%; 
          width: 100%;
          overflow: hidden !important; 
          margin: 0; 
          padding: 0;
          position: fixed; /* Prevents "pull-to-refresh" on mobile */
        }
        
        .pulse-slow { animation: pulse 4s ease-in-out infinite; }
        .float-slow { animation: float 6s ease-in-out infinite; }
        @keyframes float { 
          0% { transform: translateY(0); } 
          50% { transform: translateY(-6px); } 
          100% { transform: translateY(0); } 
        }
      `}</style>

      {/* Background Decorative Elements */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <svg
          className="absolute -left-10 -top-10 opacity-20"
          viewBox="0 0 600 600"
          style={{ width: "min(45vw, 450px)" }}
        >
          <defs>
            <linearGradient id="gA" x1="0" x2="1">
              <stop offset="0" stopColor="#463aed" />
              <stop offset="1" stopColor="#06B6D4" />
            </linearGradient>
          </defs>
          <circle cx="300" cy="300" r="260" fill="url(#gA)" />
        </svg>

        <svg
          className="absolute -right-10 -bottom-10 opacity-15"
          viewBox="0 0 600 600"
          style={{ width: "min(40vw, 400px)" }}
        >
          <defs>
            <linearGradient id="gB" x1="0" x2="1">
              <stop offset="0" stopColor="#FF7AB6" />
              <stop offset="1" stopColor="#FFD580" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="600" height="600" rx="120" fill="url(#gB)" />
        </svg>
      </div>

      {/* Header - Fixed Height */}
      <header className="flex-none z-30 h-[64px] md:h-[72px]">
        <nav className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white text-indigo-900 flex items-center justify-center font-black shadow-lg">M</div>
            <span className="text-lg font-black tracking-tighter text-slate-900">MASA</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/signin" className="text-xs font-bold uppercase tracking-widest text-slate-600 hover:text-indigo-600 transition">Sign In</Link>
            <Link href="/register" className="px-5 py-2 rounded-full text-xs font-bold bg-indigo-600 text-white shadow-md hover:bg-indigo-700 transition-colors hidden sm:block">Get Started</Link>
          </div>
        </nav>
      </header>

      {/* Main Content Area - Flex Fill */}
      <main className="flex-1 relative z-20 flex flex-col items-center justify-center px-6 min-h-0">
        <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center min-h-0">
          
          {/* Left: Hero Text */}
          <section className="flex flex-col justify-center space-y-4 md:space-y-6">
            <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full w-fit">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">v3.0 Enterprise Edition</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-7xl font-black leading-[1.1] tracking-tight text-slate-900">
              Unify your <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-blue-500 to-cyan-500">Retail & Ops</span>
            </h1>

            <p className="text-sm md:text-base text-slate-600 max-w-md leading-relaxed">
              Manage multi-branch inventory, real-time tax routing, and granular permissions from one secure, high-performance workspace.
            </p>

            <div className="flex gap-3">
              <Link href="/register" className="px-8 py-3.5 rounded-xl bg-slate-900 text-white font-bold text-sm shadow-xl hover:bg-blue-700 transition transform hover:-translate-y-0.5">
                Start Free Trial
              </Link>
              <Link href="/support" className="px-8 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition hidden sm:block">
                FAQ
              </Link>
            </div>
          </section>

          {/* Right: Dashboard Preview (Non-Select/Static View) */}
          <aside className="hidden lg:flex items-center justify-center relative min-h-0">
            <div className="w-full max-w-[580px] bg-white/40 backdrop-blur-xl borderp-4 rounded-2xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] relative overflow-hidden">
              
              {/* Internal Mockup Shell */}
              <div className="aspect-[1.4/1] bg-slate-50 rounded-2xl border border-slate-200/60 overflow-hidden flex flex-col shadow-inner">
                
                {/* Mock Browser Header */}
                <div className="h-10 bg-white border-b border-slate-100 flex items-center justify-between px-4">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-200" />
                    <div className="w-2.5 h-2.5 rounded-full bg-red-200" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-200" />
                  </div>
                  <div className="h-5 w-48 bg-slate-50 rounded-full border border-slate-100 text-[9px] flex items-center justify-center text-slate-400 font-medium tracking-tight">
                    masa.app/hq-dashboard
                  </div>
                   <div className="w-6 h-6 rounded-xl bg-white text-indigo-900 flex items-center justify-center font-black shadow-lg">M</div>
                </div>

                {/* Mock Content */}
                <div className="p-5 space-y-5 flex-1 overflow-hidden">
                  <div className="flex justify-between items-end">
                    <div>
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Main Branch Overview</h3>
                      <p className="text-[10px] text-slate-400 font-medium">Live data sync active</p>
                    </div>
                    <div className="h-6 w-16 bg-white border border-slate-200 rounded-lg" />
                  </div>

                  {/* Cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm space-y-1">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Net Sales (Today)</p>
                      <p className="text-xl font-black text-slate-900">₦2,408,000</p>
                    </div>
                    <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm space-y-1">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Invoices</p>
                      <p className="text-xl font-black text-slate-900">142</p>
                    </div>
                  </div>

                  {/* Transaction Feed */}
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-50 flex justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Recent Activity</span>
                      <span className="text-[10px] font-bold text-blue-500">Live</span>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {[
                        { title: "POS Payment", ref: "TX-902", amt: "₦45,000", color: "bg-emerald-50 text-emerald-600" },
                        { title: "Stock Transfer", ref: "BR-410", amt: "Pending", color: "bg-amber-50 text-amber-600" },
                        { title: "Inventory Restock", ref: "PO-112", amt: "₦1.2M", color: "bg-indigo-50 text-indigo-600" }
                      ].map((item, idx) => (
                        <div key={idx} className="px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-xs", item.color)}>
                              {item.title[0]}
                            </div>
                            <div>
                              <p className="text-[11px] font-bold text-slate-800">{item.title}</p>
                              <p className="text-[9px] text-slate-400 uppercase tracking-tighter">{item.ref}</p>
                            </div>
                          </div>
                          <p className="text-[11px] font-black text-slate-900">{item.amt}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Live Indicator Footer */}
                <div className="h-8 bg-slate-900 flex items-center justify-between px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em]">Security Protocol Active</span>
                  </div>
                  <span className="text-[8px] text-slate-500">v3.0.42</span>
                </div>
              </div>


            </div>
          </aside>
        </div>
      </main>

      {/* Footer - Fixed Height */}
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