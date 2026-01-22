import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Role } from "@/types/enums";

export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  if (![Role.ADMIN].includes(session.user.role)) {
    throw new Error("Forbidden: Admins only");
  }

  return session;
}
