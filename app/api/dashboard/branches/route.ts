import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma, Role } from "@prisma/client";

/* -------------------- RESPONSE TYPES -------------------- */

interface BranchPersonnelDTO {
  id: string;
  name: string | null;
  email: string;
  role: Role;
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

  personnel: BranchPersonnelDTO[];

  personnelCount: number;
  productCount: number;
  orderCount: number;
  salesTotal: number;

  receiptsCount: number;
  notificationsCount: number;
  activityLogsCount: number;
}

interface BranchListResponse {
  branches: BranchDTO[];
  total: number;
  page: number;
  pageSize: number;
}

interface CreateBranchPersonnel {
  personnelId: string;
  role: Role;
}

interface CreateBranchBody {
  name: string;
  location?: string;
  personnel?: CreateBranchPersonnel[];
}

/* -------------------- GET: LIST BRANCHES -------------------- */

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

    const q = searchParams.get("q")?.trim() ?? "";
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const perPageRaw = parseInt(searchParams.get("perPage") ?? "10", 10);
    const pageSize = Math.min(Math.max(perPageRaw, 1), 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.BranchWhereInput = {
      organizationId,
      deletedAt: null,
      ...(q && {
        name: { contains: q, mode: "insensitive" },
      }),
      ...(status === "active" && { active: true }),
      ...(status === "inactive" && { active: false }),
    };

    const [total, branches, salesTotals] = await Promise.all([
      prisma.branch.count({ where }),
      prisma.branch.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          organizationId: true,
          name: true,
          location: true,
          active: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
          branchAssignments: {
            where: { personnel: { deletedAt: null } },
            select: {
              role: true,
              personnel: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          _count: {
            select: {
              personnel: { where: { deletedAt: null } },
              branchProducts: true,
              orders: { where: { deletedAt: null } },
              receipts: true,
              notifications: true,
              activityLogs: true,
            },
          },
        },
      }),
      prisma.sale.groupBy({
        by: ["branchId"],
        where: { organizationId, status: "COMPLETED" },
        _sum: { total: true },
      }),
    ]);

    const salesMap = new Map<string, number>();
    salesTotals.forEach((s) => salesMap.set(s.branchId, Number(s._sum.total ?? 0)));

    const enrichedBranches: BranchDTO[] = branches.map((b) => ({
      id: b.id,
      organizationId: b.organizationId,
      name: b.name,
      location: b.location,
      active: b.active,
      deletedAt: b.deletedAt,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      personnel: b.branchAssignments.map((ba) => ({
        id: ba.personnel.id,
        name: ba.personnel.name,
        email: ba.personnel.email,
        role: ba.role,
      })),
      personnelCount: b._count.personnel,
      productCount: b._count.branchProducts,
      orderCount: b._count.orders,
      salesTotal: salesMap.get(b.id) ?? 0,
      receiptsCount: b._count.receipts,
      notificationsCount: b._count.notifications,
      activityLogsCount: b._count.activityLogs,
    }));

    return NextResponse.json({ branches: enrichedBranches, total, page, pageSize });
  } catch (error: unknown) {
    console.error("GET_BRANCHES_ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------- POST: CREATE BRANCH -------------------- */

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || (session.user.role !== Role.ADMIN && !session.user.isOrgOwner)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { name, location, personnel }: CreateBranchBody = await req.json();

    if (!name) {
      return NextResponse.json({ error: "Branch name is required" }, { status: 400 });
    }

    const newBranch = await prisma.$transaction(async (tx) => {
      // 1. Create the Branch record
      const branch = await tx.branch.create({
        data: {
          name,
          location,
          organizationId: session.user.organizationId,
        },
      });

      // 2. Handle initial assignments if personnel provided
      if (personnel && personnel.length > 0) {
        // Create the pivot table entries
        await tx.branchAssignment.createMany({
          data: personnel.map((p) => ({
            branchId: branch.id,
            personnelId: p.personnelId,
            role: p.role,
          })),
        });

        // Update the primary branchId for personnel who are currently "floating" (null branch)
        await tx.authorizedPersonnel.updateMany({
          where: {
            id: { in: personnel.map((p) => p.personnelId) },
            branchId: null,
          },
          data: {
            branchId: branch.id,
          },
        });
      }

      // 3. Log the system activity
      await tx.activityLog.create({
        data: {
          organizationId: session.user.organizationId,
          branchId: branch.id,
          personnelId: session.user.id,
          action: "BRANCH_CREATED",
          critical: true,
          metadata: { 
            name, 
            initialStaffCount: personnel?.length ?? 0 
          },
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