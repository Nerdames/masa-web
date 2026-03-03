import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";

/**
 * Path-based permissions.
 * Most specific paths should come first if there is overlap.
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
    // Prevent redirect loops if they are already on the signin page 
    // (though matcher should handle this, this is a safety fallback)
    if (pathname.startsWith("/auth")) return NextResponse.next();

    const signInUrl = new URL("/auth/signin", origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // 3. Session Integrity & Inactivity Check
  if (!token.id || !token.role) {
    return NextResponse.redirect(new URL("/auth/signin?error=SessionExpired", origin));
  }

  // 4. Global RBAC
  const userRole = token.role as Role;

  // Bypass for Super-Users
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
      return NextResponse.redirect(new URL("/dashboard?error=unauthorized", origin));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth (NextAuth)
     * - auth/* (Login/Register)
     * - feedback/* (Public error/info pages)
     * - _next/static, _next/image, favicon.ico
     */
    "/((?!api/auth|auth|feedback|_next/static|_next/image|favicon.ico).*)",
  ],
};