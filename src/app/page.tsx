import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/core/lib/auth";
import OperationsHub from "@/core/components/layout/OperationsHub";
import { Role } from "@prisma/client";

export default async function RootPage() {
  const session = await getServerSession(authOptions);

  // 1. If no session, go to public welcome page
  if (!session) {
    redirect("/welcome");
  }

  const role = session.user.role as Role;

  // 2. Role-based routing
  // Using return redirect() ensures execution stops immediately.
  if (role === Role.CASHIER) return redirect("/pos");
  if (role === Role.INVENTORY) return redirect("/inventory");
  if (role === Role.AUDITOR) return redirect("/audit");

  // 3. LEADERSHIP PORTAL
  // Fallback for ADMIN, MANAGER, DEV, etc.
  return <OperationsHub session={session} />;
}