"use server";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ApprovalStatus, Role } from "@prisma/client";

interface UpdateApprovalBody {
  status: ApprovalStatus.APPROVED | ApprovalStatus.REJECTED;
  rejectionNote?: string;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const approval = await prisma.approvalRequest.findUnique({
      where: { id: params.id },
      include: {
        requester: { select: { id: true, name: true, email: true, role: true } },
        approver: { select: { id: true, name: true, email: true } },
        organization: { select: { id: true, name: true } },
      },
    });

    if (!approval || approval.organizationId !== session.user.organizationId) {
      return new NextResponse("Not Found", { status: 404 });
    }

    return NextResponse.json(approval);
  } catch (error) {
    console.error("GET_APPROVAL_ERROR", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const body: UpdateApprovalBody = await request.json();

    const approval = await prisma.approvalRequest.findUnique({
      where: { id: params.id },
    });

    if (!approval || approval.organizationId !== session.user.organizationId) {
      return new NextResponse("Not Found", { status: 404 });
    }

    if (approval.status !== ApprovalStatus.PENDING) {
      return new NextResponse("Request already processed", { status: 400 });
    }

    // Role verification: Admin or Org Owner can override; otherwise must match requiredRole
    const canApprove =
      session.user.isOrgOwner ||
      session.user.role === Role.ADMIN ||
      session.user.role === approval.requiredRole;

    if (!canApprove) {
      return new NextResponse(
        "Insufficient permissions to approve/reject",
        { status: 403 }
      );
    }

    const updatedApproval = await prisma.$transaction(async (tx) => {
      const updated = await tx.approvalRequest.update({
        where: { id: params.id },
        data: {
          status: body.status,
          approverId: session.user.id,
          rejectionNote:
            body.status === ApprovalStatus.REJECTED ? body.rejectionNote : null,
          appliedAt:
            body.status === ApprovalStatus.APPROVED ? new Date() : null,
        },
      });

      // Log decision in ActivityLog
      await tx.activityLog.create({
        data: {
          organizationId: session.user.organizationId,
          branchId: session.user.branchId,
          personnelId: session.user.id,
          approvalId: updated.id,
          action: `APPROVAL_DECISION_${body.status}`,
          critical: true,
          metadata: {
            actionType: updated.actionType,
            targetId: updated.targetId,
          },
        },
      });

      return updated;
    });

    return NextResponse.json(updatedApproval);
  } catch (error) {
    console.error("PATCH_APPROVAL_ERROR", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}