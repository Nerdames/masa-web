// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@/types/enums";

const ALLOWED_ROLES = new Set<Role>(["DEV", "ADMIN", "MANAGER", "SALES", "INVENTORY", "CASHIER"]); // Adjust roles as needed

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect /dashboard routes
  if (pathname.startsWith("/dashboard")) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    // If no token (not logged in) → redirect to signin
    if (!token) {
      return NextResponse.redirect(new URL("/auth/signin", req.url));
    }

    // If token exists but role is not allowed → redirect to Unauthorized page
    if (!token.role || !ALLOWED_ROLES.has(token.role as Role)) {
      return NextResponse.redirect(new URL("/feedback/unauthorized", req.url));
    }

    // Inactivity timeout: check lastActivityAt
    const now = Date.now();
    const lastActivity = token.lastActivityAt ?? 0;
    const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

    if (now - lastActivity > INACTIVITY_TIMEOUT_MS) {
      // Invalidate session → redirect to signin
      return NextResponse.redirect(new URL("/auth/signin", req.url));
    }
  }

  return NextResponse.next();
}

// Apply middleware to all /dashboard pages
export const config = {
  matcher: ["/dashboard/:path*"],
};