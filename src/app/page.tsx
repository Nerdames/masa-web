import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/core/lib/auth";
import OperationsHub from "@/core/components/layout/OperationsHub";
import { Role } from "@prisma/client";

export default async function RootPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/welcome");
  }

  const role = session.user.role as Role;

  // --- AUTOMATIC REDIRECTS FOR SPECIFIC ROLES ---
  // If they aren't leadership, don't show the hub, just send them to work.
  switch (role) {
    case "CASHIER":
      redirect("/terminal/pos");
    case "INVENTORY":
      redirect("/terminal/inventory");
    case "AUDITOR":
      redirect("/audit");
    // Add other specific role redirects here
  }

  // --- LEADERSHIP PORTAL ---
  // ADMIN, MANAGER, and ORG_OWNER stay here to see the "Operations Hub"
  return <OperationsHub session={session} />;
}