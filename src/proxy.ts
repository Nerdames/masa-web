import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";

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
const PUBLIC_API_ROUTES = ["/api/auth", "/api/logs", "/api/webhooks"];

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
    // 1. BYPASS: Allow statics, public APIs, and internal system calls
    if (
      req.headers.get("x-masa-internal-key") === process.env.INTERNAL_API_KEY || 
      isStatic(pathname) || 
      isPublicApi(pathname)
    ) {
      return NextResponse.next();
    }

    // 2. TOKEN EXTRACTION
    const token = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET })) as unknown as MasaToken;
    const authPage = isAuthRoute(pathname);

    // 3. AUTHENTICATION CHECK
    // If no session exists, redirect to signin (unless already on an auth page)
    if (!token) {
      return authPage ? NextResponse.next() : handleAuthResponse(req, "/signin", 401, "Unauthenticated");
    }

    // 4. AUTHENTICATED USERS ON AUTH PAGES
    // If logged in, don't allow them to go back to /signin or /register
    if (authPage) {
      return safeRedirect(req, "/"); // Redirect to home/dashboard
    }

    // 5. GLOBAL ACCESS
    // All granular RBAC (hasPagePermission) and Account State checks are bypassed here.
    return NextResponse.next();

  } catch (err) {
    console.error("[MIDDLEWARE_ERROR]", err);
    return handleAuthResponse(req, "/signin", 401, "ServerError");
  }
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|images|assets).*)"],
};