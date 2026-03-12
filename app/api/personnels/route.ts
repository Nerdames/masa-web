import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma, Role } from "@prisma/client";
import { getToken } from "next-auth/jwt";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.NEXTAUTH_SECRET;

interface AuthContext {
  userId: string;
  role: Role;
  organizationId: string;
  branchId: string | null;
}

async function getAuthContext(req: NextRequest): Promise<AuthContext | null> {
  const token = await getToken({ req, secret: JWT_SECRET });
  if (!token || typeof token.id !== "string") return null;

  return {
    userId: token.id,
    role: (token.role as Role) || Role.SALES,
    organizationId: token.organizationId as string,
    branchId: (token.branchId as string) ?? null,
  };
}

function hasPersonnelAccess(role: Role): boolean {
  const allowedRoles: Role[] = [Role.DEV, Role.ADMIN, Role.MANAGER];
  return allowedRoles.includes(role);
}

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth || !hasPersonnelAccess(auth.role)) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 10), 1), 100);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status");
    const sort = searchParams.get("sort");

    const baseWhere: Prisma.AuthorizedPersonnelWhereInput = {
      deletedAt: null,
      ...(auth.role !== Role.DEV && { organizationId: auth.organizationId }),
      ...(auth.role === Role.MANAGER && auth.branchId && { branchId: auth.branchId }),
    };

    if (search) {
      baseWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { staffCode: { contains: search, mode: "insensitive" } },
      ];
    }

    const paginationWhere: Prisma.AuthorizedPersonnelWhereInput = { ...baseWhere };
    if (status === "active") {
      paginationWhere.disabled = false;
      paginationWhere.isLocked = false;
    } else if (status === "disabled") {
      paginationWhere.disabled = true;
    } else if (status === "locked") {
      paginationWhere.isLocked = true;
    }

    const orderBy: Prisma.AuthorizedPersonnelOrderByWithRelationInput =
      sort === "az" ? { name: "asc" } : { lastActivityAt: "desc" };

    const [
      total,
      data,
      activeCount,
      disabledCount,
      lockedCount,
      branches,
      recentLogs
    ] = await Promise.all([
      prisma.authorizedPersonnel.count({ where: baseWhere }),
      prisma.authorizedPersonnel.findMany({
        where: paginationWhere,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
        include: {
          branch: { select: { id: true, name: true } },
          branchAssignments: {
            include: { branch: { select: { id: true, name: true } } },
          },
        },
      }),
      prisma.authorizedPersonnel.count({ where: { ...baseWhere, disabled: false, isLocked: false } }),
      prisma.authorizedPersonnel.count({ where: { ...baseWhere, disabled: true } }),
      prisma.authorizedPersonnel.count({ where: { ...baseWhere, isLocked: true } }),
      prisma.branch.findMany({
        where: { organizationId: auth.organizationId, deletedAt: null },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              personnel: true,
            }
          }
        },
      }),
      prisma.activityLog.findMany({
        where: { organizationId: auth.organizationId },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { personnel: { select: { name: true } } }
      })
    ]);

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
      summary: { total, active: activeCount, disabled: disabledCount, locked: lockedCount },
      branchSummaries: branches.map(b => ({
        branchId: b.id,
        branchName: b.name,
        total: b._count.personnel
      })),
      recentLogs
    });
  } catch (error) {
    console.error("GET Personnel Error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth || !hasPersonnelAccess(auth.role)) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, email, password, staffCode, branchId, role, isOrgOwner } = body;

    if (!email || !password || !name) {
      return NextResponse.json({ message: "Required fields missing" }, { status: 400 });
    }

    const existing = await prisma.authorizedPersonnel.findFirst({
      where: {
        OR: [{ email }, { staffCode }],
        organizationId: auth.organizationId
      }
    });

    if (existing) {
      return NextResponse.json(
        { message: "A user with this email or staff code already exists." },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const personnel = await prisma.$transaction(async (tx) => {
      const created = await tx.authorizedPersonnel.create({
        data: {
          name,
          email,
          password: hashedPassword,
          staffCode,
          role: (role as Role) ?? Role.SALES,
          organizationId: auth.organizationId,
          branchId: branchId ?? null,
          isOrgOwner: isOrgOwner ?? false,
        },
      });

      if (branchId) {
        await tx.branchAssignment.create({
          data: { 
            personnelId: created.id, 
            branchId, 
            role: (role as Role) ?? Role.SALES,
            isPrimary: true 
          },
        });
      }

      await tx.activityLog.create({
        data: {
          organizationId: auth.organizationId,
          personnelId: auth.userId,
          action: "PERSONNEL_CREATED",
          critical: false,
          metadata: { createdPersonnelId: created.id, email: created.email } as Prisma.JsonObject,
        },
      });

      return tx.authorizedPersonnel.findUnique({
        where: { id: created.id },
        include: {
          branch: { select: { id: true, name: true } },
          branchAssignments: { include: { branch: true } }
        }
      });
    });

    return NextResponse.json(personnel, { status: 201 });
  } catch (error) {
    console.error("Provisioning Error:", error);
    return NextResponse.json({ message: "Provisioning failed" }, { status: 500 });
  }
}