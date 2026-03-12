import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // Adjust path to your auth config
import prisma from "@/lib/prisma";
import { CriticalAction, Role, ApprovalStatus, Prisma } from "@prisma/client";

interface CreateApprovalBody {
  actionType: CriticalAction;
  changes: Prisma.InputJsonValue;
  requiredRole?: Role;
  targetType?: string;
  targetId?: string;
  expiresAt?: string;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as ApprovalStatus | null;
  const branchId = searchParams.get("branchId");

  try {
    const approvals = await prisma.approvalRequest.findMany({
      where: {
        organizationId: session.user.organizationId,
        ...(status && { status }),
        ...(branchId && { branchId }),
      },
      include: {
        requester: { select: { name: true, email: true, role: true } },
        approver: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(approvals);
  } catch (error: unknown) {
    console.error("GET_APPROVALS_ERROR", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const body: CreateApprovalBody = await request.json();

    const approval = await prisma.approvalRequest.create({
      data: {
        organizationId: session.user.organizationId,
        branchId: session.user.branchId,
        requesterId: session.user.id,
        actionType: body.actionType,
        changes: body.changes,
        targetType: body.targetType,
        targetId: body.targetId,
        requiredRole: body.requiredRole ?? Role.MANAGER,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    // Log the creation of the request
    await prisma.activityLog.create({
      data: {
        organizationId: session.user.organizationId,
        branchId: session.user.branchId,
        personnelId: session.user.id,
        action: `APPROVAL_REQUEST_CREATED_${body.actionType}`,
        metadata: { approvalId: approval.id },
      },
    });

    return NextResponse.json(approval);
  } catch (error: unknown) {
    console.error("POST_APPROVAL_ERROR", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}