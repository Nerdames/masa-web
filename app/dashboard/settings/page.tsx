"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import AccessDenied from "@/components/feedback/AccessDenied";

const ALLOWED_ROLES = new Set(["DEV", "ADMIN"]);

export default function SettingsPageRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();

  const role = session?.user?.role;
  const authorized = role ? ALLOWED_ROLES.has(role) : false;
  const isSettingsRoot = pathname === "/dashboard/settings";

  useEffect(() => {
    if (status === "authenticated" && authorized && isSettingsRoot) {
      router.replace("/dashboard/settings/general");
    }
  }, [status, authorized, isSettingsRoot, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 text-sm text-gray-500">
        Verifying access…
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <AccessDenied />
      </div>
    );
  }

  if (isSettingsRoot) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 text-sm text-gray-500">
        Redirecting…
      </div>
    );
  }

  return null;
}
