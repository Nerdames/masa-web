// app/dashboard/settings/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import AccessDenied from "@/components/feedback/AccessDenied";

export default function SettingsPageRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [authorized, setAuthorized] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (status !== "loading") {
      const rolesAllowed = ["DEV", "ADMIN"]; // adjust as needed
      const userRole = session?.user?.role;

      if (!userRole || !rolesAllowed.includes(userRole)) {
        setAuthorized(false);
        return;
      }

      setAuthorized(true);

      // Redirect to default panel if at root
      if (pathname === "/dashboard/settings") {
        setRedirecting(true);
        router.replace("/dashboard/settings/general");
      }
    }
  }, [status, session, pathname, router]);

  // -----------------------------
  // Fallback / Loading UI
  // -----------------------------
  if (status === "loading") {
    return <div className="p-6 text-gray-600">Verifying permissions...</div>;
  }

  if (!authorized) {
    return <AccessDenied />;
  }

  if (redirecting) {
    return <div className="p-6 text-gray-600">Redirecting to your settings panel...</div>;
  }

  // Should never reach here
  return null;
}
