import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Role, Prisma } from "@prisma/client";

interface ReassignRequestBody {
  personnelIds: string[];
  newBranchId: string;
}

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * Bulk reassigns staff from one branch to another while preserving their roles.
 * POST /api/branches/[id]/reassign
 */
export async function POST(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body: ReassignRequestBody = await req.json();
    const { personnelIds, newBranchId } = body;
    const oldBranchId = params.id;
    const organizationId = session.user.organizationId;

    if (!personnelIds || personnelIds.length === 0 || !newBranchId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const reassignedCount = await prisma.$transaction(async (tx) => {
      // 1. Verify target branch belongs to same org and is active
      const targetBranch = await tx.branch.findFirst({
        where: { 
          id: newBranchId, 
          organizationId, 
          deletedAt: null, 
          active: true 
        }
      });

      if (!targetBranch) {
        throw new Error("Target branch not found or inactive.");
      }

      // 2. Fetch current roles to preserve them
      const currentAssignments = await tx.branchAssignment.findMany({
        where: { 
          branchId: oldBranchId, 
          personnelId: { in: personnelIds } 
        }
      });

      if (currentAssignments.length === 0) {
        throw new Error("No valid assignments found to migrate.");
      }

      // 3. Remove old assignments
      await tx.branchAssignment.deleteMany({
        where: { 
          branchId: oldBranchId, 
          personnelId: { in: personnelIds } 
        }
      });

      // 4. Create new assignments maintaining their role
      await tx.branchAssignment.createMany({
        data: currentAssignments.map((a) => ({
          branchId: newBranchId,
          personnelId: a.personnelId,
          role: a.role,
          isPrimary: a.isPrimary
        })),
        skipDuplicates: true
      });

      // 5. Update primary branch reference for floating or directly assigned staff
      await tx.authorizedPersonnel.updateMany({
        where: { 
          id: { in: personnelIds }, 
          branchId: oldBranchId 
        },
        data: { branchId: newBranchId }
      });

      // 6. Record Audit Log
      const logMetadata: Prisma.JsonObject = { 
        fromBranchId: oldBranchId, 
        toBranchId: newBranchId, 
        reassignedCount: currentAssignments.length 
      };

      await tx.activityLog.create({
        data: {
          organizationId,
          branchId: newBranchId,
          personnelId: session.user.id,
          action: "BULK_STAFF_REASSIGNMENT",
          critical: true,
          metadata: logMetadata
        }
      });

      return currentAssignments.length;
    });

    return NextResponse.json({ 
      message: `Successfully reassigned ${reassignedCount} staff members` 
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Reassignment failed";
    console.error("REASSIGNMENT_ERROR:", message);
    
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}