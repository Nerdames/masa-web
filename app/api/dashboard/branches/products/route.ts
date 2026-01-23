import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Prisma, ProductTag } from "@prisma/client";
import type { Product, BranchProduct, ProductsResponse } from "@/types";

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
    ) as BranchProductsQuery;

    const page = Math.max(Number(params.page ?? 1), 1);
    const pageSize = Math.max(Number(params.pageSize ?? 10), 1);
    const search = params.search?.trim();
    const tag = params.tag ?? "ALL";

    // ---------------- BranchProduct filter ----------------
    const branchProductWhere: Prisma.BranchProductWhereInput = {
      branchId,
      organizationId,
    };

    if (tag !== "ALL") {
      branchProductWhere.tag = tag;

      if (tag === "LOW_STOCK") {
        branchProductWhere.stock = { gt: 0, lte: 5 };
      }

      if (tag === "OUT_OF_STOCK") {
        branchProductWhere.stock = 0;
      }
    }

    // ---------------- Product where ----------------
    const productWhere: Prisma.ProductWhereInput = {
      organizationId,
      deletedAt: null,
      branches: {
        some: branchProductWhere,
      },
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
      prisma.product.count({ where: productWhere }),
      prisma.product.findMany({
        where: productWhere,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          category: true,
          branches: {
            where: { branchId },
            include: {
              supplier: true,
            },
          },
        },
      }),
    ]);

    // ---------------- Map ----------------
    const data: Product[] = products.map((product) => {
      const branchProduct = product.branches[0] as BranchProduct;

      return {
        id: product.id,
        organizationId: product.organizationId,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode ?? null,
        description: product.description ?? null,

        categoryId: product.categoryId ?? null,
        supplierId: branchProduct.supplierId ?? null,

        costPrice: branchProduct.costPrice ?? product.costPrice,
        sellingPrice: branchProduct.sellingPrice,
        currency: product.currency,

        tag: branchProduct.tag,
        stock: branchProduct.stock,

        deletedAt: product.deletedAt ?? null,
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),

        category: product.category ?? null,
        supplier: branchProduct.supplier ?? null,
        branches: product.branches,

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
  } catch (error) {
    console.error("Branch Products API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch branch products" },
      { status: 500 }
    );
  }
}
