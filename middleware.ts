import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Use a Set for O(1) lookup performance
const ALLOWED_ROLES = new Set<string>([
  "DEV", 
  "ADMIN", 
  "MANAGER", 
  "SALES", 
  "INVENTORY", 
  "CASHIER"
]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Get the token (NextAuth handles decryption using NEXTAUTH_SECRET automatically)
  const token = await getToken({ req });

  // 2. Handle Unauthenticated users
  if (!token) {
    const signInUrl = new URL("/auth/signin", req.url);
    // Store the current path to redirect back after login
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // 3. Handle Inactivity (Synced with your authOptions logic)
  // If authOptions returned {} due to inactivity, token.id will be missing here.
  if (!token.id || !token.role) {
    return NextResponse.redirect(new URL("/auth/signin?error=SessionExpired", req.url));
  }

  // 4. Role-Based Access Control (RBAC)
  if (!ALLOWED_ROLES.has(token.role as string)) {
    return NextResponse.redirect(new URL("/feedback/unauthorized", req.url));
  }

  // 5. Allow the request to proceed
  return NextResponse.next();
}

// Optimization: Use the matcher to filter requests BEFORE the middleware runs.
// This prevents the middleware from running on images, scripts, or static files.
export const config = {
  matcher: [
    /*
     * Match all paths starting with /dashboard
     * Match all paths starting with /api/dashboard (if you want to protect APIs here too)
     */
    "/dashboard/:path*",
    "/api/dashboard/:path*", 
  ],
};