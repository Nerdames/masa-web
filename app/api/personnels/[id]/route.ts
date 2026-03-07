import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getToken } from "next-auth/jwt";

const JWT_SECRET = process.env.NEXTAUTH_SECRET;

/**
 * PATCH: Updates Personnel profile and manages Branch Assignments (Roles)
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const token = await getToken({ req, secret: JWT_SECRET });
  if (!token || !["DEV", "ADMIN"].includes(token.role as string)) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  try {
    const { id } = params;
    const body = await req.json();
    const { name, email, role, branchId, action } = body;

    // Use a transaction for consistency between Personnel info and Branch roles
    await prisma.$transaction(async (tx) => {
      // 1. Update basic personnel info
      await tx.authorizedPersonnel.update({
        where: { id },
        data: { name, email },
      });

      // 2. Handle Role/Branch changes
      // action can be: 'UPDATE_ROLE' or 'SWITCH_BRANCH'
      if (action === "UPDATE_ROLE" && role && branchId) {
        await tx.branchAssignment.upsert({
          where: {
            personnelId_branchId: {
              personnelId: id,
              branchId: branchId,
            },
          },
          update: { role },
          create: {
            personnelId: id,
            branchId: branchId,
            role: role,
          },
        });
      }
    });

    return NextResponse.json({ message: "Personnel updated successfully" });
  } catch (error) {
    console.error("PATCH Personnel error:", error);
    return NextResponse.json({ message: "Update failed" }, { status: 500 });
  }
}

/**
 * DELETE: Soft deletes the personnel record
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const token = await getToken({ req, secret: JWT_SECRET });
  if (!token || !["DEV", "ADMIN"].includes(token.role as string)) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  try {
    // Soft delete: set deletedAt
    await prisma.authorizedPersonnel.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ message: "Personnel deactivated successfully" });
  } catch (error) {
    return NextResponse.json({ message: "Deletion failed" }, { status: 500 });
  }
}