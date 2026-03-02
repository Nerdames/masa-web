import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

/* -------------------- RESPONSE TYPES -------------------- */

interface BranchPersonnelDTO {
  id: string;
  name: string | null;
  email: string;
  role: string;
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
  pageSize: number;
}

/* -------------------- GET /api/dashboard/branches -------------------- */

export async function GET(
  req: NextRequest
): Promise<NextResponse<BranchListResponse | { error: string }>> {
  try {
    /* -------------------- AUTH -------------------- */

    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const organizationId = session.user.organizationId;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing organization context" },
        { status: 400 }
      );
    }

    /* -------------------- QUERY PARAMS -------------------- */

    const { searchParams } = new URL(req.url);

    const q = searchParams.get("q")?.trim() ?? "";
    const status = searchParams.get("status");

    const page = Math.max(
      1,
      parseInt(searchParams.get("page") ?? "1", 10)
    );

    const perPageRaw = parseInt(
      searchParams.get("perPage") ?? "10",
      10
    );

    const pageSize = Math.min(Math.max(perPageRaw, 1), 100);
    const skip = (page - 1) * pageSize;

    /* -------------------- WHERE (FULLY TYPED) -------------------- */

    const where: Prisma.BranchWhereInput = {
      organizationId,
      deletedAt: null,
      ...(q && {
        name: {
          contains: q,
          mode: "insensitive",
        },
      }),
      ...(status === "active" && { active: true }),
      ...(status === "inactive" && { active: false }),
    };

    /* -------------------- FETCH -------------------- */

    const [total, branches, salesTotals] = await Promise.all([

      prisma.branch.count({
        where,
      }),

      prisma.branch.findMany({

        where,

        orderBy: {
          updatedAt: "desc",
        },

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
            select: {
              role: true,
              personnel: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },

          _count: {
            select: {
              personnel: {
                where: { deletedAt: null },
              },
              branchProducts: {
                where: { deletedAt: null },
              },
              orders: {
                where: { deletedAt: null },
              },
              receipts: true,
              notifications: true,
              activityLogs: true,
            },
          },
        },

      }),

      prisma.sale.groupBy({
        by: ["branchId"],
        where: {
          organizationId,
          deletedAt: null,
        },
        _sum: {
          total: true,
        },
      }),

    ]);

    /* -------------------- SALES MAP -------------------- */

    const salesMap = new Map<string, number>();

    for (const s of salesTotals) {
      salesMap.set(
        s.branchId,
        Number(s._sum.total ?? 0)
      );
    }

    /* -------------------- TRANSFORM -------------------- */

    const enrichedBranches: BranchDTO[] = branches.map((b) => ({

      id: b.id,
      organizationId: b.organizationId,
      name: b.name,
      location: b.location,
      active: b.active,
      deletedAt: b.deletedAt,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,

      personnel: b.branchAssignments.map((assignment) => ({
        id: assignment.personnel.id,
        name: assignment.personnel.name,
        email: assignment.personnel.email,
        role: assignment.role,
      })),

      personnelCount: b._count.personnel,
      productCount: b._count.branchProducts,
      orderCount: b._count.orders,

      salesTotal: salesMap.get(b.id) ?? 0,

      receiptsCount: b._count.receipts,
      notificationsCount: b._count.notifications,
      activityLogsCount: b._count.activityLogs,

    }));

    /* -------------------- RESPONSE -------------------- */

    return NextResponse.json({
      branches: enrichedBranches,
      total,
      pageSize,
    });

  } catch (error) {

    console.error("GET /api/dashboard/branches error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}