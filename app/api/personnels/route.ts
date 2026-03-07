import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getToken } from "next-auth/jwt";

const JWT_SECRET = process.env.NEXTAUTH_SECRET;

/**
 * Enhanced Guard:
 * Ensures the user is logged in and belongs to the Organization.
 * Admins/Devs get broad access; Managers are scoped to their Org.
 */
async function getAuthContext(req: NextRequest) {
  const token = await getToken({ req, secret: JWT_SECRET });
  if (!token) return null;

  return {
    userId: token.sub,
    role: token.role as string,
    organizationId: token.organizationId as string,
  };
}

/* -------------------- GET /api/personnels -------------------- */
export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);

  if (!auth || !["DEV", "ADMIN", "MANAGER"].includes(auth.role)) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
    const pageSize = Math.max(Number(searchParams.get("pageSize") ?? 10), 1);
    const search = searchParams.get("q") || searchParams.get("search");
    const status = searchParams.get("status");
    const sort = searchParams.get("sort");

    const baseWhere: Prisma.AuthorizedPersonnelWhereInput = {
      deletedAt: null,
      ...(auth.role !== "DEV" && { organizationId: auth.organizationId }),
    };

    // Search filter
    if (search) {
      baseWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { staffCode: { contains: search, mode: "insensitive" } },
      ];
    }

    // Status filter for pagination
    const paginationWhere: Prisma.AuthorizedPersonnelWhereInput = { ...baseWhere };
    if (status === "active") {
      paginationWhere.disabled = false;
      paginationWhere.isLocked = false;
    } else if (status === "disabled") {
      paginationWhere.disabled = true;
    } else if (status === "locked") {
      paginationWhere.isLocked = true;
    }

    // Sorting
    const orderBy: Prisma.AuthorizedPersonnelOrderByWithRelationInput =
      sort === "az" ? { name: "asc" } : { lastActivityAt: "desc" };

    // Fetch personnels + overall summary concurrently
    const [total, data, activeCount, disabledCount, lockedCount] = await Promise.all([
      prisma.authorizedPersonnel.count({ where: baseWhere }),
      prisma.authorizedPersonnel.findMany({
        where: paginationWhere,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
        include: {
          branch: { select: { id: true, name: true } },
          branchAssignments: { include: { branch: { select: { id: true, name: true } } } },
        },
      }),
      prisma.authorizedPersonnel.count({ where: { ...baseWhere, disabled: false, isLocked: false } }),
      prisma.authorizedPersonnel.count({ where: { ...baseWhere, disabled: true } }),
      prisma.authorizedPersonnel.count({ where: { ...baseWhere, isLocked: true } }),
    ]);

    // Branch-level summaries
    const branchSummariesRaw = await prisma.branch.findMany({
      where: { organizationId: auth.organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        personnel: true,
      },
    });

    const branchSummaries = branchSummariesRaw.map(branch => {
      const active = branch.personnel.filter(p => !p.disabled && !p.isLocked).length;
      const disabled = branch.personnel.filter(p => p.disabled).length;
      const locked = branch.personnel.filter(p => p.isLocked).length;
      return {
        branchId: branch.id,
        branchName: branch.name,
        total: branch.personnel.length,
        active,
        disabled,
        locked,
      };
    });

    const summary = { total, active: activeCount, disabled: disabledCount, locked: lockedCount };

    return NextResponse.json({ data, total, page, pageSize, summary, branchSummaries });
  } catch (error) {
    console.error("GET /api/personnels error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

/* -------------------- POST /api/personnels -------------------- */
export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);

  if (!auth || !["DEV", "ADMIN", "MANAGER"].includes(auth.role)) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, email, password, staffCode, branchId, role, isOrgOwner } = body;

    if (!email || !password) {
      return NextResponse.json({ message: "Missing credentials" }, { status: 400 });
    }

    // Ensure unique within organization
    const exists = await prisma.authorizedPersonnel.findFirst({
      where: { email, organizationId: auth.organizationId },
    });

    if (exists) {
      return NextResponse.json({ message: "User already exists in this organization" }, { status: 409 });
    }

    // Create personnel + optional branch assignment transactionally
    const newPersonnel = await prisma.$transaction(async tx => {
      const personnel = await tx.authorizedPersonnel.create({
        data: {
          name,
          email,
          password, // TODO: hash password before storing!
          staffCode,
          organizationId: auth.organizationId,
          branchId: branchId || null,
          isOrgOwner: isOrgOwner || false,
        },
      });

      if (branchId && role) {
        await tx.branchAssignment.create({
          data: { personnelId: personnel.id, branchId, role },
        });
      }

      return personnel;
    });

    return NextResponse.json(newPersonnel, { status: 201 });
  } catch (error) {
    console.error("POST /api/personnels error:", error);
    return NextResponse.json({ message: "Failed to create personnel" }, { status: 500 });
  }
}