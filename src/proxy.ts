import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";
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

/**
 * Identifies if the request is for data (API, RSC, or Prefetch).
 * Crucial for returning 401 JSON instead of a 302 HTML redirect.
 */
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
 * Absolute redirect guard to prevent infinite loops and clean up redundant params.
 */
function safeRedirect(req: NextRequest, destination: string, error?: string) {
  const { pathname, origin, searchParams } = req.nextUrl;

  // 1. Prevent Infinite Loops: If already at destination with the same error, do nothing
  if (pathname === destination) {
    if (!error || searchParams.get("error") === error) return NextResponse.next();
  }

  const url = new URL(destination, origin);

  // 2. Attach Callback: Only if moving from a protected content page to signin
  if (destination === "/signin" && pathname !== "/" && !isAuthRoute(pathname)) {
    url.searchParams.set("callbackUrl", pathname);
  }

  if (error) url.searchParams.set("error", error);

  return NextResponse.redirect(url);
}

/**
 * Unified unauthorized handler: Distinguishes between UI redirects and API 401s.
 */
function handleUnauthorized(req: NextRequest, destination: string, error?: string) {
  if (isDataRequest(req)) {
    return new NextResponse(
      JSON.stringify({
        error: error || "Unauthenticated",
        message: "Authentication or authorization required.",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  return safeRedirect(req, destination, error);
}

/**
 * Async security logging (non-blocking telemetry)
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
    }).catch(() => { /* Silent fail for telemetry */ })
  );
}

/* -------------------------------------------------- */
/* MAIN PROXY ENGINE                                  */
/* -------------------------------------------------- */

export async function proxy(req: NextRequest, ev: NextFetchEvent) {
  const { pathname, origin } = req.nextUrl;

  try {
    /* ------------------------------------------ */
    /* 1. HARD BYPASS                             */
    /* ------------------------------------------ */
    const isInternal = req.headers.get("x-masa-internal-key") === process.env.INTERNAL_API_KEY;

    if (isInternal || isStatic(pathname) || isPublicApi(pathname)) {
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
      // Leave error undefined for standard non-auth visits to avoid ?error= clutter
      return handleUnauthorized(req, "/signin");
    }

    /* ------------------------------------------ */
    /* 4. ACCOUNT STATE CHECK (Supremacy Logic)   */
    /* ------------------------------------------ */
    if (token.disabled || token.locked || token.expired) {
      const errorCode = token.disabled
        ? "ACCOUNT_DISABLED"
        : token.locked
        ? "ACCOUNT_LOCKED"
        : "SessionExpired";

      if (authPage && req.nextUrl.searchParams.get("error") === errorCode) {
        return NextResponse.next();
      }

      logSecurityEvent(ev, origin, "SECURITY_BLOCK", {
        userId: token.id,
        path: pathname,
        reason: errorCode,
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
      // Allow reset-password if explicitly requested and allowed, but block signin/register
      if (pathname === "/reset-password") return NextResponse.next();
      if (pathname === "/") return NextResponse.next();
      return safeRedirect(req, "/");
    }

    /* ------------------------------------------ */
    /* 7. RBAC PAGE-LEVEL CHECK                   */
    /* ------------------------------------------ */
    const allowed = hasPagePermission(
      token.role as Role,
      pathname,
      Boolean(token.isOrgOwner)
    );

    if (!allowed) {
      logSecurityEvent(ev, origin, "RBAC_DENIED", {
        userId: token.id,
        role: token.role,
        path: pathname,
      });

      // Smart Fallback mapping to prevent redirecting to an unauthorized root
      const fallbackMap: Record<string, string> = {
        ADMIN: "/",
        MANAGER: "/",
        INVENTORY: "/inventory",
        SALES: "/pos",
        CASHIER: "/pos",
        AUDITOR: "/audit/reports",
        DEV: "/db-inspector",
      };

      const fallback = fallbackMap[token.role as string] || "/";

      // Prevent a fallback loop if the map configuration is ever out of sync
      if (pathname === fallback) return NextResponse.next();

      return handleUnauthorized(req, fallback, "AccessDenied");
    }

    /* ------------------------------------------ */
    /* 8. SUCCESS                                 */
    /* ------------------------------------------ */
    return NextResponse.next();

  } catch (err) {
    /* ------------------------------------------ */
    /* FAIL SAFE                                  */
    /* ------------------------------------------ */
    console.error("[PROXY_ERROR]", err);
    if (isDataRequest(req)) {
      return new NextResponse(
        JSON.stringify({ error: "ServerError", message: "Internal proxy error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    return safeRedirect(req, "/signin", "ServerError");
  }
}

/* -------------------------------------------------- */
/* MATCHER                                            */
/* -------------------------------------------------- */
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api/auth (NextAuth strictly handles its own routing)
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};