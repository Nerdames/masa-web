import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

interface BranchSuppliersQuery {
  page?: string;
  pageSize?: string;
  search?: string;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.branchId || !session.user.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized or branch not assigned" },
        { status: 401 }
      );
    }

    const branchId = session.user.branchId;
    const organizationId = session.user.organizationId;

    // ---------------- Query params ----------------
    const params = Object.fromEntries(
      req.nextUrl.searchParams.entries()
    ) as BranchSuppliersQuery;

    const page = Math.max(Number(params.page ?? 1), 1);
    const pageSize = Math.max(Number(params.pageSize ?? 10), 1);
    const search = params.search?.trim();

    // ---------------- Supplier where ----------------
    const where: Prisma.SupplierWhereInput = {
      organizationId,
      branchProducts: {
        some: {
          branchId,
          organizationId,
        },
      },
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    // ---------------- Fetch ----------------
    const [total, suppliers] = await Promise.all([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          branchProducts: {
            where: { branchId },
            select: {
              id: true,
              productId: true,
              sellingPrice: true,
              stock: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      data: suppliers.map((s) => ({
        id: s.id,
        organizationId: s.organizationId,
        name: s.name,
        email: s.email ?? null,
        phone: s.phone ?? null,
        address: s.address ?? null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        branchProducts: s.branchProducts,
      })),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Branch Suppliers API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch suppliers" },
      { status: 500 }
    );
  }
}
