import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";
import { PAGE_PERMISSIONS, MANAGEMENT_ROUTES, PERSONAL_ROUTES } from "@/lib/security";

const PUBLIC_PATHS = [
  "/favicon.ico",
  "/robots.txt",
  "/manifest.json",
  "/_next",
  "/static",
];

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const DB_UPDATE_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.nextUrl.origin;

  // 1. Allow static/public files
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 2. ✅ CRITICAL: allow auth routes without session check
  // This includes your reset-password page if it lives under /auth
  if (pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const now = Date.now();
  const lastActivity = Number(token?.lastActivityAt || 0);

  // 3. Basic Session & Status Validation
  const needsSignIn =
    !token?.id ||
    token.disabled ||
    token.locked ||
    (lastActivity && now - lastActivity > INACTIVITY_TIMEOUT_MS);

  if (needsSignIn) {
    const url = new URL("/auth/signin", origin);

    if (!token?.id) {
      url.searchParams.set("callbackUrl", pathname);
      logSecurityEvent(origin, "SESSION_INVALID_NO_TOKEN", { path: pathname });
    } else {
      const errorType = token.disabled
        ? "disabled"
        : token.locked
        ? "locked"
        : "SessionExpired";

      url.searchParams.set("error", errorType);
      logSecurityEvent(origin, `SESSION_${errorType.toUpperCase()}`, { 
        path: pathname,
        personnelId: token.id as string,
        organizationId: token.organizationId as string,
      });
    }

    return NextResponse.redirect(url);
  }

  // 4. ✅ NEW: Force Password Change Logic
  // If the token flag is set, redirect to the reset page
  if (token.requiresPasswordChange) {
    // Only redirect if they aren't already heading to the reset page
    if (pathname !== "/auth/reset-password") {
      logSecurityEvent(origin, "FORCE_PASSWORD_CHANGE_REDIRECT", {
        personnelId: token.id as string,
        path: pathname,
      });
      return NextResponse.redirect(new URL("/auth/reset-password", origin));
    }
  }

  const role = token.role as Role | undefined;

  if (!role) {
    return NextResponse.redirect(new URL("/auth/signin", origin));
  }

  // 5. Update activity periodically (Throttled)
  if (token.id && now - lastActivity > DB_UPDATE_THROTTLE_MS) {
    logSecurityEvent(origin, "LAST_ACTIVITY_UPDATE", {
      personnelId: token.id as string,
      organizationId: token.organizationId as string,
      branchId: token.branchId as string,
    });
  }

  /* --------------------------------------------------------------------------
   * ROLE-BASED ACCESS CONTROL (RBAC)
   * -------------------------------------------------------------------------- */

  // Super access
  if (token.isOrgOwner || role === Role.ADMIN) {
    return NextResponse.next();
  }

  // DEV role blocked from dashboard
  if (role === Role.DEV) {
    return NextResponse.redirect(new URL("/feedback/access-denied", origin));
  }

  // Personal routes allowed
  if (PERSONAL_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Management routes blocked for non-admins
  if (MANAGEMENT_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL("/feedback/access-denied", origin));
  }

  // Specific Page permissions check
  const pageEntry = Object.entries(PAGE_PERMISSIONS).find(
    ([path]) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (pageEntry && !(pageEntry[1] as readonly Role[]).includes(role)) {
    return NextResponse.redirect(new URL("/feedback/access-denied", origin));
  }

  // Prevent unknown dashboard routes (Ghost Route Protection)
  if (pathname.startsWith("/dashboard")) {
    const knownRoutes = [
      ...Object.keys(PAGE_PERMISSIONS),
      ...MANAGEMENT_ROUTES,
      ...PERSONAL_ROUTES,
      "/dashboard",
    ];

    const isKnown = knownRoutes.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    );

    if (!isKnown) {
      return NextResponse.redirect(new URL("/feedback/access-denied", origin));
    }
  }

  return NextResponse.next();
}

/**
 * Helper to keep the proxy logic clean
 */
function logSecurityEvent(origin: string, action: string, meta: Record<string, unknown>) {
  fetch(`${origin}/api/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...meta }),
  }).catch(() => {
    // Silent fail for logs to prevent blocking the user
  });
}

export const config = {
  matcher: ["/dashboard/:path*"], 
};