import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import { authorize } from "@/core/lib/permission";
import prisma from "@/core/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { 
  Prisma, 
  Role, 
  Severity, 
  Resource, 
  PermissionAction,
  POSSessionStatus
} from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { createAuditLog } from "@/core/lib/audit";

/* -------------------- TYPES & DTOS -------------------- */

interface BranchPersonnelDTO {
  id: string;
  name: string | null;
  email: string;
  role: Role; 
  assignmentRole: Role; 
  isPrimary: boolean;
  staffCode: string | null;
}

// Fortified DTO: Aggregated financials converted to string to prevent Prisma.Decimal Float precision loss
interface BranchDTO extends Omit<Prisma.BranchGetPayload<{
  include: {
    branchAssignments: { include: { personnel: true } };
    _count: true;
  }
}>, 'salesTotal' | 'expensesTotal'> {
  salesTotal: string; 
  expensesTotal: string;
  operationalStatus: {
    hasOpenPOS: boolean;
    activeStaffCount: number;
  }
}

interface BranchListResponse {
  data: BranchDTO[];
  summary: {
    total: number;
    active: number;
    inactive: number;
    deleted: number;
  };
  recentLogs: any[]; 
  page: number;
  pageSize: number;
}

interface CreateBranchBody {
  name: string;
  location?: string;
  active?: boolean;
  personnel?: { personnelId: string; role: Role; isPrimary?: boolean }[];
}

interface UpdateBranchBody {
  id: string;
  name?: string;
  location?: string;
  active?: boolean;
  deletedAt?: string | null;
}

/* -------------------- HELPER: PERMISSION CHECK -------------------- */

/**
 * Standardized Authorization Layer
 * Verifies base roles (from auth.ts) and falls back to granular RBAC (from permission.ts)
 */
async function verifyAccess(action: PermissionAction) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized", status: 401 };

  // Use the injected permissions from auth.ts and run through the permission.ts engine
  const authResult = authorize({
    role: session.user.role,
    isOrgOwner: session.user.isOrgOwner,
    action,
    resources: Resource.BRANCH,
    userPermissions: session.user.permissions,
  });

  if (!authResult.allowed) {
    return { error: authResult.reason || "Insufficient permissions to access the BRANCH resource.", status: 403 };
  }

  return { session, organizationId: session.user.organizationId };
}

/* -------------------- GET: LIST & ANALYTICS -------------------- */

export async function GET(
  req: NextRequest
): Promise<NextResponse<BranchListResponse | { error: string }>> {
  try {
    const auth = await verifyAccess(PermissionAction.READ);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    
    const { organizationId } = auth;
    const { searchParams } = new URL(req.url);

    const q = searchParams.get("search")?.trim() ?? "";
    const status = searchParams.get("status") ?? "all";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10)); // Capped at 100
    const skip = (page - 1) * pageSize;

    const baseWhere: Prisma.BranchWhereInput = {
      organizationId,
      ...(q && {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { location: { contains: q, mode: "insensitive" } }
        ]
      }),
    };

    const filterWhere: Prisma.BranchWhereInput = {
      ...baseWhere,
      ...(status === "active" && { active: true, deletedAt: null }),
      ...(status === "inactive" && { active: false, deletedAt: null }),
      ...(status === "deleted" && { deletedAt: { not: null } }),
      ...(status === "all" && { deletedAt: null }),
    };

    const [total, active, inactive, deleted, branches, salesTotals, expenseTotals, recentLogs] = await Promise.all([
      prisma.branch.count({ where: filterWhere }),
      prisma.branch.count({ where: { ...baseWhere, active: true, deletedAt: null } }),
      prisma.branch.count({ where: { ...baseWhere, active: false, deletedAt: null } }),
      prisma.branch.count({ where: { ...baseWhere, deletedAt: { not: null } } }),
      
      // Enriched Fetch: Pulling extensive relations for a rich operational dashboard
      prisma.branch.findMany({
        where: filterWhere,
        orderBy: { updatedAt: "desc" },
        skip,
        take: pageSize,
        include: {
          branchAssignments: {
            where: { personnel: { deletedAt: null } },
            include: {
              personnel: {
                select: { id: true, name: true, email: true, staffCode: true, role: true }
              }
            }
          },
          _count: {
            select: {
              personnel: { where: { deletedAt: null } },
              branchProducts: { where: { stock: { gt: 0 } } }, // Only count active variants
              orders: { where: { deletedAt: null } },
              activityLogs: true,
              posSessions: { where: { status: POSSessionStatus.OPEN } },
              refunds: { where: { status: "APPROVED" } }
            }
          }
        }
      }),
      
      // Financial Aggregations
      prisma.sale.groupBy({
        by: ["branchId"],
        where: { organizationId, status: "COMPLETED", deletedAt: null },
        _sum: { total: true },
      }),
      prisma.expense.groupBy({
        by: ["branchId"],
        where: { organizationId, status: { not: "VOIDED" } },
        _sum: { amount: true }
      }),
      
      // Forensic Audit Trailing
      prisma.activityLog.findMany({
        where: { organizationId, targetType: Resource.BRANCH },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { personnel: { select: { name: true, email: true } } }
      })
    ]);

    // Forensic-safe Decimal mappings. Maps as strings to prevent JS proxy leaks.
    const salesMap = new Map<string, string>();
    salesTotals.forEach((s) => {
      if (s.branchId) salesMap.set(s.branchId, s._sum.total?.toString() ?? "0.00");
    });

    const expensesMap = new Map<string, string>();
    expenseTotals.forEach((e) => {
      if (e.branchId) expensesMap.set(e.branchId, e._sum.amount?.toString() ?? "0.00");
    });

    const enrichedData: any[] = branches.map((b) => ({
      ...b,
      salesTotal: salesMap.get(b.id) ?? "0.00",
      expensesTotal: expensesMap.get(b.id) ?? "0.00",
      operationalStatus: {
        hasOpenPOS: b._count.posSessions > 0,
        activeStaffCount: b._count.personnel
      },
      branchAssignments: b.branchAssignments.map((ba) => ({
        id: ba.id,
        role: ba.role, 
        isPrimary: ba.isPrimary,
        personnel: {
          id: ba.personnel.id,
          name: ba.personnel.name,
          email: ba.personnel.email as string,
          role: ba.personnel.role, 
          assignmentRole: ba.role, 
          isPrimary: ba.isPrimary,
          staffCode: ba.personnel.staffCode
        }
      }))
    }));

    return NextResponse.json({
      data: enrichedData,
      summary: { total, active, inactive, deleted },
      recentLogs,
      page,
      pageSize
    });
  } catch (error) {
    console.error("[GET_BRANCHES_ERROR]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------- POST: CREATE & PROVISION -------------------- */

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();
  try {
    const auth = await verifyAccess(PermissionAction.CREATE);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    
    const { session, organizationId } = auth;
    const body: CreateBranchBody = await req.json();
    const { name, location, active, personnel } = body;

    if (!name) return NextResponse.json({ error: "Branch name is required" }, { status: 400 });

    const result = await prisma.$transaction(async (tx) => {
      // 1. Core Resource Creation
      const branch = await tx.branch.create({
        data: {
          name,
          location,
          active: active ?? true,
          organizationId,
        },
      });

      // 2. Personnel Provisioning Pipeline
      if (personnel && personnel.length > 0) {
        // Create Role Assignments
        await tx.branchAssignment.createMany({
          data: personnel.map((p) => ({
            branchId: branch.id,
            personnelId: p.personnelId,
            role: p.role,
            isPrimary: p.isPrimary ?? false 
          })),
        });

        // 3. Smart Active-Branch Updating
        // Only update the active login branchId for staff if they are being assigned as 'Primary'
        // or if they do not currently have an active branch assigned.
        const primaryPersonnelIds = personnel.filter(p => p.isPrimary).map(p => p.personnelId);
        
        if (primaryPersonnelIds.length > 0) {
          await tx.authorizedPersonnel.updateMany({
            where: { 
              id: { in: primaryPersonnelIds },
              organizationId 
            },
            data: { branchId: branch.id },
          });
        }
      }

      // 4. Fortified Forensic Audit Log
      await createAuditLog(tx, {
        action: "BRANCH_DEPLOYED",
        resource: Resource.BRANCH,
        resourceId: branch.id,
        organizationId,
        actorId: session.user.id,
        actorRole: session.user.role,
        description: `New branch "${name}" was deployed at ${location || "unspecified location"} with ${personnel?.length || 0} staff assignments.`,
        severity: Severity.HIGH,
        critical: true,
        requestId,
        changes: { to: branch },
        metadata: { staffCount: personnel?.length || 0, newAssignments: personnel } as Prisma.JsonObject,
      });

      return branch;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[POST_BRANCH_ERROR]:", error);
    return NextResponse.json({ error: "Failed to deploy branch infrastructure" }, { status: 500 });
  }
}

/* -------------------- PATCH: UPDATE & DECOMMISSION -------------------- */

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();
  try {
    const auth = await verifyAccess(PermissionAction.UPDATE);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    
    const { session, organizationId } = auth;
    const body: UpdateBranchBody = await req.json();
    const { id, name, location, active, deletedAt } = body;

    if (!id) return NextResponse.json({ error: "Branch ID is required" }, { status: 400 });

    // 1. Fetch current state for "before" snapshot and Guardrails
    const currentBranch = await prisma.branch.findUnique({
      where: { id, organizationId } 
    });

    if (!currentBranch) {
      return NextResponse.json({ error: "Branch not found or access denied" }, { status: 404 });
    }

    // 2. CRITICAL DECOMMISSIONING GUARDRAILS
    if (deletedAt) {
      // Guardrail A: Active Inventory Lock
      const activeStockCount = await prisma.branchProduct.count({
        where: { branchId: id, stock: { gt: 0 } }
      });
      if (activeStockCount > 0) {
        return NextResponse.json({ 
          error: `DECOMMISSION BLOCKED: Branch contains ${activeStockCount} active inventory lines. Transfer or void stock before deletion.` 
        }, { status: 400 });
      }

      // Guardrail B: Active POS Session Lock
      const activePOSCount = await prisma.posSession.count({
        where: { branchId: id, status: POSSessionStatus.OPEN }
      });
      if (activePOSCount > 0) {
        return NextResponse.json({ 
          error: `DECOMMISSION BLOCKED: There are ${activePOSCount} unclosed POS Sessions at this branch. Cashiers must close registers first.` 
        }, { status: 400 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 3. Apply Infrastructure Mutations
      const updatedBranch = await tx.branch.update({
        where: { id, organizationId },
        data: {
          ...(name && { name }),
          ...(location !== undefined && { location }),
          ...(active !== undefined && { active }),
          ...(deletedAt !== undefined && { 
            deletedAt: deletedAt ? new Date(deletedAt) : null 
          }),
        }
      });

      // 4. Decommission Cleanup Logic
      if (deletedAt) {
        // Wipe local assignments 
        await tx.branchAssignment.deleteMany({ where: { branchId: id } });
        
        // Disconnect any user who currently has this branch as their active UI session state
        await tx.authorizedPersonnel.updateMany({
          where: { branchId: id, organizationId },
          data: { branchId: null }
        });
      }

      // 5. Intelligent Audit Context Generation
      let logAction = "BRANCH_UPDATED";
      let logSeverity = Severity.MEDIUM;
      let logDescription = `Branch "${updatedBranch.name}" details were updated.`;

      if (deletedAt) {
        logAction = "BRANCH_DECOMMISSIONED";
        logSeverity = Severity.CRITICAL;
        logDescription = `Branch "${updatedBranch.name}" was strictly decommissioned from operations. Related staff assignments were safely decoupled.`;
      } else if (active === false && currentBranch.active === true) {
        logAction = "BRANCH_SUSPENDED";
        logSeverity = Severity.HIGH;
        logDescription = `Branch "${updatedBranch.name}" operations were suspended.`;
      } else if (active === true && currentBranch.active === false) {
        logAction = "BRANCH_REACTIVATED";
        logSeverity = Severity.MEDIUM;
        logDescription = `Branch "${updatedBranch.name}" operations were reactivated.`;
      }

      // 6. Cryptographic Hash Injection via Audit Core
      await createAuditLog(tx, {
        action: logAction,
        resource: Resource.BRANCH,
        resourceId: id,
        organizationId,
        actorId: session.user.id,
        actorRole: session.user.role,
        description: logDescription,
        severity: logSeverity,
        critical: deletedAt ? true : false,
        requestId,
        changes: { from: currentBranch, to: updatedBranch },
      });

      return updatedBranch;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[PATCH_BRANCH_ERROR]:", error);
    return NextResponse.json({ error: "Failed to apply infrastructure update" }, { status: 500 });
  }
}