import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Role, Prisma, NotificationType, ActorType, Severity } from "@prisma/client";
import { pusherServer } from "@/core/lib/pusher";
import { v4 as uuidv4 } from "uuid";

interface ReassignRequestBody {
  personnelIds: string[];
  newBranchId: string;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const requestId = uuidv4();
  try {
    const session = await getServerSession(authOptions);
    const { id: oldBranchId } = await params;

    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { personnelIds, newBranchId }: ReassignRequestBody = await req.json();
    const organizationId = session.user.organizationId;

    if (!personnelIds?.length || !newBranchId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Validations
      const [oldBranch, targetBranch] = await Promise.all([
        tx.branch.findUnique({ where: { id: oldBranchId } }),
        tx.branch.findFirst({ where: { id: newBranchId, organizationId, active: true } })
      ]);

      if (!targetBranch || !oldBranch) {
        throw new Error("Source or Target branch invalid.");
      }

      const currentAssignments = await tx.branchAssignment.findMany({
        where: { branchId: oldBranchId, personnelId: { in: personnelIds } },
        include: { personnel: { select: { name: true } } }
      });

      if (currentAssignments.length === 0) throw new Error("No valid assignments found.");

      // 2. Migration Logic
      await tx.branchAssignment.deleteMany({
        where: { branchId: oldBranchId, personnelId: { in: personnelIds } }
      });

      await tx.branchAssignment.createMany({
        data: currentAssignments.map((a) => ({
          branchId: newBranchId,
          personnelId: a.personnelId,
          role: a.role,
          isPrimary: a.isPrimary
        })),
        skipDuplicates: true
      });

      await tx.authorizedPersonnel.updateMany({
        where: { id: { in: personnelIds }, branchId: oldBranchId },
        data: { branchId: newBranchId }
      });

      // 3. Forensic Forensic Audit Log
      const log = await tx.activityLog.create({
        data: {
          organizationId,
          branchId: newBranchId,
          actorId: session.user.id,
          actorType: ActorType.USER,
          actorRole: session.user.role,
          action: "BULK_STAFF_REASSIGNMENT",
          severity: Severity.HIGH,
          critical: true,
          description: `Migrated ${currentAssignments.length} staff members from "${oldBranch.name}" to "${targetBranch.name}".`,
          requestId,
          targetId: newBranchId,
          targetType: "BRANCH",
          metadata: { 
            from: oldBranchId, 
            to: newBranchId, 
            staff: currentAssignments.map(a => a.personnel.name) 
          } as Prisma.JsonObject
        }
      });

      // 4. Notification Setup
      const recipients = await tx.authorizedPersonnel.findMany({
        where: {
          organizationId,
          OR: [{ role: Role.ADMIN }, { role: Role.MANAGER, branchId: newBranchId }, { isOrgOwner: true }],
          disabled: false
        },
        select: { id: true }
      });

      let notification = null;
      if (recipients.length > 0) {
        notification = await tx.notification.create({
          data: {
            organizationId,
            branchId: newBranchId,
            type: NotificationType.INFO,
            title: "Staff Deployment",
            message: `${currentAssignments.length} personnel reassigned to ${targetBranch.name}.`,
            activityLogId: log.id,
            recipients: { create: recipients.map(r => ({ personnelId: r.id })) }
          }
        });
      }

      return { 
        count: currentAssignments.length, 
        notification, 
        recipientIds: recipients.map(r => r.id) 
      };
    });

    // Real-time Push (Outside Transaction)
    if (result.notification && result.recipientIds.length > 0) {
      const alert = {
        id: result.notification.id,
        type: result.notification.type,
        title: result.notification.title,
        message: result.notification.message,
        activityId: result.notification.activityLogId,
        createdAt: Date.now(),
      };
      await Promise.allSettled(
        result.recipientIds.map((id) => pusherServer.trigger(`user-${id}`, "new-alert", alert))
      );
    }

    return NextResponse.json({ message: `Successfully reassigned ${result.count} staff members` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.message.includes("not found") ? 404 : 500 });
  }
}