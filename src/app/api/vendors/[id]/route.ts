"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/src/core/lib/auth";
import prisma from "@/src/core/lib/prisma";
import type { Role } from "@prisma/client";

/* ===================================================== */
/* ===================== Types ========================= */
/* ===================================================== */

interface SessionUser {
  id: string;
  organizationId: string;
  role: Role;
  isOrgOwner: boolean;
  disabled?: boolean;
  deletedAt?: Date | null;
}

interface RouteContext {
  params: {
    id: string;
  };
}

interface VendorUpdateInput {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/* ===================================================== */
/* ===================== Helpers ======================= */
/* ===================================================== */

function sanitizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function assertSessionUser(session: Session | null): SessionUser {
  if (!session?.user) {
    throw new ApiError(401, "Unauthorized");
  }

  const user = session.user as unknown;

  if (
    typeof user !== "object" ||
    user === null ||
    !("organizationId" in user) ||
    !("role" in user)
  ) {
    throw new ApiError(401, "Invalid session");
  }

  const typedUser = user as SessionUser;

  if (!typedUser.organizationId || !typedUser.role) {
    throw new ApiError(401, "Unauthorized");
  }

  if (typedUser.disabled || typedUser.deletedAt) {
    throw new ApiError(403, "Account disabled");
  }

  if (typedUser.role !== "ADMIN" && !typedUser.isOrgOwner) {
    throw new ApiError(403, "Forbidden");
  }

  return typedUser;
}

/* ===================================================== */
/* ======================= PATCH ======================= */
/* ===================================================== */

export async function PATCH(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getServerSession(authOptions);
    const user = assertSessionUser(session);

    const { id } = context.params;

    if (!id) {
      throw new ApiError(400, "Vendor ID is required");
    }

    const body: unknown = await req.json();

    if (typeof body !== "object" || body === null) {
      throw new ApiError(400, "Invalid request body");
    }

    const input = body as VendorUpdateInput;

    const name = sanitizeString(input.name);
    const email = sanitizeString(input.email);
    const phone = sanitizeString(input.phone);
    const address = sanitizeString(input.address);

    const existingVendor = await prisma.vendor.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });

    if (!existingVendor) {
      throw new ApiError(404, "Vendor not found");
    }

    /* ---------- Duplicate Name Protection ---------- */

    if (name && name !== existingVendor.name) {
      const duplicate = await prisma.vendor.findFirst({
        where: {
          organizationId: user.organizationId,
          name,
          deletedAt: null,
          NOT: { id },
        },
      });

      if (duplicate) {
        throw new ApiError(
          409,
          "Vendor with this name already exists"
        );
      }
    }

    /* ---------- Build Safe Update Payload ---------- */

    const updateData: {
      name?: string;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
    } = {};

    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;

    if (Object.keys(updateData).length === 0) {
      throw new ApiError(400, "No valid fields provided");
    }

    const updatedVendor = await prisma.vendor.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ vendor: updatedVendor });
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { error: "Failed to update vendor" },
      { status: 500 }
    );
  }
}

/* ===================================================== */
/* ======================= DELETE ====================== */
/* ===================================================== */

export async function DELETE(
  _req: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getServerSession(authOptions);
    const user = assertSessionUser(session);

    const { id } = context.params;

    if (!id) {
      throw new ApiError(400, "Vendor ID is required");
    }

    const vendor = await prisma.vendor.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      include: {
        branchProducts: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });

    if (!vendor) {
      throw new ApiError(404, "Vendor not found");
    }

    if (vendor.branchProducts.length > 0) {
      throw new ApiError(
        400,
        "Cannot delete vendor. Vendor is linked to active branch products."
      );
    }

    await prisma.vendor.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete vendor" },
      { status: 500 }
    );
  }
}