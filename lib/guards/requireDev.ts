import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Role } from "@/types/enums";

export async function requireDev() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  if (![Role.DEV].includes(session.user.role)) {
    throw new Error("Forbidden: Devs only");
  }

  return session;
}
