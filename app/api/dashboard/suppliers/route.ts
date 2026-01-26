import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

interface SuppliersQuery {
  page?: string;
  pageSize?: string;
  search?: string;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.organizationId || !session.user.branchId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = session.user.organizationId;
    const branchId = session.user.branchId;

    const params = Object.fromEntries(req.nextUrl.searchParams.entries()) as SuppliersQuery;
    const page = Math.max(Number(params.page ?? 1), 1);
    const pageSize = Math.max(Number(params.pageSize ?? 10), 1);
    const search = params.search?.trim();

    const where: Prisma.SupplierWhereInput = {
      organizationId: orgId,
      branchProducts: { some: { branchId } },
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [total, suppliers] = await Promise.all([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ data: suppliers, total, page, pageSize });
  } catch (err) {
    console.error("Suppliers API Error:", err);
    return NextResponse.json({ error: "Failed to fetch suppliers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.organizationId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    if (!body.name) return NextResponse.json({ error: "Supplier name required" }, { status: 400 });

    const supplier = await prisma.supplier.create({
      data: {
        name: body.name,
        email: body.email ?? null,
        phone: body.phone ?? null,
        address: body.address ?? null,
        organizationId: session.user.organizationId,
      },
    });

    return NextResponse.json(supplier, { status: 201 });
  } catch (err) {
    console.error("Create Supplier Error:", err);
    return NextResponse.json({ error: "Failed to create supplier" }, { status: 500 });
  }
}
