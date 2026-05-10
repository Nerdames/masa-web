import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";
import { hasPagePermission, getFallbackRoute } from "@/core/lib/permission";

/**
 * Custom JWT interface to match the schema in @_core_lib_auth.docx
 */
interface MasaToken {
  id: string;
  role: Role;
  isOrgOwner: boolean;
  disabled: boolean;
  locked: boolean;
  requiresPasswordChange: boolean;
  expired?: boolean;
}

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
  const url = new URL(destination, origin);

  // 1. Prevent Infinite Loops
  // If we are already at the destination with the exact same error, let it render
  if (pathname === url.pathname) {
    if (!error || searchParams.get("error") === error) return NextResponse.next();
  }

  // 2. Attach Callback: Only if moving from a protected content page to sign-in
  if (url.pathname === "/signin" && pathname !== "/" && !isAuthRoute(pathname)) {
    url.searchParams.set("callbackUrl", pathname);
  }

  // 3. Attach Error Code securely
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
  meta: Record<string, unknown>
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
    let token: MasaToken | null = null;

    try {
      token = (await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET,
      })) as unknown as MasaToken;
    } catch {
      return handleUnauthorized(req, "/signin", "Unauthenticated");
    }

    const authPage = isAuthRoute(pathname);

    /* ------------------------------------------ */
    /* 3. NOT AUTHENTICATED                       */
    /* ------------------------------------------ */
    if (!token) {
      if (authPage) return NextResponse.next();
      return handleUnauthorized(req, "/signin");
    }

    /* ------------------------------------------ */
    /* 4. ACCOUNT STATE CHECK (Supremacy Logic)   */
    /* ------------------------------------------ */
    if (token.disabled || token.locked || token.expired) {
      const state = token.disabled ? "DISABLED" : token.locked ? "LOCKED" : "EXPIRED";
      
      const fallbackUrl = getFallbackRoute(token.role, state); 

      // If already on signin with correct error param, don't redirect again
      const currentError = req.nextUrl.searchParams.get("error");
      if (authPage && currentError === `ACCOUNT_${state}`) {
        return NextResponse.next();
      }

      logSecurityEvent(ev, origin, "SECURITY_BLOCK", {
        userId: token.id,
        path: pathname,
        reason: state,
      });

      // Crucial: Clear session cookies to force a fresh login attempt
      const res = NextResponse.redirect(new URL(fallbackUrl, origin));
      res.cookies.delete("next-auth.session-token");
      res.cookies.delete("__Secure-next-auth.session-token");
      return res;
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
      if (pathname === "/reset-password") return NextResponse.next();
      
      const terminal = getFallbackRoute(token.role, "VALID");
      return safeRedirect(req, terminal);
    }

    /* ------------------------------------------ */
    /* 7. RBAC PAGE-LEVEL CHECK                   */
    /* ------------------------------------------ */
    const allowed = hasPagePermission(
      token.role,
      pathname,
      token.isOrgOwner
    );

    if (!allowed) {
      logSecurityEvent(ev, origin, "RBAC_DENIED", {
        userId: token.id,
        role: token.role,
        path: pathname,
      });

      const fallback = getFallbackRoute(token.role, "VALID");

      // Prevent infinite loops if configuration is mismatched
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
     * - favicon.ico, images, assets (Static files)
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|images|assets).*)",
  ],
};