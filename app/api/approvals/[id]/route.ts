import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { ApprovalStatus, Role } from "@prisma/client";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { status, rejectionNote } = await request.json(); // status: "APPROVED" or "REJECTED"

    // 1. Verify Actor is Admin
    const actor = await prisma.authorizedPersonnel.findUnique({
      where: { id: session.user.id },
      include: { branchAssignments: true }
    });

    const isAdmin = actor?.isOrgOwner || actor?.branchAssignments.some(a => a.role === Role.ADMIN);
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // 2. Process Approval in Transaction
    const result = await prisma.$transaction(async (tx) => {
      const approval = await tx.approvalRequest.findUnique({
        where: { id: params.id },
        include: { requester: true }
      });

      if (!approval || approval.status !== ApprovalStatus.PENDING) {
        throw new Error("Request no longer pending");
      }

      if (status === ApprovalStatus.APPROVED) {
        const changes = approval.changes as any;

        // COMMIT SENSITIVE CHANGES
        await tx.authorizedPersonnel.update({
          where: { id: approval.requesterId },
          data: {
            ...(changes.email && { email: changes.email }),
            ...(changes.password && { password: changes.password }),
          }
        });

        // UPDATE REQUEST STATUS
        return await tx.approvalRequest.update({
          where: { id: params.id },
          data: { 
            status: ApprovalStatus.APPROVED, 
            approverId: session.user.id,
            appliedAt: new Date() 
          }
        });
      } else {
        // REJECT REQUEST
        return await tx.approvalRequest.update({
          where: { id: params.id },
          data: { 
            status: ApprovalStatus.REJECTED, 
            approverId: session.user.id,
            rejectionNote 
          }
        });
      }
    });

    return NextResponse.json({ success: true, data: result });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}