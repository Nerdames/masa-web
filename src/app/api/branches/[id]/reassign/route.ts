// File: src/app/api/branches/[id]/reassign/route.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Role, Prisma, NotificationType } from "@prisma/client";
import { pusherServer } from "@/core/lib/pusher";

interface ReassignRequestBody {
  personnelIds: string[];
  newBranchId: string;
}

// FIX: Next.js 15 requires dynamic segment params to be unwrapped as a Promise
interface RouteParams {
  params: Promise<{
    id: string;
  }>;
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
    const { id: oldBranchId } = await params; // CRITICAL: Awaiting the params object

    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body: ReassignRequestBody = await req.json();
    const { personnelIds, newBranchId } = body;
    const organizationId = session.user.organizationId;

    if (!personnelIds || personnelIds.length === 0 || !newBranchId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Wrap the entire reassignment, logging, and DB notification in a single transaction
    const { reassignedCount, notificationPayload, recipientIds } = await prisma.$transaction(async (tx) => {
      // 1. Verify target branch belongs to same org and is active
      const targetBranch = await tx.branch.findFirst({
        where: { id: newBranchId, organizationId, deletedAt: null, active: true }
      });

      if (!targetBranch) {
        throw new Error("Target branch not found or inactive.");
      }

      // 2. Fetch current roles and names to preserve them and log them
      const currentAssignments = await tx.branchAssignment.findMany({
        where: { branchId: oldBranchId, personnelId: { in: personnelIds } },
        include: { personnel: { select: { name: true, role: true } } }
      });

      if (currentAssignments.length === 0) {
        throw new Error("No valid assignments found to migrate.");
      }

      // 3. Remove old assignments
      await tx.branchAssignment.deleteMany({
        where: { branchId: oldBranchId, personnelId: { in: personnelIds } }
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
        where: { id: { in: personnelIds }, branchId: oldBranchId },
        data: { branchId: newBranchId }
      });

      // 6. Record Detailed Audit Log
      const logMetadata = { 
        fromBranchId: oldBranchId, 
        toBranchId: newBranchId, 
        reassignedPersonnel: currentAssignments.map(a => ({
          id: a.personnelId,
          name: a.personnel.name,
          role: a.role
        }))
      };

      const log = await tx.activityLog.create({
        data: {
          organizationId,
          branchId: newBranchId,
          personnelId: session.user.id,
          action: "BULK_STAFF_REASSIGNMENT",
          critical: true,
          metadata: logMetadata as Prisma.JsonObject
        }
      });

      // 7. Identify Notification Recipients (Admins, Org Owners, and Receiving Managers)
      const recipients = await tx.authorizedPersonnel.findMany({
        where: {
          organizationId,
          OR: [
            { role: Role.ADMIN },
            { role: Role.MANAGER, branchId: newBranchId },
            { isOrgOwner: true }
          ],
          disabled: false
        },
        select: { id: true }
      });

      // 8. Create Database Notifications
      let notification = null;
      if (recipients.length > 0) {
        notification = await tx.notification.create({
          data: {
            organizationId,
            branchId: newBranchId,
            type: NotificationType.INFO,
            title: "Staff Reassignment",
            message: `${currentAssignments.length} staff members have been deployed to ${targetBranch.name}.`,
            activityLogId: log.id,
            recipients: {
              create: recipients.map(r => ({ personnelId: r.id }))
            }
          }
        });
      }

      return { 
        reassignedCount: currentAssignments.length, 
        notificationPayload: notification,
        recipientIds: recipients.map(r => r.id)
      };
    });

    // 9. Dispatch Real-Time Pusher Events (Outside the transaction to prevent blocking)
    if (notificationPayload && recipientIds.length > 0) {
      const alertPayload = {
        id: notificationPayload.id,
        kind: "PUSH",
        type: notificationPayload.type,
        title: notificationPayload.title,
        message: notificationPayload.message,
        activityId: notificationPayload.activityLogId,
        createdAt: Date.now(),
      };

      await Promise.allSettled(
        recipientIds.map((id) =>
          pusherServer.trigger(`user-${id}`, "new-alert", alertPayload)
        )
      );
    }

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