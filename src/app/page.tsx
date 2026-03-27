import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/core/lib/auth";

export default async function RootPage() {
  const session = await getServerSession(authOptions);

  // If no session, go to welcome
  if (!session) {
    redirect("/welcome");
  }

  // If session exists, redirect to a neutral starting point.
  // The Middleware (proxy.ts) will intercept this and send 
  // them to the correct role-based dashboard.
  redirect("/admin/overview");
}