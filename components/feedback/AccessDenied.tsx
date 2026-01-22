"use client";

import { useRouter } from "next/navigation";
import { FC } from "react";
import { motion } from "framer-motion";

interface AccessDeniedProps {
  message?: string;
}

const AccessDenied: FC<AccessDeniedProps> = ({
  message = "You do not have permission to access this page.",
}) => {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4 text-center">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full"
      >
        {/* Icon */}
        <div className="text-red-500 mb-6">
          <i className="bx bx-shield-x text-[80px]" />
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-800 mb-4">
          Access Denied
        </h1>

        {/* Message */}
        <p className="text-gray-600 mb-6">{message}</p>

        {/* Back Button */}
        <button
          onClick={() => router.push("/dashboard")}
          className="px-6 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition"
        >
          Go Back
        </button>
      </motion.div>
    </div>
  );
};

export default AccessDenied;
