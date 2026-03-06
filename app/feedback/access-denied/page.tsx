"use client";

import React, { Suspense } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { signOut } from "next-auth/react";

const AccessDeniedContent = ({
  message = "Your current role does not have permission to access this resource."
}: {
  message?: string;
}) => {
  const router = useRouter();

  return (
    <div className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">

      {/* Ambient Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-[450px] h-[450px] rounded-full bg-red-500/20 blur-[140px]" />
        <div className="absolute -bottom-32 -right-32 w-[450px] h-[450px] rounded-full bg-indigo-500/20 blur-[140px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="
          relative z-10 w-full max-w-lg
          max-h-[90vh]
          flex flex-col justify-between
          rounded-[2rem]
          bg-white/90 backdrop-blur-xl
          border border-white/40
          shadow-2xl
          p-6 sm:p-10
          text-center
        "
      >

        {/* Top Section */}
        <div>
          {/* Icon */}
          <motion.div
            initial={{ scale: 0.7, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 180 }}
            className="mx-auto mb-6 flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-3xl bg-red-100 text-red-500 shadow-inner"
          >
            <i className="bx bx-shield-x text-[50px] sm:text-[64px]" />
          </motion.div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3 bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
            Access Denied
          </h1>

          {/* Message */}
          <p className="text-slate-600 leading-relaxed text-sm sm:text-[15px] font-medium mb-8">
            {message}
          </p>

          {/* Buttons */}
          <div className="flex flex-col gap-3">

            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => router.push("/dashboard")}
              className="flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-semibold text-white bg-gradient-to-r from-slate-900 to-slate-700 shadow-lg transition"
            >
              <i className="bx bx-home-alt text-lg" />
              Go to Dashboard
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => signOut({ callbackUrl: "/auth/signin" })}
              className="flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            >
              <i className="bx bx-log-out text-lg" />
              Sign in as different user
            </motion.button>

          </div>
        </div>

        {/* Security Indicator */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-70 animate-ping"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
          </span>
          <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-slate-400">
            Security Protocol Active
          </p>
        </div>

      </motion.div>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="absolute bottom-4 text-xs text-slate-300 font-medium"
      >
        © {new Date().getFullYear()} MASA. All rights reserved.
      </motion.footer>
    </div>
  );
};

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-slate-900">
          <div className="w-10 h-10 border-4 border-slate-400 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <AccessDeniedContent />
    </Suspense>
  );
}