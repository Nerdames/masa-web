import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";
import { PAGE_PERMISSIONS, MANAGEMENT_ROUTES, PERSONAL_ROUTES } from "@/lib/security";

/* ------------------------------------------
 * Constants & Configuration
 * ------------------------------------------ */
const PUBLIC_PATHS = [
  "/favicon.ico",
  "/robots.txt",
  "/manifest.json",
  "/_next",
  "/static",
];

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const DB_UPDATE_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

/* ------------------------------------------
 * Security Proxy Logic
 * ------------------------------------------ */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.nextUrl.origin;

  // 1. Allow static/public files
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 2. ✅ CRITICAL FIX: Allow auth pages AND API routes
  // Without /api/auth, NextAuth cannot fetch sessions or providers, causing 404s
  if (pathname.startsWith("/auth") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const now = Date.now();
  const lastActivity = Number(token?.lastActivityAt || 0);

  // 3. Session Validation Logic
  // Check for existence, security flags, manual inactivity, and the new 'expired' flag
  const isInactive = lastActivity && now - lastActivity > INACTIVITY_TIMEOUT_MS;
  const needsSignIn =
    !token?.id ||
    token.disabled ||
    token.locked ||
    token.expired || // Handled by JWT heartbeat logic
    isInactive;

  if (needsSignIn) {
    const url = new URL("/auth/signin", origin);

    if (!token?.id) {
      url.searchParams.set("callbackUrl", pathname);
      // Only log if not heading to signin already to prevent loops
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

  // 4. Force Password Change Logic
  if (token.requiresPasswordChange && pathname !== "/auth/reset-password") {
    logSecurityEvent(origin, "FORCE_PASSWORD_CHANGE_REDIRECT", {
      personnelId: token.id as string,
      path: pathname,
    });
    return NextResponse.redirect(new URL("/auth/reset-password", origin));
  }

  const role = token.role as Role | undefined;
  if (!role) {
    return NextResponse.redirect(new URL("/auth/signin", origin));
  }

  // 5. Throttled Heartbeat Logging
  // Note: Actual DB update happens in the JWT callback; this is for external security monitoring
  if (token.id && now - lastActivity > DB_UPDATE_THROTTLE_MS) {
    logSecurityEvent(origin, "LAST_ACTIVITY_HEARTBEAT", {
      personnelId: token.id as string,
      organizationId: token.organizationId as string,
      branchId: token.branchId as string,
    });
  }

  /* --------------------------------------------------------------------------
   * ROLE-BASED ACCESS CONTROL (RBAC)
   * -------------------------------------------------------------------------- */

  // Organization Owners and Admins have full access
  if (token.isOrgOwner || role === Role.ADMIN) {
    return NextResponse.next();
  }

  // Block DEV role from accessing production dashboard interfaces
  if (role === Role.DEV) {
    return NextResponse.redirect(new URL("/feedback/access-denied", origin));
  }

  // Allow standard Personal routes (Profile, Settings, etc.)
  if (PERSONAL_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Protect Management routes from non-admins
  if (MANAGEMENT_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL("/feedback/access-denied", origin));
  }

  // Specific Permission check based on security config
  const pageEntry = Object.entries(PAGE_PERMISSIONS).find(
    ([path]) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (pageEntry && !(pageEntry[1] as readonly Role[]).includes(role)) {
    return NextResponse.redirect(new URL("/feedback/access-denied", origin));
  }

  // Ghost Route Protection: Prevent access to dashboard routes not defined in config
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
 * Server-side Logging Helper
 */
function logSecurityEvent(origin: string, action: string, meta: Record<string, unknown>) {
  // Uses absolute URL as required by Edge Runtime
  fetch(`${origin}/api/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...meta, timestamp: new Date().toISOString() }),
  }).catch(() => {
    // Fail silently to ensure middleware never blocks the user path
  });
}

/* ------------------------------------------
 * Middleware Matcher
 * ------------------------------------------ */
export const config = {
  // Protect all dashboard and auth-related logic
  matcher: ["/dashboard/:path*", "/auth/:path*", "/api/auth/:path*"], 
};