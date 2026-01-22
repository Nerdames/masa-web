import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Product, ProductTag, BranchProduct, ProductsResponse } from "@/types";
import type { Prisma } from "@prisma/client";

interface BranchProductsQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  tag?: "ALL" | ProductTag;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.branchId || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized or branch not assigned" }, { status: 401 });
    }

    const branchId = session.user.branchId;
    const organizationId = session.user.organizationId;

    // Query params
    const params = Object.fromEntries(req.nextUrl.searchParams.entries()) as BranchProductsQuery;
    const page = Math.max(parseInt(params.page ?? "1", 10), 1);
    const pageSize = Math.max(parseInt(params.pageSize ?? "10", 10), 1);
    const search = params.search?.trim() ?? "";
    const tag = params.tag ?? "ALL";

    // ---------------- Branch filter ----------------
    const branchFilter: Prisma.BranchProductWhereInput = { branchId };
    if (tag === "LOW_STOCK") branchFilter.stock = { lte: 5, gt: 0 };
    else if (tag === "OUT_OF_STOCK") branchFilter.stock = 0;

    // ---------------- Product where ----------------
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      organizationId,
      branches: { some: branchFilter },
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          { category: { name: { contains: search, mode: "insensitive" } } },
        ],
      }),
    };

    // ---------------- Fetch ----------------
    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          branches: { where: { branchId }, include: { supplier: true } },
          category: true,
        },
      }),
    ]);

    // ---------------- Map ----------------
    const data: Product[] = products.map((p) => {
      const branch: BranchProduct = p.branches[0]!; // guaranteed to exist
      return {
        id: p.id,
        organizationId: p.organizationId,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode ?? null,
        description: p.description ?? null,
        categoryId: p.categoryId ?? null,
        supplierId: branch.supplierId ?? null,
        costPrice: branch.costPrice ?? p.costPrice,
        sellingPrice: branch.sellingPrice,
        currency: p.currency,
        tag: branch.tag,
        stock: branch.stock,
        deletedAt: p.deletedAt ?? null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),

        category: p.category ?? null,
        supplier: branch.supplier ?? null,
        branches: p.branches,
        orderItems: [],
        sales: [],
        stockMoves: [],
      };
    });

    return NextResponse.json<ProductsResponse>({
      data,
      total,
      page,
      pageSize,
    });
  } catch (err) {
    console.error("Branch Products API Error:", err);
    return NextResponse.json({ error: "Failed to fetch branch products" }, { status: 500 });
  }
}
