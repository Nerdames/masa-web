import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {Prisma} from "@prisma/client";
import { getToken } from "next-auth/jwt"; // Use JWT from NextAuth for server-side

const JWT_SECRET = process.env.NEXTAUTH_SECRET;

/* -------------------- DEV/ADMIN Guard -------------------- */
async function requireDevOrAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: JWT_SECRET });
  if (!token || !["DEV", "ADMIN"].includes(token.role)) {
    return false;
  }
  return true;
}

/* -------------------- GET /api/personnels -------------------- */
export async function GET(req: NextRequest) {
  if (!(await requireDevOrAdmin(req))) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
    const pageSize = Math.min(Number(searchParams.get("pageSize") ?? 10), 50);
    const search = searchParams.get("search")?.trim();

    const where: Prisma.AuthorizedPersonnelWhereInput = { deletedAt: null };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { staffCode: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, data] = await Promise.all([
      prisma.authorizedPersonnel.count({ where }),
      prisma.authorizedPersonnel.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          staffCode: true,
          disabled: true,
          deletedAt: true,
          createdAt: true,
          lastLogin: true,
          branch: { select: { id: true, name: true } },
          branchAssignments: { select: { role: true } },
        },
      }),
    ]);

    const formatted = data.map(p => ({
      ...p,
      roles: p.branchAssignments.map(b => b.role),
    }));

    return NextResponse.json({ data: formatted, total, page, pageSize });
  } catch (error) {
    console.error("GET /api/personnels error:", error);
    return NextResponse.json(
      { message: "Failed to fetch personnels" },
      { status: 500 }
    );
  }
}

/* -------------------- POST /api/personnels -------------------- */
export async function POST(req: NextRequest) {
  if (!(await requireDevOrAdmin(req))) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  try {
    const body: {
      name?: string;
      email?: string;
      password?: string;
      organizationId?: string;
      branchId?: string | null;
      staffCode?: string | null;
    } = await req.json();

    const { name, email, password, organizationId, branchId, staffCode } = body;

    if (!email || !password || !organizationId) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
    }

    const exists = await prisma.authorizedPersonnel.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json({ message: "Email already exists" }, { status: 409 });
    }

    const personnel = await prisma.authorizedPersonnel.create({
      data: {
        name: name ?? null,
        email,
        password, // ⚠️ hash this in production
        organizationId,
        branchId: branchId ?? null,
        staffCode: staffCode ?? null,
      },
    });

    return NextResponse.json(personnel, { status: 201 });
  } catch (error) {
    console.error("POST /api/personnels error:", error);
    return NextResponse.json(
      { message: "Failed to create personnel" },
      { status: 500 }
    );
  }
}
