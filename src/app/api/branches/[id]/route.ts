import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Role, ActorType, Severity } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/* -------------------- GET: SINGLE BRANCH -------------------- */

export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const branch = await prisma.branch.findFirst({
      where: { id, organizationId: session.user.organizationId },
      include: {
        branchAssignments: {
          include: {
            personnel: {
              select: { id: true, name: true, email: true, role: true, staffCode: true }
            }
          }
        },
        _count: {
          select: { branchProducts: true, personnel: true, orders: true, activityLogs: true }
        }
      }
    });

    if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

    return NextResponse.json(branch);
  } catch (error) {
    console.error("GET_SINGLE_BRANCH_ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------- DELETE: DECOMMISSIONING -------------------- */

export async function DELETE(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const requestId = uuidv4();
  try {
    const session = await getServerSession(authOptions);
    const { id: branchId } = await params;

    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const organizationId = session.user.organizationId;

    const result = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, organizationId }
      });

      if (!branch) throw new Error("Branch not found");

      // 1. Clear assignments and unlink personnel
      await tx.branchAssignment.deleteMany({ where: { branchId } });
      await tx.authorizedPersonnel.updateMany({
        where: { branchId, organizationId },
        data: { branchId: null }
      });

      // 2. Soft Delete
      const deletedBranch = await tx.branch.update({
        where: { id: branchId },
        data: { deletedAt: new Date(), active: false }
      });

      // 3. Forensic Log
      await tx.activityLog.create({
        data: {
          organizationId,
          branchId,
          actorId: session.user.id,
          actorType: ActorType.USER,
          actorRole: session.user.role,
          action: "BRANCH_DECOMMISSIONED",
          severity: Severity.CRITICAL,
          critical: true,
          description: `Branch "${branch.name}" was decommissioned. All staff were unlinked and active status was revoked.`,
          targetId: branchId,
          targetType: "BRANCH",
          requestId,
          before: branch as any,
          after: deletedBranch as any,
        }
      });

      return deletedBranch;
    });

    return NextResponse.json({ message: "Branch decommissioned", id: result.id });
  } catch (error: any) {
    const status = error.message === "Branch not found" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}