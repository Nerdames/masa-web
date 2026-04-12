// src/proxy.ts
import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { getToken } from "next-auth/jwt";
import { hasPagePermission } from "@/core/lib/permission";

/* -------------------------------------------------- */
/* CONFIGURATION                                      */
/* -------------------------------------------------- */

const AUTH_ROUTES = ["/signin", "/register", "/reset-password", "/welcome"];

const STATIC_PREFIXES = [
  "/_next",
  "/favicon.ico",
  "/images",
  "/assets",
  "/public",
];

const PUBLIC_API_ROUTES = ["/api/auth", "/api/logs", "/api/webhooks"];

/* -------------------------------------------------- */
/* UTILITIES                                          */
/* -------------------------------------------------- */

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some((r) => pathname.startsWith(r));
}

function isStatic(pathname: string) {
  return STATIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function isPublicApi(pathname: string) {
  return PUBLIC_API_ROUTES.some((p) => pathname.startsWith(p));
}

function isDataRequest(req: NextRequest) {
  return (
    req.nextUrl.pathname.startsWith("/api/") ||
    req.headers.get("rsc") === "1" ||
    req.headers.get("x-middleware-prefetch") === "1" ||
    req.headers.get("x-nextjs-data") !== null ||
    req.headers.has("next-action") ||
    req.headers.get("accept")?.includes("application/json")
  );
}

/**
 * Absolute redirect guard to prevent infinite loops
 */
function safeRedirect(req: NextRequest, destination: string, error?: string) {
  const { pathname, origin } = req.nextUrl;

  // If already at destination, do nothing
  if (pathname === destination) return NextResponse.next();

  const url = new URL(destination, origin);
  
  // Important: Prevent adding callbackUrl if we are already at signin
  if (destination !== "/signin" && pathname !== "/") {
    url.searchParams.set("callbackUrl", pathname);
  }

  if (error) url.searchParams.set("error", error);

  return NextResponse.redirect(url);
}
/**
 * Unified unauthorized handler
 */
function handleUnauthorized(
  req: NextRequest,
  destination: string,
  error?: string
) {
  if (isDataRequest(req)) {
    return new NextResponse(
      JSON.stringify({
        error: error || "Unauthenticated",
        message: "Authentication required",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  return safeRedirect(req, destination, error);
}

/**
 * Async security logging (non-blocking)
 */
function logSecurityEvent(
  ev: NextFetchEvent,
  origin: string,
  action: string,
  meta: Record<string, any>
) {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) return;

  ev.waitUntil(
    fetch(`${origin}/api/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-masa-internal-key": key,
      },
      body: JSON.stringify({
        action,
        ...meta,
        timestamp: new Date().toISOString(),
        source: "PROXY",
      }),
    }).catch(() => {})
  );
}

/* -------------------------------------------------- */
/* MAIN PROXY                                         */
/* -------------------------------------------------- */

export async function proxy(req: NextRequest, ev: NextFetchEvent) {
  const { pathname, origin } = req.nextUrl;

  try {
    /* ------------------------------------------ */
    /* 1. HARD BYPASS                             */
    /* ------------------------------------------ */

    const internal = req.headers.get("x-masa-internal-key") === process.env.INTERNAL_API_KEY;

    if (internal || isStatic(pathname) || isPublicApi(pathname)) {
      return NextResponse.next();
    }

    /* ------------------------------------------ */
    /* 2. TOKEN SAFE EXTRACTION                   */
    /* ------------------------------------------ */

    let token = null;

    try {
      token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET,
      });
    } catch {
      return handleUnauthorized(req, "/signin", "Unauthenticated");
    }

    const authPage = isAuthRoute(pathname);

    /* ------------------------------------------ */
    /* 3. NOT AUTHENTICATED                       */
    /* ------------------------------------------ */

    if (!token) {
      if (authPage) return NextResponse.next();
      return handleUnauthorized(req, "/signin", "Unauthenticated");
    }

    /* ------------------------------------------ */
    /* 4. ACCOUNT STATE CHECK                     */
    /* ------------------------------------------ */

    if (token.disabled || token.locked || token.expired) {
      if (authPage) return NextResponse.next();

      const errorCode = token.disabled
        ? "ACCOUNT_DISABLED"
        : token.locked
        ? "ACCOUNT_LOCKED"
        : "SessionExpired";

      logSecurityEvent(ev, origin, "SECURITY_BLOCK", {
        userId: token.id,
        path: pathname,
      });

      return handleUnauthorized(req, "/signin", errorCode);
    }

    /* ------------------------------------------ */
    /* 5. PASSWORD RESET ENFORCEMENT              */
    /* ------------------------------------------ */

    if (token.requiresPasswordChange) {
      if (
        pathname.startsWith("/reset-password") ||
        pathname.startsWith("/api/profile")
      ) {
        return NextResponse.next();
      }

      return handleUnauthorized(req, "/reset-password", "PasswordResetRequired");
    }

    /* ------------------------------------------ */
    /* 6. PREVENT AUTH PAGE ACCESS WHEN LOGGED IN */
    /* ------------------------------------------ */

    if (authPage) {
      if (pathname === "/") return NextResponse.next();
      return safeRedirect(req, "/", undefined);
    }

    /* ------------------------------------------ */
    /* 7. RBAC CHECK                             */
    /* ------------------------------------------ */

    const allowed = hasPagePermission(
      token.role as any,
      pathname,
      Boolean(token.isOrgOwner)
    );

    if (!allowed) {
      logSecurityEvent(ev, origin, "RBAC_DENIED", {
        userId: token.id,
        role: token.role,
        path: pathname,
      });

      const fallbackMap: Record<string, string> = {
        ADMIN: "/",
        MANAGER: "/",
        INVENTORY: "/inventory",
        SALES: "/pos",
        CASHIER: "/pos",
        AUDITOR: "/audit",
        DEV: "/inventory",
      };

      const fallback = fallbackMap[token.role as string] || "/";

      // Prevent fallback loop
      if (pathname === fallback) {
        return NextResponse.next();
      }

      return handleUnauthorized(req, fallback, "AccessDenied");
    }

    /* ------------------------------------------ */
    /* 8. SUCCESS                                */
    /* ------------------------------------------ */

    return NextResponse.next();
  } catch (err) {
    /* ------------------------------------------ */
    /* FAIL SAFE                                 */
    /* ------------------------------------------ */

    if (isDataRequest(req)) {
      return new NextResponse(
        JSON.stringify({
          error: "ServerError",
          message: "Internal server error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const url = new URL("/signin", req.nextUrl.origin);
    url.searchParams.set("error", "ServerError");

    return NextResponse.redirect(url);
  }
}

/* -------------------------------------------------- */
/* MATCHER (CRITICAL FOR STABILITY)                   */
/* -------------------------------------------------- */

// Update your config matcher
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|signin|register|reset-password).*)",
  ],
};