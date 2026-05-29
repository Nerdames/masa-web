import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { getToken } from "next-auth/jwt";
// FIX 1: MUST use 'import type' to prevent Next.js Edge Runtime from crashing.
import type { Role } from "@prisma/client";

/**
 * Enhanced Token interface synchronized with src/core/lib/auth.ts token schema
 */
interface MasaToken {
  id: string;
  role: Role;
  organizationId: string;
  requiresPasswordChange: boolean;
  disabled?: boolean;
  locked?: boolean;
  expired?: boolean;
}

/* -------------------------------------------------- */
/* CONFIGURATION                                      */
/* -------------------------------------------------- */

// STRATEGY A: Removed "/reset-password" so active sessions can execute password rotation.
const AUTH_ROUTES = ["/signin", "/register", "/welcome"];
// FIXED: Removed non-existent "/status" route to keep public matching strict.
const PUBLIC_ROUTES = ["/error", "/support"];
const STATIC_PREFIXES = ["/_next", "/favicon.ico", "/images", "/assets", "/public"];
// FORTIFIED: Ensure exact API routes are matched to prevent trailing slash bypass
const PUBLIC_API_ROUTES = ["/api/auth", "/api/logs", "/api/webhooks", "/api/register"];

/* -------------------------------------------------- */
/* UTILITIES                                          */
/* -------------------------------------------------- */

// FORTIFIED: Use exact matching or explicit path segment checks to block substring bypass bugs
const matchRoute = (path: string, routes: string[]) => 
  routes.some((r) => path === r || path.startsWith(r + "/"));

const isAuthRoute = (path: string) => matchRoute(path, AUTH_ROUTES);
const isPublicRoute = (path: string) => matchRoute(path, PUBLIC_ROUTES);
const isStatic = (path: string) => STATIC_PREFIXES.some((p) => path.startsWith(p));
const isPublicApi = (path: string) => matchRoute(path, PUBLIC_API_ROUTES);

function isDataRequest(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  return (
    pathname.startsWith("/api/") ||
    req.headers.get("rsc") === "1" ||
    req.headers.get("x-middleware-prefetch") === "1" ||
    req.headers.has("next-action") ||
    req.headers.get("accept")?.includes("application/json")
  );
}

/**
 * PROXY-SAFE REDIRECTS:
 * Reconstructs origin using reverse-proxy/load-balancer upstream headers
 * to prevent circular loops caused by internal protocol/port mismatches.
 */
function safeRedirect(req: NextRequest, destination: string, error?: string) {
  const { pathname } = req.nextUrl;
  
  // Extract external host/protocol from standard reverse proxy headers
  const forwardedHost = req.headers.get("x-forwarded-host") || req.nextUrl.host;
  const forwardedProto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  
  const proxyOrigin = `${forwardedProto}://${forwardedHost}`;
  const url = new URL(destination, proxyOrigin);

  // Hard stop against identity redirect loops on identical endpoints
  if (pathname === url.pathname) {
    return NextResponse.next();
  }

  // Preserve callback URLs for non-auth requests dropping to signin
  if (url.pathname === "/signin" && pathname !== "/" && !isAuthRoute(pathname) && !isPublicRoute(pathname)) {
    url.searchParams.set("callbackUrl", pathname);
  }

  if (error) {
    url.searchParams.set("error", error);
  }

  return NextResponse.redirect(url);
}

function handleAuthResponse(req: NextRequest, destination: string, status: 401 | 403, error: string) {
  if (isDataRequest(req)) {
    return new NextResponse(
      JSON.stringify({ 
        error, 
        message: status === 401 ? "Session required" : "Access denied" 
      }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
  return safeRedirect(req, destination, error);
}

/* -------------------------------------------------- */
/* MAIN PROXY ENGINE                                  */
/* -------------------------------------------------- */

export default async function middleware(req: NextRequest, ev: NextFetchEvent) {
  const { pathname } = req.nextUrl;

  try {
    // 1. CORS Preflight Bypass
    if (req.method === "OPTIONS") {
      return NextResponse.next();
    }

    // 2. SYSTEM & STATIC WHITING BEYOND TOKEN GATEWAY
    if (
      (process.env.INTERNAL_API_KEY && req.headers.get("x-masa-internal-key") === process.env.INTERNAL_API_KEY) || 
      isStatic(pathname) || 
      isPublicApi(pathname) ||
      isPublicRoute(pathname) // Prevents /error and /support from intercepting themselves
    ) {
      return NextResponse.next();
    }

    // 3. TOKEN EXTRACTION
    const token = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET })) as unknown as MasaToken;
    const authPage = isAuthRoute(pathname);

    // 4. UNATHENTICATED / EXPIRED ROUTE ACCESS CONTROL
    // SEAMLESS SYNC: If token exists but has been flagged 'expired' by the auth.ts security heartbeat,
    // treat it as unauthenticated so it doesn't fall into an active session bypass loop.
    if (!token || token.expired) {
      if (authPage) return NextResponse.next();
      
      const errCode = token?.disabled ? "AccountLocked" : "Unauthenticated";
      return handleAuthResponse(req, "/signin", 401, errCode);
    }

    // 5. REDIRECT ACTIVE VALID SESSIONS FROM GUEST-ONLY PATHS
    if (authPage) {
      return safeRedirect(req, "/"); 
    }

    // 6. GLOBAL GATE PASS
    return NextResponse.next();

  } catch (err) {
    // Catches system structural failures safely
    console.error("[MIDDLEWARE_CRITICAL_FAULT] Route:", pathname, "Error Details:", err);
    return handleAuthResponse(req, "/error", 401, "Configuration");
  }
}

/* -------------------------------------------------- */
/* MATCHER OPTIMIZATION                               */
/* -------------------------------------------------- */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images, assets, public (custom static folders)
     */
    "/((?!_next/static|_next/image|favicon.ico|images|assets|public).*)",
  ],
};