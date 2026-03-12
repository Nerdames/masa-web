import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";

/**
 * Bulk reassigns staff from one branch to another while preserving their roles.
 * POST /api/dashboard/branches/[id]/reassign
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    // Auth check: Admin or OrgOwner
    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { personnelIds, newBranchId }: { personnelIds: string[]; newBranchId: string } = await req.json();
    const oldBranchId = params.id;
    const organizationId = session.user.organizationId;

    if (!personnelIds || personnelIds.length === 0 || !newBranchId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verify the target branch belongs to the same organization and is active
      const targetBranch = await tx.branch.findFirst({
        where: { id: newBranchId, organizationId, deletedAt: null, active: true }
      });

      if (!targetBranch) throw new Error("Target branch not found or inactive.");

      // 2. Fetch current roles from the old branch to preserve them
      const currentAssignments = await tx.branchAssignment.findMany({
        where: { 
          branchId: oldBranchId, 
          personnelId: { in: personnelIds } 
        }
      });

      if (currentAssignments.length === 0) throw new Error("No valid assignments found to migrate.");

      // 3. Remove old assignments
      await tx.branchAssignment.deleteMany({
        where: { branchId: oldBranchId, personnelId: { in: personnelIds } }
      });

      // 4. Create new assignments with original roles
      await tx.branchAssignment.createMany({
        data: currentAssignments.map((a) => ({
          branchId: newBranchId,
          personnelId: a.personnelId,
          role: a.role
        })),
        skipDuplicates: true // Prevents error if already assigned
      });

      // 5. Update primary branchId for personnel whose primary was the old branch
      await tx.authorizedPersonnel.updateMany({
        where: { id: { in: personnelIds }, branchId: oldBranchId },
        data: { branchId: newBranchId }
      });

      // 6. Audit Log
      await tx.activityLog.create({
        data: {
          organizationId,
          branchId: newBranchId,
          personnelId: session.user.id,
          action: "BULK_STAFF_REASSIGNMENT",
          critical: true,
          metadata: { 
            from: oldBranchId, 
            to: newBranchId, 
            count: currentAssignments.length 
          }
        }
      });

      return currentAssignments.length;
    });

    return NextResponse.json({ 
      message: `Successfully reassigned ${result} staff members` 
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Reassignment failed";
    console.error("REASSIGNMENT_ERROR:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}