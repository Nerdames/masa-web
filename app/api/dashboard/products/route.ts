"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import dayjs from "dayjs";
import type {
  ProductsResponse,
  BranchProductsQuery,
  InventoryProduct,
} from "@/types";

// -----------------------------------------------------------------------------
// GET PRODUCTS (BRANCH INVENTORY)
// -----------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId || !session.user.branchId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = session.user.organizationId;
    const branchId = session.user.branchId;

    const params = Object.fromEntries(
      req.nextUrl.searchParams.entries()
    ) as BranchProductsQuery;

    const page = Math.max(Number(params.page ?? 1), 1);
    const pageSize = Math.max(Number(params.pageSize ?? 10), 1);
    const search = params.search?.trim();

    // -------------------------------------------------------------------------
    // PRODUCT FILTER
    // -------------------------------------------------------------------------
    const productWhere: Prisma.ProductWhereInput = {
      organizationId,
      deletedAt: null,
      branches: {
        some: {
          branchId,
          organizationId,
        },
      },
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          {
            category: {
              name: { contains: search, mode: "insensitive" },
            },
          },
        ],
      }),
    };

    // -------------------------------------------------------------------------
    // FETCH DATA
    // -------------------------------------------------------------------------
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
              orderItems: {
                where: {
                  order: {
                    status: { in: ["DRAFT", "SUBMITTED"] },
                    deletedAt: null,
                  },
                },
                select: { quantity: true },
              },
              sales: {
                where: {
                  status: "COMPLETED",
                  deletedAt: null,
                },
                select: { quantity: true, createdAt: true },
              },
              stockMoves: {
                take: 5,
                orderBy: { createdAt: "desc" },
                select: {
                  type: true,
                  quantity: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      }),
    ]);

    // -------------------------------------------------------------------------
    // METRICS
    // -------------------------------------------------------------------------
    let totalQuantity = 0;
    let totalValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let pendingOrdersTotal = 0;

    const data: InventoryProduct[] = [];

    for (const product of products) {
      const bp = product.branches.find(b => b.branchId === branchId);
      if (!bp) continue;

      totalQuantity += bp.stock;
      totalValue += bp.stock * bp.sellingPrice;

      let tag: InventoryProduct["tag"] = "NORMAL";

      if (bp.stock <= 0) {
        tag = "OUT_OF_STOCK";
        outOfStockCount++;
      } else if (bp.stock <= bp.reorderLevel) {
        tag = "LOW_STOCK";
        lowStockCount++;
      }

      const totalSold = bp.sales.reduce(
        (sum, sale) => sum + sale.quantity,
        0
      );

      const sortedSales = [...bp.sales].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );

      const firstSaleAt = sortedSales[0]?.createdAt ?? null;
      const lastSaleAt = sortedSales.at(-1)?.createdAt ?? null;

      const daysActive =
        firstSaleAt && lastSaleAt
          ? Math.max(
              dayjs(lastSaleAt).diff(dayjs(firstSaleAt), "day"),
              1
            )
          : 1;

      const salesVelocity = totalSold / daysActive;

      const pendingOrders = bp.orderItems.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      pendingOrdersTotal += pendingOrders;

      data.push({
        id: product.id,
        organizationId: product.organizationId,
        name: product.name,
        sku: product.sku,
        category: product.category
          ? {
              id: product.category.id,
              organizationId: product.category.organizationId,
              name: product.category.name,
              description: product.category.description,
              createdAt: product.category.createdAt.toISOString(),
            }
          : null,
        stock: bp.stock,
        sellingPrice: bp.sellingPrice,
        unit: bp.unit ?? "pcs",
        tag,
        pendingOrders,
        totalSold,
        salesVelocity,
        supplier: bp.supplier
          ? { id: bp.supplier.id, name: bp.supplier.name }
          : null,
        lastSoldAt:
          bp.lastSoldAt?.toISOString() ??
          (lastSaleAt ? lastSaleAt.toISOString() : null),
        lastRestockedAt: bp.lastRestockedAt?.toISOString() ?? null,
        stockMoves: bp.stockMoves.map(sm => ({
          type: sm.type,
          quantity: sm.quantity,
          createdAt: sm.createdAt.toISOString(),
        })),
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
      });
    }

    // -------------------------------------------------------------------------
    // RESPONSE
    // -------------------------------------------------------------------------
    const response: ProductsResponse = {
      data,
      total,
      page,
      pageSize,
      totalQuantity,
      totalValue,
      lowStockCount,
      outOfStockCount,
      discontinuedCount: 0,
      hotCount: 0,
      pendingOrders: pendingOrdersTotal,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("GET products failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}

// -----------------------------------------------------------------------------
// DELETE SINGLE PRODUCT (SOFT DELETE)
// -----------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Missing product ID" },
        { status: 400 }
      );
    }

    const product = await prisma.product.update({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({
      message: "Product deleted",
      productId: product.id,
      deletedAt: product.deletedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("DELETE product failed:", error);
    return NextResponse.json(
      { error: "Failed to delete product" },
      { status: 500 }
    );
  }
}

// -----------------------------------------------------------------------------
// BULK DELETE PRODUCTS
// -----------------------------------------------------------------------------
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: { ids?: string[] } = await req.json();

    if (!body.ids || body.ids.length === 0) {
      return NextResponse.json(
        { error: "No product IDs provided" },
        { status: 400 }
      );
    }

    const result = await prisma.product.updateMany({
      where: {
        id: { in: body.ids },
        organizationId: session.user.organizationId,
      },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({
      message: `${result.count} product(s) deleted`,
      deletedIds: body.ids,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("PATCH bulk delete failed:", error);
    return NextResponse.json(
      { error: "Bulk delete failed" },
      { status: 500 }
    );
  }
}
  