import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ApprovalStatus, Prisma } from "@prisma/client";
import { applyActionDirectly, ActionPayload } from "@/lib/actions";
import { createNotification } from "@/lib/notifications";
import { pusherServer } from "@/lib/pusher";

/* -----------------------------
   PATCH APPROVAL REQUEST (APPROVE/REJECT)
----------------------------- */
interface PatchApprovalBody {
  decision: "APPROVED" | "REJECTED";
  rejectionNote?: string;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const device = req.headers.get("user-agent") ?? "unknown";

  try {
    const body = (await req.json()) as PatchApprovalBody;
    const { decision, rejectionNote } = body;

    return await prisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.findUnique({
        where: { id: params.id },
      });

      if (!request || request.status !== ApprovalStatus.PENDING) {
        throw new Error(
          "Request is no longer valid or has already been processed."
        );
      }

      const updatedRequest = await tx.approvalRequest.update({
        where: { id: params.id },
        data: {
          status: decision,
          approverId: session.user.id,
          rejectionNote: decision === "REJECTED" ? rejectionNote : null,
          appliedAt: decision === "APPROVED" ? new Date() : null,
        },
      });

      /* ----------------------------------
         Handle APPROVAL
      ---------------------------------- */
      if (decision === "APPROVED") {
        const changes = request.changes as unknown as ActionPayload;
        await applyActionDirectly(
          tx,
          request.actionType,
          request.targetId || "",
          changes,
          session.user.id,
          request.organizationId,
          request.branchId
        );

        await tx.activityLog.create({
          data: {
            organizationId: request.organizationId,
            branchId: request.branchId,
            personnelId: session.user.id,
            action: `APPROVED_${request.actionType}`,
            critical: true,
            ipAddress: ip,
            deviceInfo: device,
            metadata: {
              approvalId: request.id,
              targetId: request.targetId,
              changes,
              approvedBy: session.user.id,
              timestamp: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
      }

      /* ----------------------------------
         Handle REJECTION
      ---------------------------------- */
      if (decision === "REJECTED") {
        await tx.activityLog.create({
          data: {
            organizationId: request.organizationId,
            branchId: request.branchId,
            personnelId: session.user.id,
            action: `REJECTED_${request.actionType}`,
            critical: false,
            ipAddress: ip,
            deviceInfo: device,
            metadata: {
              approvalId: request.id,
              targetId: request.targetId,
              rejectionNote,
              rejectedBy: session.user.id,
              timestamp: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
      }

      /* ----------------------------------
         Notify Admins/Managers + Trigger Pusher
      ---------------------------------- */
      try {
        const eligiblePersonnel = await tx.authorizedPersonnel.findMany({
          where: {
            organizationId: request.organizationId,
            isLocked: false,
            role: { in: ["ADMIN", "MANAGER"] },
          },
          select: { id: true },
        });

        const recipientIds = eligiblePersonnel.map((p) => p.id);
        if (recipientIds.length > 0) {
          const notification = await createNotification({
            organizationId: request.organizationId,
            branchId: request.branchId,
            recipientIds,
            type: "SECURITY",
            title:
              decision === "APPROVED"
                ? `Approved: ${request.actionType.replace(/_/g, " ")}`
                : `Rejected: ${request.actionType.replace(/_/g, " ")}`,
            message: `Approval request ${request.id} was ${decision.toLowerCase()} by ${session.user.name}`,
            approvalId: request.id,
          });

          // Broadcast lightweight Pusher event for live frontend updates
          try {
            await pusherServer.trigger(
              `org-${request.organizationId}`,
              "new-notification",
              notification
            );
          } catch (pusherErr) {
            console.error("[APPROVAL_PUSHER_ERROR]", pusherErr);
          }
        }
      } catch (notifyErr) {
        console.error("[APPROVAL_NOTIFICATION_ERROR]", notifyErr);
      }

      return NextResponse.json(updatedRequest);
    });
  } catch (error: unknown) {
    console.error("[APPROVAL_PATCH_ERROR]", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}