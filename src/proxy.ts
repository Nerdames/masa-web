import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";
import { hasPagePermission } from "@/core/lib/permission";

/* -------------------------------------------------- */
/* CONFIGURATION */
/* -------------------------------------------------- */

const AUTH_ROUTES = [
  "/signin",
  "/register",
  "/reset-password",
  "/error",
  "/support",
  "/welcome",
];

// Routes that don't require high-frequency activity tracking
const LOW_PRIORITY_ROUTES = ["/api/notifications", "/api/logs"];

const PUBLIC_FILE = /\.(.*)$/;
const DB_UPDATE_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

/* -------------------------------------------------- */
/* EDGE-SAFE LOGGING */
/* -------------------------------------------------- */

/**
 * Ensures security logs and heartbeats are recorded even if the 
 * middleware finishes executing before the fetch returns.
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
/* MAIN PROXY ENGINE */
/* -------------------------------------------------- */

export async function proxy(req: NextRequest, ev: NextFetchEvent) {
  const { pathname, origin } = req.nextUrl;

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  /**
   * 1. BYPASS SYSTEM & STATIC ASSETS
   */
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const isAuthPage = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  /**
   * 2. GUEST ACCESS CONTROL
   */
  if (!token) {
    if (isAuthPage || pathname === "/") {
      return NextResponse.next();
    }

    const url = new URL("/signin", origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  /**
   * 3. ACCOUNT INTEGRITY CHECKS
   */
  if (token.disabled || token.locked || token.expired) {
    if (isAuthPage) return NextResponse.next();

    const reason = token.disabled ? "disabled" : token.locked ? "locked" : "SessionExpired";
    const url = new URL("/signin", origin);
    url.searchParams.set("error", reason);

    logSecurityEvent(ev, origin, `SECURITY_BLOCK_${reason.toUpperCase()}`, {
      personnelId: token.id,
      email: token.email
    });

    return NextResponse.redirect(url);
  }

  /**
   * 4. MANDATORY PASSWORD RESET
   */
  if (token.requiresPasswordChange && !pathname.startsWith("/reset-password")) {
    return NextResponse.redirect(new URL("/reset-password", origin));
  }

  /**
   * 5. LOGGED-IN REDIRECTION (Redirect away from Auth/Landing)
   */
  if (isAuthPage || pathname === "/") {
    let destination = "/admin/dashboard"; // Default for ADMIN/DEV

    // Operational Role Mapping based on your folder structure
    if (token.role === Role.CASHIER || token.role === Role.SALES) {
      destination = "/pos"; 
    } else if (token.role === Role.INVENTORY) {
      destination = "/inventory"; // Points to (terminal)/inventory
    } else if (token.role === Role.AUDITOR) {
      destination = "/audit/logs";
    }

    return NextResponse.redirect(new URL(destination, origin));
  }

  /**
   * 6. RBAC ENGINE (Permission Guard)
   */
  const allowed = hasPagePermission(
    token.role as Role,
    pathname,
    Boolean(token.isOrgOwner)
  );

  if (!allowed) {
    logSecurityEvent(ev, origin, "UNAUTHORIZED_ACCESS_ATTEMPT", {
      personnelId: token.id,
      role: token.role,
      path: pathname,
    });

    return NextResponse.redirect(new URL("/feedback/access-denied", origin));
  }

  /**
   * 7. ANALYTICS & HEARTBEAT
   * Updates user "Last Active" timestamp in DB via background fetch
   */
  const now = Date.now();
  const lastActivity = Number(token.lastActivityAt || 0);

  if (
    !LOW_PRIORITY_ROUTES.includes(pathname) && 
    (now - lastActivity > DB_UPDATE_THROTTLE_MS)
  ) {
    logSecurityEvent(ev, origin, "HEARTBEAT", {
      personnelId: token.id,
      path: pathname
    });
  }

  return NextResponse.next();
}