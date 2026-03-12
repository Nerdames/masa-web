import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";

/* -------------------- GET: SINGLE BRANCH -------------------- */

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const branch = await prisma.branch.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId,
        deletedAt: null,
      },
      include: {
        branchAssignments: {
          include: {
            personnel: {
              select: { id: true, name: true, email: true, role: true }
            }
          }
        },
        _count: {
          select: {
            branchProducts: true,
            orders: { where: { deletedAt: null } },
            activityLogs: true,
          }
        }
      }
    });

    if (!branch) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }

    return NextResponse.json(branch);
  } catch (error: unknown) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------- PATCH: UPDATE BRANCH -------------------- */

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    // Both Admin and OrgOwner can edit
    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await req.json();
    const { name, location, active } = body;

    const updatedBranch = await prisma.branch.update({
      where: { 
        id: params.id,
        organizationId: session.user.organizationId 
      },
      data: {
        ...(name && { name }),
        ...(location !== undefined && { location }),
        ...(active !== undefined && { active }),
      }
    });

    return NextResponse.json(updatedBranch);
  } catch (error: unknown) {
    console.error("PATCH_BRANCH_ERROR:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

/* -------------------- DELETE: SOFT DELETE & REASSIGN -------------------- */

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    // Both Admin and OrgOwner can delete
    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const branchId = params.id;
    const organizationId = session.user.organizationId;

    const result = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, organizationId }
      });

      if (!branch) throw new Error("Branch not found");

      // 1. Clear assignments
      await tx.branchAssignment.deleteMany({
        where: { branchId }
      });

      // 2. Reset personnel branch reference
      await tx.authorizedPersonnel.updateMany({
        where: { branchId, organizationId },
        data: { branchId: null }
      });

      // 3. Soft delete
      const deletedBranch = await tx.branch.update({
        where: { id: branchId },
        data: { 
          deletedAt: new Date(),
          active: false 
        }
      });

      // 4. Log
      await tx.activityLog.create({
        data: {
          organizationId,
          branchId,
          personnelId: session.user.id,
          action: "BRANCH_DELETED",
          critical: true,
          metadata: { 
            branchName: branch.name, 
            deletedByRole: session.user.role 
          }
        }
      });

      return deletedBranch;
    });

    return NextResponse.json({ message: "Branch successfully deleted", id: result.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Deletion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}