import { NextRequest, NextResponse } from "next/server";
import prisma  from "@/lib/prisma";
import { getToken } from "next-auth/jwt";
import { Prisma } from "@prisma/client";

const secret = process.env.NEXTAUTH_SECRET as string;

export type ProductResponse = {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  description?: string | null;
  categoryId?: string | null;
  supplierId?: string | null;
  costPrice: number;
  sellingPrice: number;
  currency: string;
  tag?: "DISCONTINUED" | "OUT_OF_STOCK" | "LOW_STOCK" | "HOT" | null;
  stock: number;
  createdAt: string;
  updatedAt: string;
  categoryName?: string | null;
  supplierName?: string | null;
};

export type ProductsApiResponse = {
  products: ProductResponse[];
  totalCount: number;
};

// --------------------------
// GET — Fetch paginated products
// --------------------------
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !["DEV", "ADMIN", "MANAGER", "INVENTORY"].includes(token.role as string)) {
      return NextResponse.json({ products: [], totalCount: 0, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const page = Math.max(parseInt(url.searchParams.get("page") ?? "1", 10), 1);
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") ?? "20", 10), 1), 100);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const supplierId = url.searchParams.get("supplierId")?.trim() || undefined;

    const skip = (page - 1) * pageSize;

    const orgId = token.organizationId;

    const where: Prisma.ProductWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      ...(search
        ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }] }
        : {}),
      ...(supplierId ? { supplierId } : {}),
    };

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: { category: true, supplier: true },
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
      supplierId: p.supplierId ?? null,
      costPrice: p.costPrice,
      sellingPrice: p.sellingPrice,
      currency: p.currency,
      tag: p.tag ?? null,
      stock: p.stock ?? 0,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      categoryName: p.category?.name ?? null,
      supplierName: p.supplier?.name ?? null,
    }));

    return NextResponse.json({ products: serialized, totalCount });
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json({ products: [], totalCount: 0, error: "Failed to fetch products" }, { status: 500 });
  }
}

// --------------------------
// POST — Create a product
// --------------------------
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !["DEV", "ADMIN", "INVENTORY"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const product = await prisma.product.create({
      data: {
        ...body,
        organizationId: token.organizationId ?? "",
        stock: body.stock ?? 0,
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("POST /api/products error:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}

// --------------------------
// PUT — Update a product
// --------------------------
export async function PUT(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !["DEV", "ADMIN", "INVENTORY"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "Product ID required" }, { status: 400 });

    const updated = await prisma.product.update({
      where: { id: body.id },
      data: body,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/products error:", error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

// --------------------------
// DELETE — Delete a product
// --------------------------
export async function DELETE(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !["DEV", "ADMIN"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Product ID required" }, { status: 400 });

    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("DELETE /api/products error:", error);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
