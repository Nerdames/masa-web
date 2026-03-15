import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ApprovalStatus, Role } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { 
      actionType, 
      targetId, 
      organizationId, 
      branchId, 
      changes, 
      metadata 
    } = body;

    // Transaction: Ensure both the request and the log succeed or fail together
    const result = await prisma.$transaction(async (tx) => {
      
      // 1. Create the Approval Request
      const approvalRequest = await tx.approvalRequest.create({
        data: {
          organizationId,
          branchId,
          requesterId: session.user.id,
          actionType,
          status: ApprovalStatus.PENDING,
          requiredRole: Role.ADMIN, // Default required role for profile changes
          changes, // JSON payload containing { email: ... } or { newPassword: ... }
          targetId,
          targetType: "AuthorizedPersonnel",
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 day expiry
        },
      });

      // 2. Log the activity as a critical action
      await tx.activityLog.create({
        data: {
          organizationId,
          branchId,
          personnelId: session.user.id,
          action: `Requested ${actionType.replace("_", " ").toLowerCase()}`,
          critical: true,
          approvalId: approvalRequest.id,
          metadata: {
            ip: req.headers.get("x-forwarded-for") || "unknown",
            userAgent: req.headers.get("user-agent") || "unknown",
          },
        },
      });

      return approvalRequest;
    });

    return NextResponse.json(result, { status: 201 });

  } catch (error: unknown) {
    console.error("[APPROVAL_REQUEST_POST]", error);
    return NextResponse.json(
      { message: "Failed to process approval request" }, 
      { status: 500 }
    );
  }
}