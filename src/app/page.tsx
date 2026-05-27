import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/core/lib/auth";
import AdminOverview from "@/core/components/layout/AdminOverview";
import Sidebar from "@/core/components/layout/Sidebar";
import { Role } from "@prisma/client";

/**
 * MASA ROOT CONTROLLER
 * Ensures strict redirection for unauthenticated users and 
 * provides role-based silo dispatching.
 */
export default async function RootPage() {
  const session = await getServerSession(authOptions);

  // 1. AUTHENTICATION LOCK
  // If no session exists, force-redirect to the signin page immediately.
  if (!session || !session.user) {
    return redirect("/signin");
  }

  // 2. ROLE-BASED TRAFFIC SILOING
  // Note: Using 'return redirect' ensures the server component stops execution.
  const role = session.user.role as Role;

  switch (role) {
    case Role.CASHIER:
    case Role.SALES:
      return redirect("/pos");

    case Role.INVENTORY:
      return redirect("/inventory");

    case Role.AUDITOR:
      return redirect("/audit");

    // LEADERSHIP PORTAL (Admin, Manager, Dev, etc.)
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