import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";

/**
 * Path-based permissions.
 */
const ROLE_PERMISSIONS: Record<string, Role[]> = {
  "/dashboard/settings/organization": [Role.ADMIN, Role.DEV],
  "/dashboard/approvals": [Role.ADMIN, Role.DEV],
  "/dashboard/inventory": [Role.ADMIN, Role.DEV, Role.MANAGER, Role.INVENTORY],
  "/dashboard/sales": [Role.ADMIN, Role.DEV, Role.MANAGER, Role.SALES, Role.CASHIER],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.nextUrl.origin;

  // 1. Get Decrypted Token
  const token = await getToken({ req });

  // 2. Handle Unauthenticated Users
  if (!token) {
    if (pathname.startsWith("/auth")) return NextResponse.next();

    const signInUrl = new URL("/auth/signin", origin);
    // Crucial: Always set callbackUrl so the user is redirected back after login
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // 3. Session Integrity & Inactivity Check
  // If the token exists but is missing data, redirect with a specific param
  if (!token.id || !token.role) {
    const sessionErrorUrl = new URL("/auth/signin", origin);
    sessionErrorUrl.searchParams.set("error", "SessionRequired"); // Use a standard string
    sessionErrorUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(sessionErrorUrl);
  }

  // 4. Global RBAC
  const userRole = token.role as Role;

  // Bypass for Super-Users (Org Owners or Developers)
  if (token.isOrgOwner || userRole === Role.DEV) {
    return NextResponse.next();
  }

  // 5. Route-Specific Protection
  const permissionEntry = Object.entries(ROLE_PERMISSIONS).find(([path]) => 
    pathname.startsWith(path)
  );

  if (permissionEntry) {
    const requiredRoles = permissionEntry[1];
    if (!requiredRoles.includes(userRole)) {
      // Redirect to a neutral dashboard page if unauthorized
      return NextResponse.redirect(new URL("feedback/access-denied", origin));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and auth internals
     */
    "/((?!api/auth|auth|feedback|_next/static|_next/image|favicon.ico).*)",
  ],
};