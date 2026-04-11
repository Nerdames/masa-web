import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { getToken } from "next-auth/jwt";
import { hasPagePermission } from "@/core/lib/permission";

/* -------------------------------------------------- */
/* CONFIGURATION & CONSTANTS                          */
/* -------------------------------------------------- */

const AUTH_ROUTES = ["/signin", "/register", "/reset-password", "/welcome"];

// STRICT BYPASS: Replaced dangerous Regex with exact path matching
const STATIC_PREFIXES = [
  "/_next", 
  "/favicon.ico", 
  "/vercel.svg",
  "/images", 
  "/assets", 
  "/public"
];

// Explicitly define public APIs that don't need token extraction
const PUBLIC_API_ROUTES = ["/api/auth", "/api/logs", "/api/webhooks"];

/* -------------------------------------------------- */
/* HELPERS                                            */
/* -------------------------------------------------- */

/**
 * Hardened Content-Aware Unauthorized Handler
 */
function handleUnauthorized(req: NextRequest, destination: string, errorType?: string) {
  const { pathname, origin } = req.nextUrl;

  // 1. Detect if the request expects data rather than HTML
  const isApi = pathname.startsWith("/api/");
  const isRsc = req.headers.get("rsc") === "1" || req.headers.get("x-middleware-prefetch") === "1";
  const isServerAction = req.headers.has("next-action");
  const expectsJson = req.headers.get("accept")?.includes("application/json");

  // Fixes the `<` JSON error by returning proper 401s for data requests
  if (isApi || isServerAction || isRsc || expectsJson) {
    return NextResponse.json(
      { 
        error: errorType || "Unauthenticated", 
        message: "Session expired, invalid, or access denied." 
      },
      { status: 401 }
    );
  }

  // 2. Handle standard browser page navigations
  const url = new URL(destination, origin);
  
  if (destination === "/signin" && pathname !== "/") {
    url.searchParams.set("callbackUrl", pathname);
  }
  if (errorType) {
    url.searchParams.set("error", errorType);
  }

  const response = NextResponse.redirect(url);
  
  // Custom header to signal the client architecture that a force-logout occurred
  if (errorType === "SessionExpired") {
    response.headers.set("x-masa-auth-state", "expired");
  }

  return response;
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
/* MAIN PROXY LOGIC                                   */
/* -------------------------------------------------- */

export async function proxy(req: NextRequest, ev: NextFetchEvent) {
  const { pathname, origin } = req.nextUrl;

  // 1. STRICT BYPASS LOGIC
  const isInternalAction = req.headers.get("x-masa-internal-key") === process.env.INTERNAL_API_KEY;
  const isStaticFile = STATIC_PREFIXES.some(p => pathname.startsWith(p));
  const isPublicApi = PUBLIC_API_ROUTES.some(p => pathname.startsWith(p));

  if (isInternalAction || isStaticFile || isPublicApi) {
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
    if (pathname === "/") return NextResponse.redirect(new URL("/welcome", origin));
    if (isAuthPage) return NextResponse.next();
    
    // Explicitly flag unauthenticated to trigger redirects
    return handleUnauthorized(req, "/signin", "Unauthenticated");
  }

  // 4. ACCOUNT INTEGRITY
  if (token.disabled || token.locked || token.expired) {
    if (isAuthPage) return NextResponse.next();

    const errorCode = token.disabled ? "ACCOUNT_DISABLED" : 
                      token.locked ? "ACCOUNT_LOCKED_ADMIN" : 
                      "SessionExpired";

    logSecurityEvent(ev, origin, `SECURITY_BLOCK_${errorCode}`, {
      personnelId: token.id,
      email: token.email,
      path: pathname,
      ip: req.headers.get("x-forwarded-for") || req.ip || "unknown"
    });

    return handleUnauthorized(req, "/signin", errorCode);
  }

  // 5. MANDATORY PASSWORD ROTATION
  if (token.requiresPasswordChange) {
    // Allow reset action and profile API for updating the password
    if (pathname.startsWith("/reset-password") || pathname === "/api/profile") {
      return NextResponse.next();
    }
    return handleUnauthorized(req, "/reset-password", "PasswordResetRequired");
  }

  // 6. TRAFFIC CONTROLLER HANDOFF
  if (isAuthPage) {
    return NextResponse.redirect(new URL("/", origin));
  }
  if (pathname === "/") {
    return NextResponse.next();
  }

  // 7. RBAC ENGINE (Permission Logic)
  // Note: Cast role to string if Prisma Enum is not available in Edge
  const allowed = hasPagePermission(
    token.role as any, // Bypass edge enum import issues
    pathname,
    Boolean(token.isOrgOwner)
  );

  if (!allowed) {
    logSecurityEvent(ev, origin, "UNAUTHORIZED_ACCESS_ATTEMPT", {
      personnelId: token.id,
      role: token.role,
      path: pathname,
    });

    const siloFallbacks: Record<string, string> = {
      INVENTORY: "/terminal/inventory",
      SALES: "/terminal/pos",
      CASHIER: "/terminal/pos",
      AUDITOR: "/audit",
      DEV: "/terminal/inventory",
      ADMIN: "/admin/overview",
      MANAGER: "/admin/overview",
    };
    
    const fallback = siloFallbacks[token.role as string] || "/";
    if (pathname === fallback) return NextResponse.next(); 

    return handleUnauthorized(req, fallback, "AccessDenied");
  }

  return NextResponse.next();
}