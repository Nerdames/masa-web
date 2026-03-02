import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

/**
 * GET /api/profile/verify?token=...
 * Finalizes the email change process by consuming the verification token.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get("token");

  // 1️⃣ VALIDATE TOKEN PRESENCE
  if (!token) {
    return NextResponse.redirect(new URL("/profile?error=missing_token", origin));
  }

  try {
    // 2️⃣ FETCH TOKEN
    const vToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!vToken) {
      return NextResponse.redirect(new URL("/profile?error=invalid_token", origin));
    }

    // Check expiration
    if (vToken.expires < new Date()) {
      await prisma.verificationToken.delete({
        where: { token },
      });
      return NextResponse.redirect(new URL("/profile?error=expired_token", origin));
    }

    // 3️⃣ AUTH CHECK
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      // If not logged in, redirect to login and return here after success
      const loginUrl = new URL("/auth/login", origin);
      loginUrl.searchParams.set("callbackUrl", request.url);
      return NextResponse.redirect(loginUrl);
    }

    // 4️⃣ ATOMIC TRANSACTION
    await prisma.$transaction(async (tx) => {
      // Fetch active personnel only
      const user = await tx.authorizedPersonnel.findFirst({
        where: {
          id: session.user.id,
          deletedAt: null,
        },
        select: {
          id: true,
          organizationId: true,
          branchId: true,
          disabled: true,
        },
      });

      if (!user) {
        throw new Error("User not found.");
      }

      if (user.disabled) {
        throw new Error("Account is disabled.");
      }

      // Ensure email is not already taken within the same organization
      const duplicate = await tx.authorizedPersonnel.findFirst({
        where: {
          organizationId: user.organizationId,
          email: vToken.identifier,
          deletedAt: null,
          NOT: {
            id: user.id,
          },
        },
      });

      if (duplicate) {
        throw new Error("This email is now in use by another account.");
      }

      // Update email
      await tx.authorizedPersonnel.update({
        where: { id: user.id },
        data: {
          email: vToken.identifier,
        },
      });

      // Log activity
      await tx.activityLog.create({
        data: {
          organizationId: user.organizationId,
          branchId: user.branchId ?? null,
          personnelId: user.id,
          action: "EMAIL_VERIFIED",
          meta: `Successfully changed email to ${vToken.identifier}`,
        },
      });

      // Delete token after successful update
      await tx.verificationToken.delete({
        where: { token },
      });
    });

    // 5️⃣ SUCCESS REDIRECT
    return NextResponse.redirect(new URL("/profile?verified=true", origin));

  } catch (error: any) {
    console.error("VERIFICATION_ERROR", error);

    const clientErrors = [
      "This email is now in use by another account.",
      "User not found.",
      "Account is disabled.",
    ];

    const errorMessage = clientErrors.includes(error.message)
      ? encodeURIComponent(error.message)
      : "internal_error";

    return NextResponse.redirect(
      new URL(`/profile?error=${errorMessage}`, origin)
    );
  }
}