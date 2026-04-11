import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { getToken } from "next-auth/jwt";
import { hasPagePermission } from "@/core/lib/permission";

/* -------------------------------------------------- */
/* CONFIGURATION & CONSTANTS                          */
/* -------------------------------------------------- */

const AUTH_ROUTES = ["/signin", "/register", "/reset-password", "/welcome"];

const STATIC_PREFIXES = [
  "/_next", 
  "/favicon.ico", 
  "/vercel.svg",
  "/images", 
  "/assets", 
  "/public"
];

// NEXT-AUTH INTERNAL: Must be public to allow session checks and login
const PUBLIC_API_ROUTES = ["/api/auth", "/api/logs", "/api/webhooks"];

/* -------------------------------------------------- */
/* HELPERS                                            */
/* -------------------------------------------------- */

/**
 * Hardened Content-Aware Unauthorized Handler
 * FIXES: "Unexpected token <" by detecting data requests and returning 401 JSON
 */
function handleUnauthorized(req: NextRequest, destination: string, errorType?: string) {
  const { pathname, origin } = req.nextUrl;

  // Detect if the request expects data (JSON, RSC, or Prefetch) rather than HTML
  const isApi = pathname.startsWith("/api/");
  const isRsc = req.headers.get("rsc") === "1";
  const isPrefetch = req.headers.get("x-middleware-prefetch") === "1" || req.headers.get("x-nextjs-data") !== null;
  const isServerAction = req.headers.has("next-action");
  const expectsJson = req.headers.get("accept")?.includes("application/json");

  // If it's a data request, return a clean 401. This prevents the browser from 
  // trying to parse the Sign-in page HTML as JSON data.
  if (isApi || isServerAction || isRsc || isPrefetch || expectsJson) {
    return new NextResponse(
      JSON.stringify({ 
        error: errorType || "Unauthenticated", 
        message: "Session required. Please sign in." 
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Handle standard browser page navigations
  const url = new URL(destination, origin);
  
  if (destination === "/signin" && pathname !== "/" && pathname !== "/welcome") {
    url.searchParams.set("callbackUrl", pathname);
  }
  if (errorType) {
    url.searchParams.set("error", errorType);
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
/* MAIN PROXY LOGIC                                   */
/* -------------------------------------------------- */

export async function proxy(req: NextRequest, ev: NextFetchEvent) {
  const { pathname, origin } = req.nextUrl;

  // 1. STRICT BYPASS LOGIC (Public assets and Auth APIs)
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

  // 3. MANDATORY REDIRECT FOR UNKNOWN USERS
  if (!token) {
    if (isAuthPage) return NextResponse.next();
    
    // Safety Force: Redirect root "/" and all protected pages to signin
    return handleUnauthorized(req, "/signin", "Unauthenticated");
  }

  // 4. ACCOUNT INTEGRITY (Disabled/Locked/Expired)
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
    if (pathname.startsWith("/reset-password") || pathname === "/api/profile") {
      return NextResponse.next();
    }
    return handleUnauthorized(req, "/reset-password", "PasswordResetRequired");
  }

  // 6. TRAFFIC CONTROLLER (LoggedIn users cannot see signin page)
  if (isAuthPage) {
    return NextResponse.redirect(new URL("/", origin));
  }

  // 7. RBAC ENGINE (Permission Logic)
  const allowed = hasPagePermission(
    token.role as any, 
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