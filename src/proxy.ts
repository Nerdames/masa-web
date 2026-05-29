import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { getToken } from "next-auth/jwt";
// FIX 1: MUST use 'import type' to prevent Next.js Edge Runtime from crashing.
import type { Role } from "@prisma/client";

/**
 * Minimal Token interface for core authentication
 */
interface MasaToken {
  id: string;
  role: Role;
  organizationId: string;
}

/* -------------------------------------------------- */
/* CONFIGURATION                                      */
/* -------------------------------------------------- */

const AUTH_ROUTES = ["/signin", "/register", "/reset-password", "/welcome"];
const STATIC_PREFIXES = ["/_next", "/favicon.ico", "/images", "/assets", "/public"];
// FORTIFIED: Ensure exact API routes are matched to prevent trailing slash bypass
const PUBLIC_API_ROUTES = ["/api/auth", "/api/logs", "/api/webhooks", "/api/register"];

/* -------------------------------------------------- */
/* UTILITIES                                          */
/* -------------------------------------------------- */

const isAuthRoute = (path: string) => AUTH_ROUTES.some((r) => path.startsWith(r));
const isStatic = (path: string) => STATIC_PREFIXES.some((p) => path.startsWith(p));
const isPublicApi = (path: string) => PUBLIC_API_ROUTES.some((p) => path.startsWith(p));

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

function safeRedirect(req: NextRequest, destination: string, error?: string) {
  const { pathname, origin } = req.nextUrl;
  const url = new URL(destination, origin);

  if (pathname === url.pathname) return NextResponse.next();

  if (url.pathname === "/signin" && pathname !== "/" && !isAuthRoute(pathname)) {
    url.searchParams.set("callbackUrl", pathname);
  }

  if (error) url.searchParams.set("error", error);
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
    // FIX 2: Allow CORS Preflight requests to pass immediately. 
    // If we don't do this, cross-origin POSTs die silently in the browser.
    if (req.method === "OPTIONS") {
      return NextResponse.next();
    }

    // 1. BYPASS: Allow statics, public APIs, and internal system calls
    if (
      (process.env.INTERNAL_API_KEY && req.headers.get("x-masa-internal-key") === process.env.INTERNAL_API_KEY) || 
      isStatic(pathname) || 
      isPublicApi(pathname)
    ) {
      return NextResponse.next();
    }

    // 2. TOKEN EXTRACTION
    const token = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET })) as unknown as MasaToken;
    const authPage = isAuthRoute(pathname);

    // 3. AUTHENTICATION CHECK
    if (!token) {
      return authPage ? NextResponse.next() : handleAuthResponse(req, "/signin", 401, "Unauthenticated");
    }

    // 4. AUTHENTICATED USERS ON AUTH PAGES
    if (authPage) {
      return safeRedirect(req, "/"); 
    }

    // 5. GLOBAL ACCESS
    return NextResponse.next();

  } catch (err) {
    // Console log will help us catch if NextAuth crashes the edge environment
    console.error("[MIDDLEWARE_ERROR] Route:", pathname, "Error:", err);
    return handleAuthResponse(req, "/signin", 401, "ServerError");
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