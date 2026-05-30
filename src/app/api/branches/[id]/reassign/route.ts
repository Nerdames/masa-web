/**
 * src/app/api/branches/[id]/reassign/route.ts
 * PRODUCTION-GRADE STAFF DEPLOYMENT ENGINE (V3.0)
 * Resource: BRANCH | Action: UPDATE
 * * FIXED: Next.js 15 Async Params unwrapping.
 * FIXED: Forensic Audit Engine V2.6 integration.
 * FIXED: Serializable isolation for staff migration integrity.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/infrastructure/auth/config"; // Infrastructure auth engine
import prisma from "@/infrastructure/prisma/client"; // Singleton database client
import { authorize } from "@/server/permissions/enforcer"; // Server permissions engine
import { createAuditLog } from "@/modules/audit/server/audit.service"; // Enterprise module service
import { pusherServer } from "@/infrastructure/pusher/client"; // Infrastructure real-time broadcaster
import { 
  Role, 
  PermissionAction, 
  Resource, 
  NotificationType, 
  Severity 
} from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

interface ReassignRequestBody {
  personnelIds: string[];
  newBranchId: string;
}

/**
 * POST: Bulk Staff Reassignment
 * Migrates personnel between nodes with full cryptographic integrity.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> } // NEXT.JS 15: Type as Promise
): Promise<NextResponse> {
  const requestId = uuidv4();
  
  // 1. UNWRAP ASYNC PARAMS (Next.js 15 FIX)
  const { id: oldBranchId } = await params;

  try {
    // 2. AUTHENTICATION & RBAC HIERARCHY
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const organizationId = session.user.organizationId;

    // Use core authorize engine with session permissions
    const auth = authorize({
      role: session.user.role,
      isOrgOwner: session.user.isOrgOwner,
      userPermissions: session.user.permissions || [],
      action: PermissionAction.UPDATE,
      resources: Resource.PERSONNEL, // Targeting Personnel reassignment
    });

    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason || "Forbidden" }, { status: 403 });
    }

    const body: ReassignRequestBody = await req.json();
    const { personnelIds, newBranchId } = body;

    // 3. SAFETY CHECKS: PREVENT NO-OP & CORRUPTION
    if (!personnelIds?.length || !newBranchId) {
      return NextResponse.json({ error: "Invalid payload: personnelIds and newBranchId required." }, { status: 400 });
    }

    if (oldBranchId === newBranchId) {
      return NextResponse.json({ error: "Source and target branch cannot be the same." }, { status: 400 });
    }

    // 4. ATOMIC TRANSACTION (SERIALIZABLE ISOLATION)
    const result = await prisma.$transaction(async (tx) => {
      
      // 4.1 VALIDATE INFRASTRUCTURE NODES
      const [oldBranch, targetBranch] = await Promise.all([
        tx.branch.findUnique({ 
          where: { id: oldBranchId, organizationId },
          select: { id: true, name: true } 
        }),
        tx.branch.findFirst({ 
          where: { id: newBranchId, organizationId, active: true },
          select: { id: true, name: true } 
        })
      ]);

      if (!oldBranch) throw new Error("Source branch not found or access denied.");
      if (!targetBranch) throw new Error("Target branch is inactive or does not exist.");

      // 4.2 DETECT GHOST/FLOAT ASSIGNMENTS
      // Verify personnel exist in the ORG and are currently in the SOURCE branch
      const validAssignments = await tx.branchAssignment.findMany({
        where: { 
          branchId: oldBranchId, 
          personnelId: { in: personnelIds },
          personnel: { organizationId } // Essential Cross-org safety check
        },
        include: { 
          personnel: { select: { id: true, name: true } } 
        }
      });

      if (validAssignments.length === 0) {
        throw new Error("No valid personnel found for reassignment in the source branch.");
      }

      const activePersonnelIds = validAssignments.map(a => a.personnelId);
      const staffNames = validAssignments.map(a => a.personnel.name).join(", ");

      // 4.3 EXECUTE MIGRATION (SOP SYNC)
      
      // A. Terminate old assignments
      await tx.branchAssignment.deleteMany({
        where: { branchId: oldBranchId, personnelId: { in: activePersonnelIds } }
      });

      // B. Create new assignments (Preserving Roles)
      await tx.branchAssignment.createMany({
        data: validAssignments.map((a) => ({
          branchId: newBranchId,
          personnelId: a.personnelId,
          role: a.role,
          isPrimary: a.isPrimary
        })),
        skipDuplicates: true
      });

      // C. Update primary pointer on Personnel record
      await tx.authorizedPersonnel.updateMany({
        where: { 
          id: { in: activePersonnelIds }, 
          organizationId 
        },
        data: { branchId: newBranchId }
      });

      // 4.4 FORENSIC AUDIT (V2.6)
      const auditLog = await createAuditLog(tx, {
        action: "BULK_STAFF_REASSIGNMENT",
        resource: Resource.BRANCH,
        resourceId: newBranchId,
        organizationId,
        branchId: oldBranchId,
        actorId: session.user.id,
        actorRole: session.user.role,
        severity: Severity.HIGH,
        critical: true,
        description: `Deployment: Moved ${validAssignments.length} personnel from ${oldBranch.name} to ${targetBranch.name}.`,
        changes: {
          from: { branchId: oldBranchId, branchName: oldBranch.name, staff: staffNames },
          to: { branchId: newBranchId, branchName: targetBranch.name }
        },
        metadata: { 
          requestId,
          personnelCount: validAssignments.length 
        },
        requestId
      });

      // 4.5 NOTIFICATION DISPATCH (Recipients: Admins, Owners, Target Branch Manager)
      const recipients = await tx.authorizedPersonnel.findMany({
        where: {
          organizationId,
          OR: [
            { isOrgOwner: true },
            { role: Role.ADMIN },
            { role: Role.MANAGER, branchId: newBranchId }
          ],
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
            title: "Staff Deployment Executed",
            message: `${validAssignments.length} personnel reassigned to ${targetBranch.name}.`,
            activityLogId: auditLog.id,
            recipients: {
              create: recipients.map(r => ({ personnelId: r.id }))
            }
          }
        });
      }

      return { 
        count: validAssignments.length, 
        notification, 
        recipientIds: recipients.map(r => r.id) 
      };
    }, {
      isolationLevel: "Serializable", // Prevents concurrent edits from creating duplicate links
      timeout: 20000 
    });

    // 5. REAL-TIME PROPAGATION (POST-TRANSACTION)
    if (result.notification && result.recipientIds.length > 0) {
      const alertPayload = {
        id: result.notification.id,
        type: result.notification.type,
        title: result.notification.title,
        message: result.notification.message,
        activityId: result.notification.activityLogId,
        createdAt: new Date().toISOString(),
      };

      result.recipientIds.forEach((uid) => {
        pusherServer.trigger(`user-${uid}`, "new-alert", alertPayload).catch(e => 
          console.error(`[Pusher:Error] User ${uid}:`, e)
        );
      });
    }

    return NextResponse.json({ 
      success: true,
      message: `Successfully reassigned ${result.count} personnel to new branch.`,
      requestId 
    });

  } catch (error: any) {
    console.error(`[API_BRANCH_REASSIGN_ERROR] [Req: ${requestId}]:`, error);
    
    const isNotFound = error.message.includes("not found");
    return NextResponse.json({ 
      error: error.message || "An infrastructure error occurred during staff migration.",
      requestId 
    }, { status: isNotFound ? 404 : 400 });
  }
}