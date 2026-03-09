import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";
import { PAGE_PERMISSIONS, MANAGEMENT_ROUTES, PERSONAL_ROUTES } from "@/lib/rbac";

const PUBLIC_PATHS = ["/favicon.ico", "/robots.txt", "/manifest.json", "/_next", "/static"];
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const DB_UPDATE_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.nextUrl.origin;

  // Skip static/public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Get token from NextAuth JWT
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const now = Date.now();
  const lastActivity = Number(token?.lastActivityAt || 0);

  // Determine if user needs to sign in
  const needsSignIn =
    !token?.id ||
    token.disabled ||
    token.locked ||
    (lastActivity && now - lastActivity > INACTIVITY_TIMEOUT_MS);

  if (needsSignIn) {
    const url = new URL("/auth/signin", origin);

    if (pathname !== "/auth/signin") {
      if (!token?.id) {
        url.searchParams.set("callbackUrl", pathname === "/auth/signin" ? "/dashboard" : pathname);
        // Log unknown session attempt via API
        fetch(`${origin}/api/log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "SESSION_INVALID_NO_TOKEN", meta: { path: pathname } }),
        }).catch(console.error);
      } else {
        const errorType = token.disabled ? "disabled" : token.locked ? "locked" : "SessionExpired";
        url.searchParams.set("error", errorType);
        // Log via API
        fetch(`${origin}/api/log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: `SESSION_${errorType.toUpperCase()}`,
            personnelId: token.id,
            organizationId: token.organizationId,
            branchId: token.branchId,
            meta: { path: pathname },
          }),
        }).catch(console.error);
      }
    }

    return NextResponse.redirect(url);
  }

  const role = token.role as Role;

  // Throttle lastActivityAt updates (call API instead of Prisma directly)
  if (token.id && now - lastActivity > DB_UPDATE_THROTTLE_MS) {
    fetch(`${origin}/api/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "LAST_ACTIVITY_UPDATE",
        personnelId: token.id,
        organizationId: token.organizationId,
        branchId: token.branchId,
      }),
    }).catch(console.error);
  }

  // Super access: Org Owner or Admin
  if (token.isOrgOwner || role === Role.ADMIN) return NextResponse.next();

  // DEV role blocked
  if (role === Role.DEV) return NextResponse.redirect(new URL("/feedback/access-denied", origin));

  // Personal routes allowed
  if (PERSONAL_ROUTES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Management routes blocked
  if (MANAGEMENT_ROUTES.some((p) => pathname.startsWith(p)))
    return NextResponse.redirect(new URL("/feedback/access-denied", origin));

  // Page-level permissions
  const pageEntry = Object.entries(PAGE_PERMISSIONS).find(([path]) => pathname.startsWith(path));
  if (pageEntry && !pageEntry[1].includes(role))
    return NextResponse.redirect(new URL("/feedback/access-denied", origin));

  return NextResponse.next();
}

// Ensure Node runtime is used for compatibility with API logging
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
  // runtime: "edge" <- DO NOT use edge; default Node runtime is fine
};