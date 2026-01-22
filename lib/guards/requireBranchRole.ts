import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Role } from "@/types/enums";

export async function requireBranchRole(...allowedRoles: Role[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  // Checks effective branch role
  if (!allowedRoles.includes(session.user.role)) {
    throw new Error("Forbidden: insufficient branch role");
  }

  return session;
}
