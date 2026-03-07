import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";
import {
  PAGE_PERMISSIONS,
  MANAGEMENT_ROUTES,
  PERSONAL_ROUTES,
} from "@/lib/rbac";

export async function middleware(req: NextRequest) {

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const { pathname } = req.nextUrl;
  const origin = req.nextUrl.origin;

  /* ---------- Unauthenticated ---------- */

  if (!token) {

    if (pathname.startsWith("/auth"))
      return NextResponse.next();

    const url = new URL("/auth/signin", origin);
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
    return NextResponse.redirect(
      new URL("/feedback/access-denied", origin)
    );
  }

  /* ---------- Personal Routes ---------- */

  if (PERSONAL_ROUTES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  /* ---------- Management Routes ---------- */

  if (MANAGEMENT_ROUTES.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(
      new URL("/feedback/access-denied", origin)
    );
  }

  /* ---------- Page Permissions ---------- */

  const entry = Object.entries(PAGE_PERMISSIONS).find(([path]) =>
    pathname.startsWith(path)
  );

  if (entry) {

    const allowedRoles = entry[1];

    if (!allowedRoles.includes(role)) {

      return NextResponse.redirect(
        new URL("/feedback/access-denied", origin)
      );

    }

  }

  return NextResponse.next();

}