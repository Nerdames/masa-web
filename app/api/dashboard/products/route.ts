"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type {
  ProductsResponse,
  BranchProductsQuery,
  InventoryProduct,
} from "@/types";
import dayjs from "dayjs";

// ------------------------------ GET PRODUCTS ------------------------------
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.branchId || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const branchId = session.user.branchId;
    const organizationId = session.user.organizationId;

    const params = Object.fromEntries(
      req.nextUrl.searchParams.entries()
    ) as BranchProductsQuery;

    const page = Math.max(Number(params.page ?? 1), 1);
    const pageSize = Math.max(Number(params.pageSize ?? 10), 1);
    const search = params.search?.trim();
    const tag = params.tag ?? "ALL";
    const sort = params.sort ?? "";

    // ------------------------------ Branch Filter ------------------------------
    const branchProductWhere: Prisma.BranchProductWhereInput = {
      branchId,
      organizationId,
      ...(tag !== "ALL" && { tag }),
    };

    // ------------------------------ Product Filter ------------------------------
    const productWhere: Prisma.ProductWhereInput = {
      organizationId,
      deletedAt: null,
      branches: { some: branchProductWhere },
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          { category: { name: { contains: search, mode: "insensitive" } } },
        ],
      }),
    };

    // ------------------------------ Sort ------------------------------
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sort === "az"
        ? { name: "asc" }
        : sort === "newest"
        ? { createdAt: "desc" }
        : { createdAt: "desc" };

    // ------------------------------ Fetch Data ------------------------------
    const [total, products] = await Promise.all([
      prisma.product.count({ where: productWhere }),
      prisma.product.findMany({
        where: productWhere,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
        include: {
          category: true,
          branches: {
            where: { branchId },
            include: {
              supplier: true,
              orderItems: {
                where: { order: { status: { in: ["PENDING", "PROCESSING"] } } },
                select: { quantity: true },
              },
              sales: { select: { quantity: true, createdAt: true } },
              stockMoves: {
                take: 5,
                orderBy: { createdAt: "desc" },
                select: { type: true, quantity: true, createdAt: true },
              },
            },
          },
        },
      }),
    ]);

    // ------------------------------ Transform Data ------------------------------
    let totalQuantity = 0;
    let totalValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let discontinuedCount = 0;
    let hotCount = 0;
    let totalPendingOrders = 0;

    const data = products
      .map(product => {
        const bp = product.branches[0];
        if (!bp) return null;

        totalQuantity += bp.stock;
        totalValue += bp.stock * bp.sellingPrice;

        if (bp.tag === "LOW_STOCK") lowStockCount++;
        if (bp.tag === "OUT_OF_STOCK") outOfStockCount++;
        if (bp.tag === "DISCONTINUED") discontinuedCount++;
        if (bp.tag === "HOT") hotCount++;

        const totalSold = bp.sales?.reduce((sum, s) => sum + s.quantity, 0) ?? 0;

        const firstSaleAt = bp.sales?.length
          ? bp.sales[bp.sales.length - 1].createdAt
          : null;
        const lastSaleAt = bp.sales?.length ? bp.sales[0].createdAt : null;

        const daysActive =
          firstSaleAt && lastSaleAt
            ? Math.max(dayjs(lastSaleAt).diff(dayjs(firstSaleAt), "day"), 1)
            : 1;

        const salesVelocity = totalSold / daysActive;

        const pendingOrders = bp.orderItems?.reduce((s, i) => s + i.quantity, 0) ?? 0;
        totalPendingOrders += pendingOrders;

        const item: InventoryProduct = {
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
          tag: bp.tag,
          unit: bp.unit ?? "pcs",
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
          stockMoves:
            bp.stockMoves?.map(sm => ({
              type: sm.type,
              quantity: sm.quantity,
              createdAt: sm.createdAt.toISOString(),
            })) ?? [],
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
        };

        return item;
      })
      .filter((p): p is InventoryProduct => p !== null);

    // ------------------------------ Return Full Response ------------------------------
    const response: ProductsResponse = {
      data,
      total,
      page,
      pageSize,
      totalQuantity,
      totalValue,
      lowStockCount,
      outOfStockCount,
      discontinuedCount,
      hotCount,
      pendingOrders: totalPendingOrders,
    };

    return NextResponse.json<ProductsResponse>(response);
  } catch (e) {
    console.error("GET products failed:", e);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}

// ------------------------------ DELETE SINGLE PRODUCT ------------------------------
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing product ID" }, { status: 400 });
    }

    const deletedProduct = await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({
      message: "Product deleted",
      productId: deletedProduct.id,
      deletedAt: deletedProduct.deletedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("DELETE product failed:", error);
    return NextResponse.json(
      { error: "Failed to delete product" },
      { status: 500 }
    );
  }
}

// ------------------------------ BULK DELETE PRODUCTS ------------------------------
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { ids?: string[] };
    if (!body.ids || !body.ids.length) {
      return NextResponse.json({ error: "No product IDs provided" }, { status: 400 });
    }

    const updateResult = await prisma.product.updateMany({
      where: { id: { in: body.ids } },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({
      message: `${updateResult.count} product(s) deleted`,
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
