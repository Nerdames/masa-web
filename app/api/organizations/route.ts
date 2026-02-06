import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/* =========================
   GET /api/organizations
   =========================
   Query params:
   - page
   - pageSize
   - search
*/
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const page = Math.max(Number(searchParams.get("page")) || 1, 1);
    const pageSize = Math.min(Number(searchParams.get("pageSize")) || 10, 50);
    const search = searchParams.get("search")?.trim();

    const where = search
      ? {
          name: {
            contains: search,
            mode: "insensitive" as const,
          },
        }
      : {};

    const [data, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              branches: true,
              personnel: true,
            },
          },
        },
      }),
      prisma.organization.count({ where }),
    ]);

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("GET /api/organizations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}

/* =========================
   POST /api/organizations
   =========================
   Body:
   - name
   - ownerId? (AuthorizedPersonnel.id)
*/
export async function POST(req: Request) {
  try {
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
        ownerId: ownerId ?? null,
      },
    });

    return NextResponse.json(organization, { status: 201 });
  } catch (error) {
    console.error("POST /api/organizations error:", error);
    return NextResponse.json(
      { error: "Failed to create organization" },
      { status: 500 }
    );
  }
}
