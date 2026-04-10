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
 */
function handleUnauthorized(req: NextRequest, destination: string, error?: string) {
  const { pathname, origin } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: error || "Unauthorized", message: "Insufficient permissions or session invalid." },
      { status: 403 }
    );
  }

  const url = new URL(destination, origin);
  
  // Only set callbackUrl if we are heading to signin
  if (destination === "/signin") {
    url.searchParams.set("callbackUrl", pathname);
  }
  
  // Attach error code for the SignInPage ERROR_MAP to catch
  if (error) {
    url.searchParams.set("error", error);
  }

  return NextResponse.redirect(url);
}

/**
 * FORENSIC SECURITY LOGGING
 */
function logSecurityEvent(ev: NextFetchEvent, origin: string, action: string, meta: Record<string, any>) {
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
      source: "MIDDLEWARE_PROXY"
    }),
  }).catch((err) => console.error("[SECURITY_LOG_FAILURE]", err));

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
    // Let guests hit auth pages or the root (which might have a landing state)
    if (isAuthPage || pathname === "/") return NextResponse.next();
    return handleUnauthorized(req, "/signin");
  }

  // 4. ACCOUNT INTEGRITY (Synchronized with Fortress UI Error Codes)
  if (token.disabled || token.locked || token.expired) {
    if (pathname === "/signin" || pathname.startsWith("/api/auth")) return NextResponse.next();

    // Mapping token flags to frontend ERROR_MAP keys
    const errorCode = token.disabled ? "ACCOUNT_DISABLED" : 
                     token.locked ? "ACCOUNT_LOCKED_ADMIN" : 
                     "SessionExpired";

    logSecurityEvent(ev, origin, `SECURITY_BLOCK_${errorCode}`, {
      personnelId: token.id,
      email: token.email,
      path: pathname,
      ip: req.ip || "unknown"
    });

    return handleUnauthorized(req, "/signin", errorCode);
  }

  // 5. MANDATORY PASSWORD ROTATION
  if (token.requiresPasswordChange && !pathname.startsWith("/reset-password")) {
    return handleUnauthorized(req, "/reset-password", "PasswordResetRequired");
  }

  // 6. TRAFFIC CONTROLLER HANDOFF
  // If user is logged in and hits /signin, send them to root.
  if (isAuthPage) {
    return NextResponse.redirect(new URL("/", origin));
  }

  // If user hits root, let the Server Component page.tsx handle the role-sorting.
  if (pathname === "/") {
    return NextResponse.next();
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

    // Handle Silo-Specific Fallbacks to keep users in their environment
    const siloFallbacks: Record<string, string> = {
      [Role.INVENTORY]: "/terminal/inventory",
      [Role.SALES]: "/terminal/pos",
      [Role.CASHIER]: "/terminal/pos",
      [Role.AUDITOR]: "/dashboard/audit/logs",
      [Role.DEV]: "/db-inspector",
      [Role.ADMIN]: "/admin/overview",
      [Role.MANAGER]: "/admin/overview",
    };
    
    const fallback = siloFallbacks[token.role as string] || "/admin/overview";
    
    // If they are already on their fallback and still failing, bounce to root
    const finalDestination = pathname === fallback ? "/" : fallback;
    return handleUnauthorized(req, finalDestination, "AccessDenied");
  }

  return NextResponse.next();
}