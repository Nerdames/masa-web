import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";
import { hasPagePermission } from "@/core/lib/permission";

/* -------------------------------------------------- */
/* CONFIGURATION & CONSTANTS */
/* -------------------------------------------------- */

// Routes that should NOT trigger a "kick-back" to dashboard for logged-in users
const AUTH_ROUTES = [
  "/signin",
  "/register",
  "/reset-password",
  "/welcome",
];

// Routes that should never be intercepted by the RBAC engine or Heartbeat
const BYPASS_PREFIXES = ["/_next", "/api/auth", "/favicon.ico", "/feedback"];
const PUBLIC_FILE = /\.(.*)$/;

const DB_UPDATE_THROTTLE_MS = 5 * 60 * 1000; // 5-minute heartbeat sync

/* -------------------------------------------------- */
/* HELPERS */
/* -------------------------------------------------- */

/**
 * Returns a JSON response for API routes or a Redirect for Page routes.
 * Prevents the frontend from getting HTML when it expects JSON.
 */
function handleUnauthorized(req: NextRequest, destination: string, status = 307) {
  const { pathname, origin } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Session expired or insufficient permissions." },
      { status: 403 }
    );
  }
  const url = new URL(destination, origin);
  if (destination === "/signin") url.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(url);
}

/**
 * Fires background requests for security logs.
 * Includes the internal key to bypass middleware recursion.
 */
function logSecurityEvent(
  ev: NextFetchEvent, 
  origin: string, 
  action: string, 
  meta: Record<string, any>
) {
  const logPromise = fetch(`${origin}/api/logs`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-masa-internal-key": process.env.INTERNAL_API_KEY || "" 
    },
    body: JSON.stringify({
      action,
      ...meta,
      timestamp: new Date().toISOString(),
    }),
  }).catch((err) => console.error("[PROXY_LOG_ERROR]", err));

  ev.waitUntil(logPromise);
}

/* -------------------------------------------------- */
/* MAIN PROXY LOGIC */
/* -------------------------------------------------- */

export async function proxy(req: NextRequest, ev: NextFetchEvent) {
  const { pathname, origin } = req.nextUrl;

  // 1. BYPASS LOGIC
  // We check for internal keys first to prevent infinite logging loops
  const isInternalAction = req.headers.get("x-masa-internal-key") === process.env.INTERNAL_API_KEY;
  
  if (
    isInternalAction ||
    BYPASS_PREFIXES.some(p => pathname.startsWith(p)) ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const isAuthPage = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  // 2. GUEST ACCESS CONTROL
  if (!token) {
    if (isAuthPage || pathname === "/") return NextResponse.next();
    return handleUnauthorized(req, "/signin");
  }

  // 3. ACCOUNT INTEGRITY (Disabled / Locked / Expired)
  if (token.disabled || token.locked || token.expired) {
    if (pathname === "/signin") return NextResponse.next();

    const reason = token.disabled ? "ACCOUNT_DISABLED" : token.locked ? "ACCOUNT_LOCKED" : "SessionExpired";
    
    logSecurityEvent(ev, origin, `SECURITY_BLOCK_${reason}`, {
      personnelId: token.id,
      email: token.email,
      path: pathname
    });

    return handleUnauthorized(req, `/signin?error=${reason}`);
  }

  // 4. MANDATORY PASSWORD ROTATION
  if (token.requiresPasswordChange) {
    const isResetPage = pathname.startsWith("/reset-password");
    if (!isResetPage && !pathname.startsWith("/api/")) {
      return NextResponse.redirect(new URL("/reset-password", origin));
    }
  }

  // 5. AUTHENTICATED REDIRECTION (Preventing Sign-in access while logged in)
  if (isAuthPage || pathname === "/") {
    // If they are on reset-password because they HAVE to be, let them stay
    if (token.requiresPasswordChange && pathname.startsWith("/reset-password")) {
      return NextResponse.next();
    }

    let destination = "/admin/overview"; 
    if (token.role === Role.CASHIER || token.role === Role.SALES) {
      destination = "/pos"; 
    } else if (token.role === Role.INVENTORY) {
      destination = "/inventory/products"; 
    } else if (token.role === Role.AUDITOR) {
      destination = "/audit/logs";
    }

    // Anti-loop check: only redirect if the destination is different from current path
    if (pathname === destination) return NextResponse.next();
    return NextResponse.redirect(new URL(destination, origin));
  }

  // 6. RBAC ENGINE (Permissions)
  const allowed = hasPagePermission(
    token.role as Role,
    pathname,
    Boolean(token.isOrgOwner)
  );

  if (!allowed) {
    // For API calls, return 403. For Pages, redirect to access-denied.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden", message: "Role-based access denied." }, { status: 403 });
    }
    
    logSecurityEvent(ev, origin, "UNAUTHORIZED_ACCESS_ATTEMPT", {
      personnelId: token.id,
      role: token.role,
      path: pathname,
    });

    return NextResponse.redirect(new URL("/feedback/access-denied", origin));
  }

  // 7. HEARTBEAT SYNC
  const now = Date.now();
  const lastActivity = Number(token.lastActivityAt || 0);

  // Don't sync for the log route itself or notifications to avoid spam
  const isLowPriority = ["/api/notifications", "/api/logs"].some(p => pathname.startsWith(p));

  if (!isLowPriority && (now - lastActivity > DB_UPDATE_THROTTLE_MS)) {
    logSecurityEvent(ev, origin, "HEARTBEAT_SYNC", {
      personnelId: token.id,
      path: pathname
    });
  }

  return NextResponse.next();
}