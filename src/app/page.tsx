/**
 * C:\Users\chibu\Projects\Next\masa\src\app\page.tsx
 * MASA ROOT CONTROLLER
 * Ensures strict redirection for unauthenticated users, checks security state 
 * heartbeats, and provides role-based silo dispatching.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/config";
import AdminOverview from "@/shared/components/layout/AdminOverview";
import Sidebar from "@/shared/components/layout/Sidebar";
import { Role } from "@prisma/client";

export default async function RootPage() {
  const session = await getServerSession(authOptions);

  // 1. AUTHENTICATION LOCK
  if (!session || !session.user) {
    return redirect("/signin");
  }

  // 2. HARDENED SECURITY LIFECYCLE CHECKS
  // Force accounts flagged as expired, disabled, or locked during session syncs out immediately
  if (session.user.expired || session.user.disabled || session.user.locked) {
    return redirect("/signin?error=AccountLocked");
  }

  // Force mandatory credential rotation before allowing terminal access
  if (session.user.requiresPasswordChange) {
    return redirect("/reset-password");
  }

  // 3. ROLE-BASED TRAFFIC SILOING
  const role = session.user.role as Role;

  switch (role) {
    case Role.CASHIER:
    case Role.SALES:
      return redirect("/pos");

    case Role.INVENTORY:
      return redirect("/inventory");

    case Role.AUDITOR:
      return redirect("/audit");

    // LEADERSHIP PORTAL (ADMIN, MANAGER, DEV, etc.)
    default:
      return (
        <div className="flex h-full">
          <Sidebar />
          <main className="flex-1 p-6">
            <AdminOverview />
          </main>
        </div>
      );
  }
}