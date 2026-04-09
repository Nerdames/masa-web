import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";
import { hasPagePermission } from "@/core/lib/permission";

/* -------------------------------------------------- */
/* CONFIGURATION & CONSTANTS */
/* -------------------------------------------------- */

const AUTH_ROUTES = ["/signin", "/register", "/reset-password", "/welcome"];
const BYPASS_PREFIXES = ["/_next", "/api/auth", "/favicon.ico", "/feedback", "/public", "/images", "/assets"];
const PUBLIC_FILE = /\.(.*)$/;

/* -------------------------------------------------- */
/* HELPERS */
/* -------------------------------------------------- */

/**
 * Hardened Unauthorized Handler
 * Ensures API calls receive JSON while browser requests are redirected.
 */
function handleUnauthorized(req: NextRequest, destination: string, error?: string) {
  const { pathname, origin } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: error || "Unauthorized", message: "Session expired or insufficient permissions." },
      { status: 403 }
    );
  }

  const url = new URL(destination, origin);
  if (destination === "/signin") {
    url.searchParams.set("callbackUrl", pathname);
  }
  if (error) {
    url.searchParams.set("error", error);
  }

  return NextResponse.redirect(url);
}

/**
 * PRODUCTION LOGGING
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

  // 1. CRITICAL BYPASS LOGIC
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

  // 4. ACCOUNT INTEGRITY & REVOCATION
  if (token.disabled || token.locked || token.expired) {
    if (pathname === "/signin" || pathname.startsWith("/api/auth")) return NextResponse.next();

    const errorCode = token.expired ? "Verification" : "AccessDenied";
    logSecurityEvent(ev, origin, `SECURITY_BLOCK_${errorCode}`, {
      personnelId: token.id,
      email: token.email,
      path: pathname,
    });

    return handleUnauthorized(req, "/signin", errorCode);
  }

  // 5. MANDATORY PASSWORD ROTATION
  if (token.requiresPasswordChange && !pathname.startsWith("/reset-password")) {
    return handleUnauthorized(req, "/reset-password", "PasswordResetRequired");
  }

  // 6. SILOED LANDING & AUTH PAGE REDIRECTION
  // Maps roles to their primary entry points based on your App Router groups.
  if (isAuthPage || pathname === "/") {
    const roleLanding: Record<Role, string> = {
      [Role.DEV]: "/db-inspector",        // (tools)
      [Role.ADMIN]: "/dashboard",         // (dashboard)
      [Role.MANAGER]: "/dashboard",       // (dashboard)
      [Role.AUDITOR]: "/audit/logs",      // (dashboard)/audit
      [Role.INVENTORY]: "/inventory",     // (terminal)
      [Role.SALES]: "/pos",               // (terminal)
      [Role.CASHIER]: "/pos",             // (terminal)
    };

    const destination = roleLanding[token.role as Role] || "/dashboard";
    return NextResponse.redirect(new URL(destination, origin));
  }

  // 7. RBAC ENGINE (Permission Logic)
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

    // Handle Silo-Specific Fallbacks to avoid "Logout Loops"
    // If a POS user hits a dashboard link, they get bounced back to POS.
    const siloFallbacks: Record<string, string> = {
      [Role.INVENTORY]: "/inventory",
      [Role.SALES]: "/pos",
      [Role.CASHIER]: "/pos",
      [Role.AUDITOR]: "/audit/logs",
      [Role.DEV]: "/db-inspector",
    };
    
    const fallback = siloFallbacks[token.role as string] || "/dashboard";
    return handleUnauthorized(req, fallback, "AccessDenied");
  }

  return NextResponse.next();
}