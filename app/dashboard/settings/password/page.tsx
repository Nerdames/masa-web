"use client";

import { useSession } from "next-auth/react";
import PasswordChangeModal from "@/components/modal/PasswordChangeModal";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function PasswordResetPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // If they land here but don't actually need a reset, take them back to dashboard
    if (status === "authenticated" && !session?.user?.requiresPasswordChange) {
      router.push("/dashboard");
    }
  }, [session, status, router]);

  if (status === "loading") return null;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <PasswordChangeModal 
        isOpen={true} 
        onClose={() => router.push("/dashboard")} 
        isMandatory={session?.user?.requiresPasswordChange} 
      />
    </div>
  );
}