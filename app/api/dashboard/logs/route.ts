import { NextRequest, NextResponse } from "next/server";
import prisma  from "@/lib/prisma";
import { requireAuth } from "@/lib/guards/requireAuth";

/**
 * GET /api/dashboard/logs
 * Query params:
 *  - branchId?: string
 *  - personnelId?: string
 *  - page?: number (default 1)
 *  - limit?: number (default 20)
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);

    const { searchParams } = new URL(req.url);

    const branchId = searchParams.get("branchId") || undefined;
    const personnelId = searchParams.get("personnelId") || undefined;

    const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") ?? 20), 1),
      100
    );

    const skip = (page - 1) * limit;

    /**
     * SECURITY:
     * Always scope logs to the authenticated user's organization
     */
    const where = {
      organizationId: user.organizationId,
      ...(branchId ? { branchId } : {}),
      ...(personnelId ? { personnelId } : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
        include: {
          personnel: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.activityLog.count({ where }),
    ]);

    return NextResponse.json({
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[DASHBOARD_LOGS_GET]", error);

    return NextResponse.json(
      { message: "Failed to fetch activity logs" },
      { status: 500 }
    );
  }
}
