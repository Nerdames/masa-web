"use client";

import React, { Suspense } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { signOut } from "next-auth/react";

/**
 * AccessDeniedContent component containing the UI and logic.
 */
const AccessDeniedContent = ({ 
  message = "Your current role does not have permission to access this resource." 
}: { 
  message?: string 
}) => {
  const router = useRouter();

  return (
    <div className="relative flex flex-col items-center justify-center max-h-screen bg-slate-50 px-4 overflow-hidden">
      
      {/* Modern Background Decorations */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Soft Red Ambient Glow */}
        <div className="absolute -top-[10%] -left-[5%] w-[400px] h-[400px] rounded-full bg-red-100/30 blur-[100px]" />
        {/* Soft Slate Ambient Glow */}
        <div className="absolute -bottom-[10%] -right-[5%] w-[400px] h-[400px] rounded-full bg-slate-200/40 blur-[100px]" />
        {/* Subtle Grid Overlay */}
        <div className="absolute inset-0 opacity-[0.015] [background-image:linear-gradient(#000_1px,transparent_1px),linear-gradient(90deg,#000_1px,transparent_1px)] [background-size:40px_40px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 max-w-md w-full p-10 bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-slate-100 text-center"
      >
        {/* Icon with Spring Animation */}
        <motion.div 
          initial={{ scale: 0.8, rotate: -5 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ 
            delay: 0.2, 
            type: "spring", 
            stiffness: 200, 
            damping: 15 
          }}
          className="inline-flex items-center justify-center w-20 h-20 mb-8 rounded-3xl bg-red-50 text-red-500 shadow-sm"
        >
          <i className="bx bx-shield-x text-[64px]" />
        </motion.div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-slate-900 mb-3 tracking-tight">
          Access Denied
        </h1>

        {/* Dynamic Message */}
        <p className="text-slate-500 mb-10 leading-relaxed font-medium">
          {message}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          {/* Primary Action */}
          <motion.button
            whileHover={{ y: -1, backgroundColor: "#0f172a" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push("/dashboard")}
            className="group flex items-center justify-center gap-2 w-full px-6 py-4 bg-slate-900 text-white font-bold rounded-2xl transition-all shadow-lg shadow-slate-200"
          >
            <i className="bx bx-home-alt text-xl group-hover:-translate-y-0.5 transition-transform" />
            <span>Go to Dashboard</span>
          </motion.button>
          
          {/* Secondary Action */}
          <motion.button
            whileHover={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => signOut({ callbackUrl: "/auth/signin" })}
            className="flex items-center justify-center gap-2 w-full px-6 py-4 bg-white text-slate-600 border-2 border-slate-100 font-bold rounded-2xl transition-all"
          >
            <i className="bx bx-log-out text-xl" />
            <span>Sign in as different user</span>
          </motion.button>
        </div>

        {/* Security Badge Indicator */}
        <div className="mt-10 pt-8 border-t border-slate-50 flex items-center justify-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
            MASA Security Protocol Active
          </p>
        </div>
      </motion.div>

      {/* Footer */}
      <motion.footer 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="relative z-10 mt-8 text-sm font-medium text-slate-400"
      >
        © {new Date().getFullYear()} MASA. All rights reserved.
      </motion.footer>
    </div>
  );
};

/**
 * Main Page Component (App)
 * Wrapped in Suspense for Next.js App Router compatibility.
 */
export default function App() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    }>
      <AccessDeniedContent />
    </Suspense>
  );
}