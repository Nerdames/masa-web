// File: src/app/api/branches/[id]/route.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Role, Prisma } from "@prisma/client";

/**
 * Next.js 15 requires params to be a Promise for dynamic routes.
 */
interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/* -------------------- GET: SINGLE BRANCH -------------------- */

export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params; // CRITICAL FIX: Unwrapping the promise

    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const branch = await prisma.branch.findFirst({
      where: {
        id: id,
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
            personnel: true, // Prisma count filters vary by version; ensure previewFeatures="filteredRelationCount" is on or use total count
            orders: true,
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

/* -------------------- DELETE: SOFT DELETE & LOGGING -------------------- */

export async function DELETE(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    const { id: branchId } = await params; // CRITICAL FIX: Unwrapping the promise

    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const organizationId = session.user.organizationId;

    const result = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, organizationId }
      });

      if (!branch) {
        throw new Error("Branch not found");
      }

      // 1. Clear explicit branch assignments
      await tx.branchAssignment.deleteMany({
        where: { branchId }
      });

      // 2. Unlink personnel referencing this branch as their primary
      await tx.authorizedPersonnel.updateMany({
        where: { branchId, organizationId },
        data: { branchId: null }
      });

      // 3. Execute Soft Delete (Archival)
      const deletedBranch = await tx.branch.update({
        where: { id: branchId },
        data: { 
          deletedAt: new Date(),
          active: false 
        }
      });

      // 4. Critical Security Logging
      const logMetadata: Prisma.JsonObject = { 
        branchName: branch.name, 
        deletedByRole: session.user.role,
        terminalContext: "MASA_TERMINAL_V3"
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