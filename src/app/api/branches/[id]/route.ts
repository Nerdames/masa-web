import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/infrastructure/auth/config"; // Infrastructure auth engine
import prisma from "@/infrastructure/prisma/client"; // Singleton database client
import { authorize } from "@/server/permissions/enforcer"; // Server permissions engine
import { createAuditLog } from "@/modules/audit/server/audit.service"; // Enterprise module service
import { 
  PermissionAction, 
  Resource, 
  Severity
} from "@prisma/client";
import crypto from "crypto";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET: RETRIEVE SINGLE BRANCH DETAILS
 * Fortified with nested relation filters, multi-tenant boundaries, and RBAC validation.
 */
export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. RBAC CHECK: Strict multi-tenant authorization resolving custom or baseline permissions
    const auth = authorize({
      role: session.user.role,
      isOrgOwner: session.user.isOrgOwner,
      action: PermissionAction.READ,
      resources: Resource.BRANCH,
      userPermissions: session.user.permissions,
    });

    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason || "Forbidden" }, { status: 403 });
    }

    // 2. RETRIEVAL: Filter by ID and Organization to guarantee cross-tenant isolation
    const branch = await prisma.branch.findFirst({
      where: { 
        id, 
        organizationId: session.user.organizationId,
        deletedAt: null // Exclude decommissioned entities
      },
      include: {
        _count: {
          select: {
            personnel: true,
            branchAssignments: true,
            orders: true,
            invoices: true,
            sales: true,
            posSessions: true,
            activityLogs: true,
            branchProducts: true,
            expenses: true,
          }
        },
        // Securely map assignments by looking into personnel status to resolve ghost references
        branchAssignments: {
          where: {
            personnel: {
              disabled: false,
              deletedAt: null
            }
          },
          include: {
            personnel: {
              select: {
                id: true,
                name: true,
                staffCode: true,
                role: true,
                email: true,
              }
            }
          }
        },
        organization: {
          select: { name: true }
        }
      }
    });

    if (!branch) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }

    return NextResponse.json(branch);
  } catch (error) {
    console.error("[BRANCH_GET_ERR]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE: BRANCH DECOMMISSIONING (SOFT DELETE)
 * Fortified with Personnel Cleanup, Float Prevention, and Forensic Audit Logs.
 */
export async function DELETE(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    const { id: branchId } = await params;

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. RBAC CHECK: Verify administrative delete capabilities
    const auth = authorize({
      role: session.user.role,
      isOrgOwner: session.user.isOrgOwner,
      action: PermissionAction.DELETE,
      resources: Resource.BRANCH,
      userPermissions: session.user.permissions,
    });

    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason || "Insufficient authority" }, { status: 403 });
    }

    const organizationId = session.user.organizationId;

    // 2. ATOMIC TRANSACTION: Ensuring data consistency and structural integrity
    const result = await prisma.$transaction(async (tx) => {
      // A. Verify entity ownership state before modification
      const branch = await tx.branch.findFirst({
        where: { id: branchId, organizationId }
      });

      if (!branch) throw new Error("BranchNotFound");

      // B. PREVENT FLOAT BUGS: Clear out primary branch pointers to eliminate dangling assignments
      await tx.authorizedPersonnel.updateMany({
        where: { branchId, organizationId },
        data: { branchId: null }
      });

      // C. CLEANUP: Delete active bridge references explicitly
      await tx.branchAssignment.deleteMany({
        where: { branchId }
      });

      // D. SOFT DELETE: Shift visibility constraints and mark timestamp
      const decommissionedBranch = await tx.branch.update({
        where: { id: branchId },
        data: { 
          active: false, 
          deletedAt: new Date() 
        }
      });

      // E. FORENSIC AUDIT: Register linear integrity event in the cryptographic ledger
      await createAuditLog(tx, {
        action: "BRANCH_DECOMMISSIONED",
        resource: Resource.BRANCH,
        resourceId: branchId,
        organizationId,
        branchId,
        actorId: session.user.id,
        actorRole: session.user.role,
        severity: Severity.CRITICAL,
        critical: true,
        description: `Branch "${branch.name}" was successfully decommissioned. All staff entities were unlinked and bridge rows dropped.`,
        changes: { from: branch, to: decommissionedBranch },
        requestId,
        metadata: {
          method: "API_DELETE",
          impact: "Personnel references safely unlinked",
        }
      });

      return decommissionedBranch;
    }, {
      isolationLevel: "Serializable", // Complete isolation level protecting against mutation race states
    });

    return NextResponse.json({ 
      success: true, 
      message: "Branch successfully decommissioned", 
      id: result.id 
    });

  } catch (error: any) {
    console.error(`[BRANCH_DELETE_ERR][Req:${requestId}]:`, error);
    
    if (error.message === "BranchNotFound") {
      return NextResponse.json({ error: "Branch not found or already deleted" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to decommission branch", requestId }, 
      { status: 500 }
    );
  }
}