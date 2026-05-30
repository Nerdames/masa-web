import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { getToken } from "next-auth/jwt";
// Edge-Runtime Safe Import
import type { Role } from "@prisma/client";

/**
 * Enhanced Token interface synchronized with src/infrastructure/auth/config.ts
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

// Auth routes automatically redirect active valid sessions to "/"
const AUTH_ROUTES = ["/signin", "/register", "/welcome"];

// FIXED: Moved "/reset-password" to PUBLIC_ROUTES. 
// This allows guests (forgot password) and active sessions (password rotation) 
// to access the page without triggering the AUTH_ROUTE redirect loop.
const PUBLIC_ROUTES = ["/error", "/support", "/reset-password"];

const STATIC_PREFIXES = ["/_next", "/favicon.ico", "/images", "/assets", "/public"];
const PUBLIC_API_ROUTES = ["/api/auth", "/api/logs", "/api/webhooks", "/api/register"];

// Edge-Level RBAC Gatekeeper Matrix
// Synchronized with your module boundaries: (dashboard) and (terminal)
const EDGE_ROLE_MATRIX: Record<string, string[]> = {
  "/admin": ["ADMIN", "DEV", "MANAGER"],
  "/inventory": ["ADMIN", "MANAGER", "INVENTORY", "AUDITOR", "DEV"],
  "/pos": ["ADMIN", "MANAGER", "SALES", "CASHIER", "DEV"],
  "/audit": ["AUDITOR", "ADMIN", "DEV", "MANAGER", "INVENTORY"], 
};

/* -------------------------------------------------- */
/* UTILITIES                                          */
/* -------------------------------------------------- */

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
 * Edge RBAC Validator
 */
function hasEdgeAccess(pathname: string, userRole: string): boolean {
  for (const [routePrefix, allowedRoles] of Object.entries(EDGE_ROLE_MATRIX)) {
    if (pathname.startsWith(routePrefix)) {
      return allowedRoles.includes(userRole);
    }
  }
  return true; // Pass through to page-level guards for unmatched routes (e.g. /settings)
}

/**
 * PROXY-SAFE REDIRECTS:
 * Reconstructs origin using reverse-proxy/load-balancer upstream headers
 * to prevent circular loops caused by internal protocol/port mismatches.
 */
function safeRedirect(req: NextRequest, destination: string, error?: string) {
  const { pathname } = req.nextUrl;
  
  const forwardedHost = req.headers.get("x-forwarded-host") || req.nextUrl.host;
  const forwardedProto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  
  const proxyOrigin = `${forwardedProto}://${forwardedHost}`;
  const url = new URL(destination, proxyOrigin);

  if (pathname === url.pathname) {
    return NextResponse.next();
  }

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

    // 2. SYSTEM & STATIC WHITELISTING BEYOND TOKEN GATEWAY
    if (
      (process.env.INTERNAL_API_KEY && req.headers.get("x-masa-internal-key") === process.env.INTERNAL_API_KEY) || 
      isStatic(pathname) || 
      isPublicApi(pathname) ||
      isPublicRoute(pathname) 
    ) {
      return NextResponse.next();
    }

    // 3. TOKEN EXTRACTION
    const token = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET })) as unknown as MasaToken;
    const authPage = isAuthRoute(pathname);

    // 4. UNAUTHENTICATED / EXPIRED ROUTE ACCESS CONTROL
    if (!token || token.expired) {
      if (authPage) return NextResponse.next();
      
      const errCode = token?.disabled ? "AccountLocked" : "Unauthenticated";
      return handleAuthResponse(req, "/signin", 401, errCode);
    }

    // 5. REDIRECT ACTIVE VALID SESSIONS FROM GUEST-ONLY PATHS
    if (authPage) {
      return safeRedirect(req, "/"); 
    }

    // 6. EDGE-LEVEL ROLE AUTHORIZATION
    if (!hasEdgeAccess(pathname, token.role)) {
      console.warn(`[EDGE_RBAC_VIOLATION] User ${token.id} (Role: ${token.role}) attempted to access ${pathname}`);
      return handleAuthResponse(req, "/error", 403, "Forbidden");
    }

    // 7. GLOBAL GATE PASS
    return NextResponse.next();

  } catch (err) {
    console.error("[MIDDLEWARE_CRITICAL_FAULT] Route:", pathname, "Error Details:", err);
    return handleAuthResponse(req, "/error", 401, "Configuration");
  }
}

/* -------------------------------------------------- */
/* MATCHER OPTIMIZATION                               */
/* -------------------------------------------------- */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|assets|public).*)",
  ],
};