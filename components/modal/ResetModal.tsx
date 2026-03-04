"use client";

import { FC } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Preference, PreferenceScope } from "@prisma/client";

interface ResetModalProps {
  open: boolean;
  pref: Preference | null;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
}

export const ResetModal: FC<ResetModalProps> = ({ 
  open, 
  pref, 
  onConfirm, 
  onClose, 
  loading 
}) => {
  if (!pref) return null;

  // Map the scope to specific warnings, colors, and Boxicons
  const getScopeMeta = (scope: PreferenceScope) => {
    switch (scope) {
      case "ORGANIZATION":
        return {
          title: "Reset Global Default",
          desc: "This will remove the master default for the entire company. All branches and users will revert to system factory settings.",
          icon: "bx-buildings",
          btnColor: "bg-red-600 hover:bg-red-700 disabled:bg-red-300",
          accent: "text-red-600",
          bg: "bg-red-50"
        };
      case "BRANCH":
        return {
          title: "Reset Branch Policy",
          desc: "This will remove the default for this specific branch. All personnel in this branch will now inherit Organization settings.",
          icon: "bx-git-branch",
          btnColor: "bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300",
          accent: "text-amber-600",
          bg: "bg-amber-50"
        };
      default: // USER
        return {
          title: "Reset Personal Preference",
          desc: "This will remove your custom setting. You will revert to using the branch or organization default value.",
          icon: "bx-user",
          btnColor: "bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300",
          accent: "text-blue-600",
          bg: "bg-blue-50"
        };
    }
  };

  const meta = getScopeMeta(pref.scope);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* 1. Backdrop - Increased blur for focus focus */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={!loading ? onClose : undefined}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* 2. Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="relative w-full max-w-[340px] bg-white rounded-[24px] shadow-2xl border border-black/5 overflow-hidden p-8 text-center"
          >
            {/* Scope Icon with Scale Animation */}
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: "spring" }}
              className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${meta.bg} ${meta.accent}`}
            >
              <i className={`bx ${meta.icon} text-3xl`} />
            </motion.div>

            <div className="mb-6">
              <h3 className="text-[17px] font-black text-black/90 mb-2 leading-tight">
                {meta.title}
              </h3>
              
              {/* Value Preview - Confirms exactly what is being deleted */}
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-black/[0.03] rounded-full mb-3">
                <span className="text-[10px] font-bold text-black/30 uppercase tracking-widest">
                  {pref.key.replace(/_/g, ' ')}:
                </span>
                <span className="text-[10px] font-black text-black/70 truncate max-w-[120px]">
                  {String(pref.value)}
                </span>
              </div>

              <p className="text-[13px] text-black/45 leading-relaxed px-1">
                {meta.desc}
              </p>
            </div>

            {/* 3. Action Buttons */}
            <div className="flex flex-col gap-2">
              <button
                disabled={loading}
                onClick={onConfirm}
                className={`w-full py-3 ${meta.btnColor} text-white rounded-xl text-[13px] font-black transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-black/5`}
              >
                {loading ? (
                  <i className="bx bx-loader-alt animate-spin text-lg" />
                ) : (
                  "Confirm Reset"
                )}
              </button>
              
              <button
                disabled={loading}
                onClick={onClose}
                className="w-full py-2 text-black/30 hover:text-black/60 text-[12px] font-bold transition-colors uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};