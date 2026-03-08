import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";
import {
  PAGE_PERMISSIONS,
  MANAGEMENT_ROUTES,
  PERSONAL_ROUTES,
} from "@/lib/rbac";

/**
 * List of paths to skip from auth redirects
 */
const PUBLIC_PATHS = [
  "/favicon.ico",
  "/robots.txt",
  "/manifest.json",
  "/_next",
  "/static",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.nextUrl.origin;

  // Skip public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Get token from NextAuth
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  /* ---------- Unauthenticated ---------- */
  if (!token) {
    // Allow access to auth pages
    if (pathname.startsWith("/auth")) return NextResponse.next();

    // Redirect to sign-in with safe callbackUrl
    const url = new URL("/auth/signin", origin);

    // Only set callbackUrl for page requests, not assets
    url.searchParams.set("callbackUrl", pathname);

    return NextResponse.redirect(url);
  }

  const role = token.role as Role;

  /* ---------- Super Access ---------- */
  if (token.isOrgOwner || role === Role.ADMIN) {
    return NextResponse.next();
  }

  /* ---------- DEV Blocked ---------- */
  if (role === Role.DEV) {
    return NextResponse.redirect(new URL("/feedback/access-denied", origin));
  }

  /* ---------- Personal Routes ---------- */
  if (PERSONAL_ROUTES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  /* ---------- Management Routes ---------- */
  if (MANAGEMENT_ROUTES.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/feedback/access-denied", origin));
  }

  /* ---------- Page Permissions ---------- */
  const entry = Object.entries(PAGE_PERMISSIONS).find(([path]) =>
    pathname.startsWith(path)
  );

  if (entry) {
    const allowedRoles = entry[1];
    if (!allowedRoles.includes(role)) {
      return NextResponse.redirect(new URL("/feedback/access-denied", origin));
    }
  }

  return NextResponse.next();
}

/**
 * Match all routes except API and static files
 */
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};