// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";
import { PAGE_PERMISSIONS, MANAGEMENT_ROUTES, PERSONAL_ROUTES } from "@/lib/security";

/**
 * Production-ready middleware that:
 * - Protects dashboard routes for authenticated users only
 * - Prevents signed-in users from visiting auth pages or the public root "/"
 * - Allows signed-in users to access only the password-reset flow when forced
 * - Preserves NextAuth API routes and static/public assets
 * - Emits lightweight, non-blocking security logs
 */

/* ---------------------------
   Configuration
   --------------------------- */
const PUBLIC_PATHS = [
  "/favicon.ico",
  "/robots.txt",
  "/manifest.json",
  "/_next",
  "/static",
  "/assets",
];

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const DB_UPDATE_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

/* ---------------------------
   Helper: non-blocking logger
   --------------------------- */
function logSecurityEvent(origin: string, action: string, meta: Record<string, unknown>) {
  // Fire-and-forget; never block middleware
  fetch(`${origin}/api/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...meta, timestamp: new Date().toISOString() }),
  }).catch(() => {
    /* intentionally silent */
  });
}

/* ---------------------------
   Core proxy logic
   --------------------------- */
export async function proxy(req: NextRequest) {
  const { pathname, origin } = req.nextUrl;

  // 1) Allow public/static assets and API routes
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth")) return NextResponse.next();

  // 2) Always allow NextAuth API endpoints (session, providers, signIn/out)
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/_next/static")) {
    return NextResponse.next();
  }

  // 3) Allow unauthenticated access to auth pages (so sign-in, register, support work)
  //    but we will redirect signed-in users away from these pages below.
  const isAuthPage = pathname === "/auth" || pathname.startsWith("/auth/");

  // 4) Resolve session token (JWT)
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  const now = Date.now();
  const lastActivity = Number(token?.lastActivityAt || 0);
  const isInactive = lastActivity && now - lastActivity > INACTIVITY_TIMEOUT_MS;

  // 5) Signed-out user trying to access protected dashboard/management pages
  const isDashboardPath = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  if (!token?.id) {
    // Allow public root and auth pages
    if (isAuthPage || pathname === "/" || pathname === "/auth" || pathname === "/") {
      return NextResponse.next();
    }

    // Allow personal/public pages that are not protected
    if (!isDashboardPath) return NextResponse.next();

    // Redirect to sign-in with callback for dashboard access
    const signInUrl = new URL("/auth/signin", origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    logSecurityEvent(origin, "UNAUTHENTICATED_REDIRECT", { path: pathname });
    return NextResponse.redirect(signInUrl);
  }

  // 6) Token exists — perform session checks
  // If token indicates disabled/locked/expired/inactive, force sign-in
  const needsSignIn =
    token.disabled ||
    token.locked ||
    token.expired ||
    isInactive;

  if (needsSignIn) {
    const url = new URL("/auth/signin", origin);
    const errorType = token.disabled ? "disabled" : token.locked ? "locked" : "SessionExpired";
    url.searchParams.set("error", errorType);
    logSecurityEvent(origin, `SESSION_${errorType.toUpperCase()}`, {
      personnelId: token.id as string,
      path: pathname,
    });
    return NextResponse.redirect(url);
  }

  // 7) Force password change: allow only the reset-password page (and signout)
  if (token.requiresPasswordChange) {
    // Allow the reset-password UI and signout endpoint
    if (pathname === "/auth/reset-password" || pathname === "/auth/signout" || pathname.startsWith("/api/auth")) {
      return NextResponse.next();
    }

    // Redirect to reset-password if user tries to navigate elsewhere
    logSecurityEvent(origin, "FORCE_PASSWORD_CHANGE_REDIRECT", {
      personnelId: token.id as string,
      attemptedPath: pathname,
    });
    return NextResponse.redirect(new URL("/auth/reset-password", origin));
  }

  // 8) Signed-in users must not visit auth pages or the public root
  //    (they should remain inside the dashboard unless explicitly signing out)
  const allowAuthWhileSignedIn = ["/auth/signout"]; // allow explicit signout
  if ((isAuthPage || pathname === "/") && !allowAuthWhileSignedIn.includes(pathname)) {
    // If already on dashboard, allow
    if (isDashboardPath) return NextResponse.next();

    // Prevent loops: if user is already on /auth/signin and token exists, redirect to dashboard
    logSecurityEvent(origin, "SIGNED_IN_VISIT_AUTH_REDIRECT", {
      personnelId: token.id as string,
      attemptedPath: pathname,
    });
    return NextResponse.redirect(new URL("/dashboard", origin));
  }

  // 9) Role-based quick checks
  const role = token.role as Role | undefined;
  if (!role) {
    // No role — force sign-in to re-evaluate session
    logSecurityEvent(origin, "MISSING_ROLE", { personnelId: token.id as string, path: pathname });
    return NextResponse.redirect(new URL("/auth/signin", origin));
  }

  // Block DEV role from production dashboard UI
  if (role === Role.DEV) {
    return NextResponse.redirect(new URL("/feedback/access-denied", origin));
  }

  // Organization owners and admins have broad access
  if (token.isOrgOwner || role === Role.ADMIN) {
    // allow everything under dashboard and management
    return NextResponse.next();
  }

  // Allow personal routes (profile, settings)
  if (PERSONAL_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Protect management routes from non-admins
  if (MANAGEMENT_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL("/feedback/access-denied", origin));
  }

  // Page-level permission mapping
  const pageEntry = Object.entries(PAGE_PERMISSIONS).find(
    ([path]) => pathname === path || pathname.startsWith(`${path}/`)
  );
  if (pageEntry && !(pageEntry[1] as readonly Role[]).includes(role)) {
    return NextResponse.redirect(new URL("/feedback/access-denied", origin));
  }

  // Ghost route protection: prevent signed-in users from accessing unknown dashboard routes
  if (isDashboardPath) {
    const knownRoutes = [
      ...Object.keys(PAGE_PERMISSIONS),
      ...MANAGEMENT_ROUTES,
      ...PERSONAL_ROUTES,
      "/dashboard",
    ];
    const isKnown = knownRoutes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!isKnown) {
      return NextResponse.redirect(new URL("/feedback/access-denied", origin));
    }
  }

  // 10) Throttled heartbeat logging (non-blocking)
  if (token.id && now - lastActivity > DB_UPDATE_THROTTLE_MS) {
    logSecurityEvent(origin, "LAST_ACTIVITY_HEARTBEAT", {
      personnelId: token.id as string,
      organizationId: token.organizationId as string,
      branchId: token.branchId as string,
    });
  }

  // Default: allow
  return NextResponse.next();
}

/* ---------------------------
   Middleware entrypoint
   --------------------------- */
export default async function middleware(req: NextRequest) {
  return proxy(req);
}

/* ---------------------------
   Matcher configuration
   - Protect root, dashboard and auth UI routes
   - Allow other public pages to function normally
   --------------------------- */
export const config = {
  matcher: [
    "/", // ensure root is evaluated so signed-in users are redirected to /dashboard
    "/dashboard/:path*",
    "/auth/:path*",
    "/api/auth/:path*",
  ],
};
