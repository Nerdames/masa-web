import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Role, Prisma } from "@prisma/client";

interface RouteParams {
  params: {
    id: string;
  };
}

/* -------------------- GET: SINGLE BRANCH -------------------- */

export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const branch = await prisma.branch.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId,
      },
      include: {
        branchAssignments: {
          include: {
            personnel: {
              select: { 
                id: true, 
                name: true, 
                email: true, 
                role: true, 
                staffCode: true 
              }
            }
          }
        },
        _count: {
          select: {
            branchProducts: true,
            personnel: { where: { deletedAt: null } },
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
    console.error("GET_SINGLE_BRANCH_ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------- DELETE: SOFT DELETE & REASSIGN -------------------- */

export async function DELETE(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const branchId = params.id;
    const organizationId = session.user.organizationId;

    const result = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, organizationId }
      });

      if (!branch) {
        throw new Error("Branch not found");
      }

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

      // 4. Log the action
      const logMetadata: Prisma.JsonObject = { 
        branchName: branch.name, 
        deletedByRole: session.user.role 
      };

      await tx.activityLog.create({
        data: {
          organizationId,
          branchId,
          personnelId: session.user.id,
          action: "BRANCH_DELETED",
          critical: true,
          metadata: logMetadata,
        }
      });

      return deletedBranch;
    });

    return NextResponse.json({ 
      message: "Branch successfully archived", 
      id: result.id 
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Deletion failed";
    console.error("DELETE_BRANCH_ERROR:", message);
    
    const status = message === "Branch not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}