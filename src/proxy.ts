import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";
import { hasPagePermission } from "@/core/lib/permission";

/* -------------------------------------------------- */
/* CONFIGURATION & CONSTANTS */
/* -------------------------------------------------- */

const AUTH_ROUTES = ["/signin", "/register", "/reset-password", "/welcome"];
// Expanded to include common asset folders to avoid CSS/styling blockages
const BYPASS_PREFIXES = ["/_next", "/api/auth", "/favicon.ico", "/feedback", "/public", "/images", "/assets"];
const PUBLIC_FILE = /\.(.*)$/;

/* -------------------------------------------------- */
/* HELPERS */
/* -------------------------------------------------- */

/**
 * Hardened Unauthorized Handler
 * Explicitly prevents "undefined" and handles Next.js JSON requests properly.
 */
function handleUnauthorized(req: NextRequest, destination: string, error?: string) {
  const { pathname, origin } = req.nextUrl;

  // If this is an API call or a Next.js data route, returning a redirect string breaks standard fetches.
  // Return a clean 403 JSON payload instead.
  const isDataRequest = req.headers.get("x-nextjs-data") || pathname.startsWith("/_next/data");
  
  if (pathname.startsWith("/api/") || isDataRequest) {
    return NextResponse.json(
      { error: error || "Unauthorized", message: "Session expired or insufficient permissions." },
      { status: 403 }
    );
  }

  const url = new URL(destination, origin);
  
  // Set callback for future redirection
  if (destination === "/signin") {
    url.searchParams.set("callbackUrl", pathname);
  }
  
  // Explicitly set error if provided, preventing null/undefined leaks
  if (error) {
    url.searchParams.set("error", error);
  }

  return NextResponse.redirect(url);
}

/**
 * PRODUCTION LOGGING
 * Uses ev.waitUntil to offload logging to the edge without slowing down the user.
 */
function logSecurityEvent(ev: NextFetchEvent, origin: string, action: string, meta: Record<string, any>) {
  const logPromise = fetch(`${origin}/api/logs`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-masa-internal-key": process.env.INTERNAL_API_KEY || "" 
    },
    body: JSON.stringify({ action, ...meta, timestamp: new Date().toISOString() }),
  }).catch((err) => console.error("[PROXY_LOG_ERROR]", err));

  ev.waitUntil(logPromise);
}

/* -------------------------------------------------- */
/* MAIN PROXY LOGIC */
/* -------------------------------------------------- */

export async function proxy(req: NextRequest, ev: NextFetchEvent) {
  const { pathname, origin } = req.nextUrl;

  // 1. CRITICAL BYPASS LOGIC (Static files & internal routes)
  const isInternalAction = req.headers.get("x-masa-internal-key") === process.env.INTERNAL_API_KEY;
  const isBypassRoute = BYPASS_PREFIXES.some(p => pathname.startsWith(p));
  const isStaticFile = PUBLIC_FILE.test(pathname);

  if (isInternalAction || isBypassRoute || isStaticFile) {
    return NextResponse.next();
  }

  // 2. TOKEN RETRIEVAL
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const isAuthPage = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  // 3. GUEST ACCESS CONTROL
  if (!token) {
    if (isAuthPage || pathname === "/") return NextResponse.next();
    return handleUnauthorized(req, "/signin");
  }

  // 4. ACCOUNT INTEGRITY & MID-SESSION REVOCATION
  // This directly mirrors the flags your authOptions JWT heartbeat will throw.
  if (token.disabled || token.locked || token.expired) {
    if (pathname === "/signin" || pathname.startsWith("/api/auth")) return NextResponse.next();

    let errorCode = "Default";
    if (token.disabled || token.locked) errorCode = "AccessDenied";
    if (token.expired) errorCode = "Verification"; // Points to inactivity or forced expiry

    logSecurityEvent(ev, origin, `SECURITY_BLOCK_${errorCode}`, {
      personnelId: token.id,
      email: token.email,
      path: pathname,
      metadata: { disabled: token.disabled, locked: token.locked, expired: token.expired }
    });

    return handleUnauthorized(req, "/signin", errorCode);
  }

  // 5. MANDATORY PASSWORD ROTATION
  if (token.requiresPasswordChange) {
    const isResetPage = pathname.startsWith("/reset-password");
    // Don't block API calls while on the reset page (so the POST request can complete)
    if (!isResetPage && !pathname.startsWith("/api/")) {
      return NextResponse.redirect(new URL("/reset-password", origin));
    }
  }

  // 6. AUTHENTICATED REDIRECTION (The "Kick-back")
  if (isAuthPage || pathname === "/") {
    if (token.requiresPasswordChange && pathname.startsWith("/reset-password")) {
      return NextResponse.next();
    }

    // Role-Based Home Mapping
    const roleRoutes: Record<string, string> = {
      [Role.CASHIER]: "/pos",
      [Role.SALES]: "/pos",
      [Role.INVENTORY]: "/inventory/products",
      [Role.AUDITOR]: "/audit/logs",
    };

    const destination = roleRoutes[token.role as string] || "/admin/overview";

    if (pathname === destination) return NextResponse.next();
    return NextResponse.redirect(new URL(destination, origin));
  }

  // 7. RBAC ENGINE
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

    return handleUnauthorized(req, "/signin", "AccessDenied");
  }

  // Note: We removed the duplicate heartbeat sync DB update from the proxy.
  // Since your `authOptions` handles the exact same update in the JWT callback (throttled perfectly),
  // handling it here as well caused unnecessary double queries on the DB connection pool.

  return NextResponse.next();
}