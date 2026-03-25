import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { Role } from "@prisma/client";

/**
 * Strict Role Access Control
 * Ensures that even if middleware is bypassed, the database 
 * is protected against non-DEV users.
 */
async function validateDevAccess() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user || (session.user as any).role !== Role.DEV) {
    throw { status: 403, message: "Forbidden: Developer access only" };
  }
  
  return session.user;
}

/* ============================================================
   GET /api/organizations
   ============================================================ */
export async function GET(req: NextRequest) {
  try {
    await validateDevAccess();

    const { searchParams } = new URL(req.url);

    /* --- Pagination --- */
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(50, Number(searchParams.get("pageSize") ?? 10));

    /* --- Filters --- */
    const search = searchParams.get("search")?.trim() || undefined;
    const activeParam = searchParams.get("active"); // "true" or "false"
    const sortParam = searchParams.get("sort") ?? "newest";

    const where: any = {
      ...(activeParam !== undefined && { active: activeParam === "true" }),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { owner: { name: { contains: search, mode: "insensitive" } } },
          { owner: { email: { contains: search, mode: "insensitive" } } },
        ],
      } : {}),
    };

    /* --- Sorting --- */
    let orderBy: any = { createdAt: "desc" };
    if (sortParam === "oldest") orderBy = { createdAt: "asc" };
    if (sortParam === "name_asc") orderBy = { name: "asc" };
    if (sortParam === "name_desc") orderBy = { name: "desc" };

    /* --- Parallel Fetching --- */
    const [organizations, totalCount, summary] = await Promise.all([
      prisma.organization.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          owner: {
            select: { name: true, email: true },
          },
          _count: {
            select: {
              branches: true,
              personnel: true,
              sales: true,
            },
          },
        },
      }),
      prisma.organization.count({ where }),
      // Global Statistics for Summary Cards
      prisma.$transaction([
        prisma.organization.count(),
        prisma.organization.count({ where: { active: true } }),
        prisma.branch.count(),
        prisma.organization.findFirst({
          orderBy: { createdAt: "desc" },
          select: { name: true },
        }),
      ]),
    ]);

    return NextResponse.json({
      summary: {
        totalOrganizations: summary[0],
        activeCount: summary[1],
        inactiveCount: summary[0] - summary[1],
        totalBranches: summary[2],
        newestOrg: summary[3]?.name ?? null,
      },
      data: organizations,
      total: totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    });
  } catch (error: any) {
    console.error("GET /api/organizations error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: error.status || 500 }
    );
  }
}

/* ============================================================
   POST /api/organizations
   ============================================================ */
export async function POST(req: NextRequest) {
  try {
    await validateDevAccess();

    const body = await req.json();
    const { name, ownerId } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Organization name is required" },
        { status: 400 }
      );
    }

    const organization = await prisma.organization.create({
      data: {
        name,
        active: true,
        // Ensure the ownerId exists in AuthorizedPersonnel before linking
        ...(ownerId && {
          owner: { connect: { id: ownerId } }
        }),
      },
      include: {
        owner: { select: { name: true, email: true } },
      }
    });

    return NextResponse.json(organization, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/organizations error:", error);
    return NextResponse.json(
      { error: "Failed to create organization. Ensure Owner ID is valid." },
      { status: 500 }
    );
  }
}