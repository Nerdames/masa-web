import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { logActivity } from "@/lib/audit";
import { Role, CriticalAction, ApprovalStatus, NotificationType } from "@prisma/client";
import { pusherServer } from "@/core/lib/pusher";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { subject, message, category, metadata } = body;

    // 1. Identify Target Recipients (Admins or Branch Managers)
    const recipients = await prisma.authorizedPersonnel.findMany({
      where: {
        organizationId: metadata.organizationId,
        disabled: false,
        OR: [
          { role: Role.ADMIN },
          metadata.branchId ? { role: Role.MANAGER, branchId: metadata.branchId } : {},
        ],
        NOT: { id: metadata.personnelId }
      },
      select: { id: true }
    });

    // 2. Atomic Creation: Approval + Notification + Recipients
    const result = await prisma.$transaction(async (tx) => {
      // Create Approval Request
      const approval = await tx.approvalRequest.create({
        data: {
          organizationId: metadata.organizationId,
          branchId: metadata.branchId,
          requesterId: metadata.personnelId,
          actionType: metadata.actionKey as CriticalAction,
          status: ApprovalStatus.PENDING,
          requiredRole: Role.ADMIN, // Default to Admin for support
          changes: { subject, message, category },
        },
      });

      // Create Notification
      const notification = await tx.notification.create({
        data: {
          organizationId: metadata.organizationId,
          branchId: metadata.branchId,
          type: NotificationType.APPROVAL_REQUIRED,
          title: `Support: ${subject}`,
          message: `Request from ${session.user.name}`,
          actionTrigger: metadata.actionKey as CriticalAction,
          approvalId: approval.id,
          recipients: {
            create: recipients.map((r) => ({ personnelId: r.id })),
          },
        },
      });

      return { approval, notification };
    });

    // 3. Broadcast to Pusher for Real-time Alerts
    await Promise.allSettled(
      recipients.map((r) =>
        pusherServer.trigger(`user-${r.id}`, "new-alert", {
          id: result.notification.id,
          kind: "PUSH",
          type: "APPROVAL_REQUIRED",
          title: `Support: ${subject}`,
          message: `Approval required for ${metadata.actionKey.replace(/_/g, ' ')}`,
          approvalId: result.approval.id,
        })
      )
    );

    // 4. Audit Log
    await logActivity({
      personnelId: metadata.personnelId,
      organizationId: metadata.organizationId,
      branchId: metadata.branchId,
      action: "SUPPORT_TICKET_SUBMITTED",
      meta: JSON.stringify({ subject, approvalId: result.approval.id })
    });

    return NextResponse.json({ success: true, requestId: result.approval.id });

  } catch (error: any) {
    console.error("[SUPPORT_POST_ERROR]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}