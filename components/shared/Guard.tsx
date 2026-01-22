"use client";

import { ReactNode, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/feedback/ToastProvider";

export type Role = "USER" | "MANAGER" | "SALES" | "INVENTORY" | "CASHIER" | "ADMIN" | "DEV";

interface RoleGuardProps {
  allowedRoles: Role | Role[];
  children: ReactNode;
  fallbackPath?: string; // optional redirect path
}

export default function RoleGuard({
  allowedRoles,
  children,
  fallbackPath = "/auth/signin",
}: RoleGuardProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { addToast } = useToast();

  const userRole = session?.user?.role as Role | undefined;

  // normalize allowedRoles to an array
  const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  // Check if user role is allowed
  const isAuthorized = status !== "loading" && userRole && rolesArray.includes(userRole);

  useEffect(() => {
    if (status === "loading") return;

    if (!userRole || !isAuthorized) {
      // Show toast for unauthorized access
      addToast({
        message: "Unauthorized access – please sign in",
        type: "error",
        duration: 3000,
      });

      router.push(fallbackPath);
    }
  }, [status, userRole, isAuthorized, router, fallbackPath, addToast]);

  // prevent flashing UI
  if (status === "loading" || !isAuthorized) return null;

  return <>{children}</>;
}
