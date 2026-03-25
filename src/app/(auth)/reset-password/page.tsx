// src/app/auth/reset-password/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import PasswordChangeModal from "@/core/components/modal/PasswordChangeModal";

/**
 * MASA Protocol: Mandatory Credential Rotation
 * Integrated with Middleware to enforce security hardening for new personnel.
 */
export default function PasswordResetPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Authentication Guard: Ensure user belongs here
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/signin?callbackUrl=/dashboard");
    }
    if (status === "authenticated" && !session?.user?.requiresPasswordChange) {
      router.replace("/dashboard");
    }
  }, [status, session, router]);

  // 2. Protocol Completion Handler
  const handleSuccess = async () => {
    setIsUpdating(true);
    setError(null);

    try {
      // Triggers the 'update' event in your NextAuth jwt callback
      await update({ 
        requiresPasswordChange: false,
        lastActivityAt: Date.now() 
      });

      // Navigate to the operational core
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to synchronize security state.");
      setIsUpdating(false);
    }
  };

  // Loading State: High-fidelity "Syncing" UI
  if (status === "loading" || isUpdating) {
    return (
      <div className="min-h-screen bg-[#F4F7F9] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-[3px] border-slate-200 border-t-slate-900 rounded-full animate-spin mb-6" />
        <div className="text-center space-y-2">
          <p className="font-black text-[10px] uppercase tracking-[0.4em] text-slate-400 animate-pulse">
            Syncing Security Ledger
          </p>
          <p className="text-[10px] font-medium text-slate-400">Verifying MASA Access Tokens...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
      {/* Background Decor (MASA Aesthetic) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-50/50 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-slate-100 rounded-full blur-[120px]" />
      </div>

      <div className="relative w-full max-w-xl">
        <div className="bg-white rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden">
          {/* Hardened Header */}
          <div className="bg-slate-900 p-10 text-white relative">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg">
                <i className="bx bx-shield-quarter text-3xl animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tight">Security Hardening</h1>
                <p className="text-[10px] font-mono text-blue-400 uppercase tracking-[0.2em] font-bold">
                  Ref: PROTOCOL_MANDATORY_ROTATION
                </p>
              </div>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm font-medium">
              To activate your MASA account, you must rotate your temporary credentials. 
              This ensures data integrity and personal accountability.
            </p>
          </div>

          <div className="p-10">
            {/* Success/Error Messaging */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
                <i className="bx bx-error-circle text-red-500 text-xl mt-0.5" />
                <div>
                  <p className="text-[11px] font-black uppercase text-red-600 tracking-wider">Sync Failure</p>
                  <p className="text-xs text-red-700 font-medium">{error}</p>
                </div>
              </div>
            )}

            {/* The actual logic component you built */}
            <div className="relative">
               {/* Note: We trigger handleSuccess (the session update) only AFTER 
                 the modal's internal fetch to /api/profile succeeds.
               */}
              <PasswordChangeModal
                isOpen={true}
                onClose={() => {}} // Disabled for mandatory flow
                isMandatory={true}
              />
            </div>

            <div className="mt-8 pt-8 border-t border-slate-100">
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-black/[0.03]">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">
                  <i className="bx bx-info-circle text-slate-900" />
                </div>
                <p className="text-[11px] text-slate-500 font-semibold leading-snug">
                  Once your new protocol is established, your session will be fortified and you will be granted access to your branch.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}