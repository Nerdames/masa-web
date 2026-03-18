"use client";

import { useSession } from "next-auth/react";
import PasswordChangeModal from "@/components/modal/PasswordChangeModal";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function PasswordResetPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  useEffect(() => {
    if (status === "authenticated" && !session?.user?.requiresPasswordChange) {
      router.push("/dashboard");
    }
  }, [session, status, router]);

  const handleSuccess = async () => {
    setIsUpdating(true);
    await update({ requiresPasswordChange: false });
    router.push("/dashboard");
  };

  if (status === "loading" || isUpdating) {
    return (
      <div className="min-h-screen bg-[#F4F7F9] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4" />
        <span className="font-mono text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
          Syncing Security State
        </span>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#F4F7F9] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden">
        <div className="bg-slate-900 p-10 text-white">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-2xl">
              <i className="bx bx-shield-quarter animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight">Security Hardening</h1>
              <p className="text-[10px] font-mono text-blue-400 uppercase tracking-widest">Protocol: MANDATORY_CREDENTIAL_UPDATE</p>
            </div>
          </div>
          <p className="text-slate-400 text-sm leading-relaxed max-w-md">
            To maintain MASA security standards, you must rotate your access key before proceeding to the operational dashboard.
          </p>
        </div>

        <div className="p-10">
          <PasswordChangeModal 
            isOpen={true} 
            onClose={() => {}} // Disabled for mandatory flow
            isMandatory={true}
            onSuccess={handleSuccess}
          />
          
          <div className="mt-8 flex items-center gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-100">
            <i className="bx bx-info-circle text-blue-600 text-xl" />
            <p className="text-[11px] text-blue-700 font-bold leading-tight">
              Once updated, your previous session will be terminated and replaced with a new secure token.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}