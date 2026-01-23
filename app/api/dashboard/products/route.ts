import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getToken } from "next-auth/jwt";
import { Prisma } from "@prisma/client";

const secret = process.env.NEXTAUTH_SECRET as string;

/* -----------------------------
   Types
----------------------------- */

export type ProductResponse = {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  description?: string | null;
  categoryId?: string | null;
  costPrice: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  categoryName?: string | null;
};

export type ProductsApiResponse = {
  products: ProductResponse[];
  totalCount: number;
};

/* -----------------------------
   GET — List generic products
----------------------------- */
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (
      !token ||
      !["DEV", "ADMIN", "MANAGER", "INVENTORY"].includes(token.role as string)
    ) {
      return NextResponse.json(
        { products: [], totalCount: 0, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1);
    const pageSize = Math.min(
      Math.max(Number(url.searchParams.get("pageSize") ?? 20), 1),
      100
    );
    const search = url.searchParams.get("search")?.trim() ?? "";

    const skip = (page - 1) * pageSize;

    const where: Prisma.ProductWhereInput = {
      organizationId: token.organizationId,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
              { barcode: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          category: true,
        },
      }),
      prisma.product.count({ where }),
    ]);

    const serialized: ProductResponse[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode ?? null,
      description: p.description ?? null,
      categoryId: p.categoryId ?? null,
      costPrice: p.costPrice,
      currency: p.currency,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      categoryName: p.category?.name ?? null,
    }));

    return NextResponse.json({ products: serialized, totalCount });
  } catch (error) {
    console.error("GET /api/dashboard/products error:", error);
    return NextResponse.json(
      { products: [], totalCount: 0, error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}

/* -----------------------------
   POST — Create product (generic)
----------------------------- */
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (!token || !["DEV", "ADMIN", "INVENTORY"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    if (!body.name || !body.sku || typeof body.costPrice !== "number") {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const product = await prisma.product.create({
      data: {
        name: body.name,
        sku: body.sku,
        barcode: body.barcode ?? null,
        description: body.description ?? null,
        categoryId: body.categoryId ?? null,
        costPrice: body.costPrice,
        currency: body.currency ?? "NGN",
        organizationId: token.organizationId!,
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("POST /api/dashboard/products error:", error);
    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 500 }
    );
  }
}

/* -----------------------------
   PUT — Update product (generic)
----------------------------- */
export async function PUT(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (!token || !["DEV", "ADMIN", "INVENTORY"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    if (!body.id) {
      return NextResponse.json(
        { error: "Product ID required" },
        { status: 400 }
      );
    }

    const updated = await prisma.product.updateMany({
      where: {
        id: body.id,
        organizationId: token.organizationId,
        deletedAt: null,
      },
      data: {
        name: body.name,
        sku: body.sku,
        barcode: body.barcode ?? null,
        description: body.description ?? null,
        categoryId: body.categoryId ?? null,
        costPrice: body.costPrice,
        currency: body.currency,
      },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { error: "Product not found or unauthorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/dashboard/products error:", error);
    return NextResponse.json(
      { error: "Failed to update product" },
      { status: 500 }
    );
  }
}

/* -----------------------------
   DELETE — Soft delete product
----------------------------- */
export async function DELETE(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (!token || !["DEV", "ADMIN"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "Product ID required" },
        { status: 400 }
      );
    }

    const deleted = await prisma.product.updateMany({
      where: {
        id,
        organizationId: token.organizationId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });

    if (deleted.count === 0) {
      return NextResponse.json(
        { error: "Product not found or unauthorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("DELETE /api/dashboard/products error:", error);
    return NextResponse.json(
      { error: "Failed to delete product" },
      { status: 500 }
    );
  }
}
