import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

interface GetBranchesQuery {
  organizationId: string;
  q?: string;
  page?: number;
  perPage?: number;
}

interface CreateBranchBody {
  name: string;
  organizationId: string;
  location?: string;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const organizationId = searchParams.get("organizationId");
    const q = searchParams.get("q") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const perPage = parseInt(searchParams.get("perPage") || "12", 10);

    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing organizationId" },
        { status: 400 }
      );
    }

    // Build query filters
    const where: { organizationId: string; name?: { contains: string; mode: "insensitive" }; deletedAt: null } = {
      organizationId,
      deletedAt: null,
    };

    if (q) {
      where.name = { contains: q, mode: "insensitive" };
    }

    const [total, branches] = await Promise.all([
      prisma.branch.count({ where }),
      prisma.branch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          personnel: { select: { id: true, name: true } }, // optional: include users
          branchProducts: { select: { id: true, productId: true } }, // optional: include products
        },
      }),
    ]);

    return NextResponse.json({ total, branches });
  } catch (err) {
    console.error("GET /branches error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: CreateBranchBody = await req.json();

    const { name, organizationId, location } = body;

    if (!name || !organizationId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const branch = await prisma.branch.create({
      data: {
        name,
        organizationId,
        location: location || null,
      },
    });

    return NextResponse.json(branch, { status: 201 });
  } catch (err) {
    console.error("POST /branches error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
