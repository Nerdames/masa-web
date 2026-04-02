import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";
import { hasPagePermission } from "@/core/lib/permission";

/* -------------------------------------------------- */
/* CONFIGURATION & CONSTANTS */
/* -------------------------------------------------- */

const AUTH_ROUTES = ["/signin", "/register", "/reset-password", "/welcome"];
const BYPASS_PREFIXES = ["/_next", "/api/auth", "/favicon.ico", "/feedback"];
const PUBLIC_FILE = /\.(.*)$/;
const DB_UPDATE_THROTTLE_MS = 5 * 60 * 1000;

/* -------------------------------------------------- */
/* HELPERS */
/* -------------------------------------------------- */

/**
 * Hardened Unauthorized Handler
 * Explicitly prevents "undefined" in the URL string.
 */
function handleUnauthorized(req: NextRequest, destination: string, error?: string) {
  const { pathname, origin } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: error || "Unauthorized", message: "Session expired or insufficient permissions." },
      { status: 403 }
    );
  }

  const url = new URL(destination, origin);
  
  // Set callback for future redirection
  if (destination === "/signin") {
    url.searchParams.set("callbackUrl", pathname);
  }
  
  // Explicitly set error if provided, ensuring it's never the literal string "undefined"
  if (error) {
    url.searchParams.set("error", error);
  }

  return NextResponse.redirect(url);
}

function logSecurityEvent(ev: NextFetchEvent, origin: string, action: string, meta: Record<string, any>) {
  const logPromise = fetch(`${origin}/api/logs`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-masa-internal-key": process.env.INTERNAL_API_KEY || "" 
    },
    body: JSON.stringify({ action, ...meta, timestamp: new Date().toISOString() }),
  }).catch((err) => console.error("[PROXY_LOG_ERROR]", err));

  ev.waitUntil(logPromise);
}

/* -------------------------------------------------- */
/* MAIN PROXY LOGIC */
/* -------------------------------------------------- */

export async function proxy(req: NextRequest, ev: NextFetchEvent) {
  const { pathname, origin } = req.nextUrl;

  // 1. BYPASS LOGIC
  const isInternalAction = req.headers.get("x-masa-internal-key") === process.env.INTERNAL_API_KEY;
  if (isInternalAction || BYPASS_PREFIXES.some(p => pathname.startsWith(p)) || PUBLIC_FILE.test(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const isAuthPage = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  // 2. GUEST ACCESS CONTROL
  if (!token) {
    if (isAuthPage || pathname === "/") return NextResponse.next();
    // Default to signin for any protected route
    return handleUnauthorized(req, "/signin");
  }

  // 3. ACCOUNT INTEGRITY (Explicit Error Mapping)
  // Maps internal states to the error codes handled by your error/page.tsx
  if (token.disabled || token.locked || token.expired) {
    if (pathname === "/signin") return NextResponse.next();

    let errorCode = "Default";
    if (token.disabled) errorCode = "AccessDenied";
    if (token.locked) errorCode = "AccessDenied";
    if (token.expired) errorCode = "Verification";

    logSecurityEvent(ev, origin, `SECURITY_BLOCK_${errorCode}`, {
      personnelId: token.id,
      email: token.email,
      path: pathname
    });

    return handleUnauthorized(req, "/signin", errorCode);
  }

  // 4. MANDATORY PASSWORD ROTATION
  if (token.requiresPasswordChange) {
    const isResetPage = pathname.startsWith("/reset-password");
    if (!isResetPage && !pathname.startsWith("/api/")) {
      return NextResponse.redirect(new URL("/reset-password", origin));
    }
  }

  // 5. AUTHENTICATED REDIRECTION (The "Kick-back")
  if (isAuthPage || pathname === "/") {
    if (token.requiresPasswordChange && pathname.startsWith("/reset-password")) {
      return NextResponse.next();
    }

    // Role-Based Home Mapping
    const roleRoutes: Record<string, string> = {
      [Role.CASHIER]: "/pos",
      [Role.SALES]: "/pos",
      [Role.INVENTORY]: "/inventory/products",
      [Role.AUDITOR]: "/audit/logs",
    };

    const destination = roleRoutes[token.role as string] || "/admin/overview";

    if (pathname === destination) return NextResponse.next();
    return NextResponse.redirect(new URL(destination, origin));
  }

  // 6. RBAC ENGINE
  const allowed = hasPagePermission(
    token.role as Role,
    pathname,
    Boolean(token.isOrgOwner)
  );

  if (!allowed) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden", message: "Access denied." }, { status: 403 });
    }
    
    logSecurityEvent(ev, origin, "UNAUTHORIZED_ACCESS_ATTEMPT", {
      personnelId: token.id,
      role: token.role,
      path: pathname,
    });

    // Redirect to the error page we built earlier with the AccessDenied code
    return NextResponse.redirect(new URL("/signin?error=AccessDenied", origin));
  }

  // 7. HEARTBEAT SYNC
  const now = Date.now();
  const lastActivity = Number(token.lastActivityAt || 0);
  const isLowPriority = ["/api/notifications", "/api/logs"].some(p => pathname.startsWith(p));

  if (!isLowPriority && (now - lastActivity > DB_UPDATE_THROTTLE_MS)) {
    logSecurityEvent(ev, origin, "HEARTBEAT_SYNC", {
      personnelId: token.id,
      path: pathname
    });
  }

  return NextResponse.next();
}