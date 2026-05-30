"use client";

import { useRouter } from "next/navigation";
import { FC } from "react";
import { motion } from "framer-motion";
import { signOut } from "next-auth/react";

interface AccessDeniedProps {
  message?: string;
}

const AccessDenied: FC<AccessDeniedProps> = ({
  message = "Your current role does not have permission to access this resource.",
}) => {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="max-w-md w-full p-8 bg-white rounded-2xl shadow-sm border border-gray-100"
      >
        {/* Icon with subtle pulse animation */}
        <motion.div 
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="text-red-500 mb-6"
        >
          <i className="bx bx-shield-x text-[80px]" />
        </motion.div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Access Denied
        </h1>

        {/* Message */}
        <p className="text-gray-500 mb-8 leading-relaxed">
          {message}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          {/* Primary Action: Go to safe zone */}
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full px-6 py-3 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <i className="bx bx-home-alt text-lg" />
            Go to Dashboard
          </button>
          
          {/* Secondary Action: Switch accounts */}
          <button
            onClick={() => signOut({ callbackUrl: "/signin" })}
            className="w-full px-6 py-3 bg-white text-gray-600 border border-gray-200 font-medium rounded-xl hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
          >
            <i className="bx bx-log-out text-lg" />
            Sign in as different user
          </button>
        </div>
      </motion.div>

      {/* Footer */}
      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-8 text-sm text-gray-400"
      >
        © {new Date().getFullYear()} MASA. Security Protocol Active.
      </motion.p>
    </div>
  );
};

export default AccessDenied;