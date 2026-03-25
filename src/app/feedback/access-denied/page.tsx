"use client";

import React, { Suspense } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { signOut } from "next-auth/react";

const AccessDeniedContent = ({
  message = "Your current role does not have permission to access this resource.",
}: {
  message?: string;
}) => {
  const router = useRouter();

  return (
    <main className="flex flex-col min-h-screen items-center justify-center 
      bg-gradient-to-br from-blue-50 via-white to-red-50 
      dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 
      px-4">

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-xs p-6 rounded-xl shadow-lg space-y-4
        bg-white dark:bg-slate-900
        border border-gray-100 dark:border-slate-700"
      >
        {/* Header */}
        <div className="space-y-2 text-center">
          <div className="flex justify-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-lg
              bg-red-100 text-red-600
              dark:bg-red-500/15 dark:text-red-400">
              <i className="bx bx-shield-x text-3xl"></i>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">
            Access Denied
          </h1>

          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {message}
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-3">

          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -1 }}
            onClick={() => router.push("/dashboard")}
            className="w-full py-2 text-sm font-medium rounded-lg
            bg-gray-900 text-white hover:bg-black
            dark:bg-slate-700 dark:hover:bg-slate-600
            transition flex items-center justify-center gap-2"
          >
            <i className="bx bx-home-alt"></i>
            Go to Dashboard
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -1 }}
            onClick={() => signOut({ callbackUrl: "/auth/signin" })}
            className="w-full py-2 text-sm font-medium rounded-lg
            border border-gray-200 text-gray-600 hover:bg-gray-50
            dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800
            transition flex items-center justify-center gap-2"
          >
            <i className="bx bx-log-out"></i>
            Sign in as different user
          </motion.button>

        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          Your account does not have permission to access this resource.
        </p>
      </motion.div>
    </main>
  );
};

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center
        bg-gray-100 dark:bg-slate-900">
          <div className="w-8 h-8 border-4
          border-gray-300 border-t-gray-700
          dark:border-slate-700 dark:border-t-white
          rounded-full animate-spin" />
        </div>
      }
    >
      <AccessDeniedContent />
    </Suspense>
  );
}