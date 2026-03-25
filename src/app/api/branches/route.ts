import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma, Role } from "@prisma/client";

/* -------------------- TYPES & DTOS -------------------- */

interface BranchPersonnelDTO {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  staffCode: string | null;
}

interface BranchDTO {
  id: string;
  organizationId: string;
  name: string;
  location: string | null;
  active: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  branchAssignments: {
    id: string;
    role: Role;
    isPrimary: boolean;
    personnel: BranchPersonnelDTO;
  }[];
  _count: {
    personnel: number;
    branchProducts: number;
    orders: number;
    activityLogs: number;
  };
  salesTotal: number;
}

interface BranchListResponse {
  data: BranchDTO[];
  summary: {
    total: number;
    active: number;
    inactive: number;
    deleted: number;
  };
  recentLogs: unknown[]; 
  page: number;
  pageSize: number;
}

interface CreateBranchBody {
  name: string;
  location?: string;
  active?: boolean;
  personnel?: { personnelId: string; role: Role }[];
}

interface UpdateBranchBody {
  id: string;
  name?: string;
  location?: string;
  active?: boolean;
  deletedAt?: string | null;
}

/* -------------------- GET: LIST & INFRASTRUCTURE SYNC -------------------- */

export async function GET(
  req: NextRequest
): Promise<NextResponse<BranchListResponse | { error: string }>> {
  try {
    const session = await getServerSession(authOptions);

    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const organizationId = session.user.organizationId;
    const { searchParams } = new URL(req.url);

    const q = searchParams.get("search")?.trim() ?? "";
    const status = searchParams.get("status") ?? "all";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = 50;
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

    const [total, active, inactive, deleted, branches, salesTotals, recentLogs] = await Promise.all([
      prisma.branch.count({ where: { organizationId, deletedAt: null } }),
      prisma.branch.count({ where: { organizationId, active: true, deletedAt: null } }),
      prisma.branch.count({ where: { organizationId, active: false, deletedAt: null } }),
      prisma.branch.count({ where: { organizationId, deletedAt: { not: null } } }),
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
                select: { id: true, name: true, email: true, staffCode: true }
              }
            }
          },
          _count: {
            select: {
              personnel: { where: { deletedAt: null } },
              branchProducts: true,
              orders: { where: { deletedAt: null } },
              activityLogs: true,
            }
          }
        }
      }),
      prisma.sale.groupBy({
        by: ["branchId"],
        where: { organizationId, status: "COMPLETED" },
        _sum: { total: true },
      }),
      prisma.activityLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { personnel: { select: { name: true } } }
      })
    ]);

    const salesMap = new Map<string, number>();
    salesTotals.forEach((s) => {
      if (s.branchId) salesMap.set(s.branchId, Number(s._sum.total ?? 0));
    });

    const enrichedData: BranchDTO[] = branches.map((b) => ({
      ...b,
      salesTotal: salesMap.get(b.id) ?? 0,
      branchAssignments: b.branchAssignments.map((ba) => ({
        id: ba.id,
        role: ba.role,
        isPrimary: ba.isPrimary,
        personnel: {
          id: ba.personnel.id,
          name: ba.personnel.name,
          email: ba.personnel.email as string,
          role: ba.role,
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
  } catch (error: unknown) {
    console.error("GET_BRANCHES_ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------- POST: CREATE & PROVISION -------------------- */

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body: CreateBranchBody = await req.json();
    const { name, location, active, personnel } = body;

    if (!name) return NextResponse.json({ error: "Branch name is required" }, { status: 400 });

    const newBranch = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          name,
          location,
          active: active ?? true,
          organizationId: session.user.organizationId,
        },
      });

      if (personnel && personnel.length > 0) {
        await tx.branchAssignment.createMany({
          data: personnel.map((p) => ({
            branchId: branch.id,
            personnelId: p.personnelId,
            role: p.role,
            isPrimary: false
          })),
        });

        // Sync back to the personnel record for quick lookup
        await tx.authorizedPersonnel.updateMany({
          where: {
            id: { in: personnel.map((p) => p.personnelId) },
            branchId: null,
          },
          data: { branchId: branch.id },
        });
      }

      await tx.activityLog.create({
        data: {
          organizationId: session.user.organizationId,
          branchId: branch.id,
          personnelId: session.user.id,
          action: "BRANCH_DEPLOYED",
          critical: true,
          metadata: { name, location } as Prisma.JsonObject,
        },
      });

      return branch;
    });

    return NextResponse.json(newBranch, { status: 201 });
  } catch (error: unknown) {
    console.error("POST_BRANCH_ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------- PATCH: INFRASTRUCTURE UPDATE -------------------- */

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body: UpdateBranchBody = await req.json();
    const { id, name, location, active, deletedAt } = body;

    if (!id) return NextResponse.json({ error: "Branch ID is required" }, { status: 400 });

    const updatedBranch = await prisma.branch.update({
      where: { 
        id,
        organizationId: session.user.organizationId 
      },
      data: {
        ...(name && { name }),
        ...(location !== undefined && { location }),
        ...(active !== undefined && { active }),
        ...(deletedAt !== undefined && { 
          deletedAt: deletedAt ? new Date(deletedAt) : null 
        }),
      }
    });

    await prisma.activityLog.create({
      data: {
        organizationId: session.user.organizationId,
        branchId: id,
        personnelId: session.user.id,
        action: deletedAt ? "BRANCH_DECOMMISSIONED" : "BRANCH_UPDATED",
        metadata: { name, active } as Prisma.JsonObject,
      }
    });

    return NextResponse.json(updatedBranch);
  } catch (error: unknown) {
    console.error("PATCH_BRANCH_ERROR:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}