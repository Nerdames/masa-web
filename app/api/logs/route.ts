import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guards/requireAuth";

/* =========================================================
   GET /api/log
   Fetch activity logs (dashboard)
   ========================================================= */

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

    const where = {
      organizationId: user.organizationId,
      ...(branchId ? { branchId } : {}),
      ...(personnelId ? { personnelId } : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
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
    console.error("[LOGS_GET]", error);

    return NextResponse.json(
      { message: "Failed to fetch activity logs" },
      { status: 500 }
    );
  }
}

/* =========================================================
   POST /api/log
   Used by middleware + system events
   ========================================================= */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      action,
      organizationId,
      branchId,
      personnelId,
      approvalRequestId,
      meta,
    } = body;

    if (!action) {
      return NextResponse.json(
        { message: "Action is required" },
        { status: 400 }
      );
    }

    /* ---------------------------------------------
       LAST ACTIVITY UPDATE
       --------------------------------------------- */

    if (action === "LAST_ACTIVITY_UPDATE" && personnelId) {
      await prisma.authorizedPersonnel.update({
        where: { id: personnelId },
        data: {
          lastActivityAt: new Date(),
        },
      });

      return NextResponse.json({ success: true });
    }

    /* ---------------------------------------------
       CREATE ACTIVITY LOG
       --------------------------------------------- */

    await prisma.activityLog.create({
      data: {
        action,
        organizationId: organizationId ?? null,
        branchId: branchId ?? null,
        personnelId: personnelId ?? null,
        approvalRequestId: approvalRequestId ?? null,
        meta: meta ? JSON.stringify(meta) : null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[LOG_POST]", error);

    return NextResponse.json(
      { message: "Failed to create log entry" },
      { status: 500 }
    );
  }
}