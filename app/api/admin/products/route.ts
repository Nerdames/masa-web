import { NextRequest, NextResponse } from "next/server";
import prisma  from "@/lib/prisma";
import { requireAdmin } from "@/lib/guards/requireAdmin";
import { Prisma } from "@prisma/client";

export type ProductResponse = {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number;
  costPrice: number;
  stock: number;
  reorderLevel: number;
  unit?: string | null;
  tag?: "DISCONTINUED" | "OUT_OF_STOCK" | "LOW_STOCK" | "HOT" | null;
  totalSold: number;
  revenue: number;
  branchName?: string | null;
  supplierId?: string | null;
  createdAt: string;
};

export type ProductsApiResponse = {
  products: ProductResponse[];
  totalCount: number;
};

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const page = Math.max(parseInt(url.searchParams.get("page") ?? "1", 10), 1);
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") ?? "20", 10), 1), 100);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const supplierId = url.searchParams.get("supplierId")?.trim() || undefined;

    const skip = (page - 1) * pageSize;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(supplierId ? { supplierId } : {}),
    };

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          supplier: { select: { id: true } },
          branches: { select: { stock: true, reorderLevel: true, branch: { select: { name: true } } } },
          sales: { select: { quantity: true, total: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    const serializedProducts: ProductResponse[] = products.map((p) => {
      const totalSold = p.sales.reduce((acc, s) => acc + s.quantity, 0);
      const revenue = p.sales.reduce((acc, s) => acc + s.total, 0);
      const branchStock = p.branches[0]; // Default to first branch; adjust if multiple
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        sellingPrice: p.sellingPrice,
        costPrice: p.costPrice,
        stock: branchStock?.stock ?? p.stock ?? 0,
        reorderLevel: branchStock?.reorderLevel ?? 0,
        unit: null,
        tag: p.tag ?? null,
        totalSold,
        revenue,
        branchName: branchStock?.branch?.name ?? null,
        supplierId: p.supplier?.id ?? null,
        createdAt: p.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ products: serializedProducts, totalCount });
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json(
      { products: [], totalCount: 0, error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    const product = await prisma.product.create({ data: body });
    return NextResponse.json(product);
  } catch (error) {
    console.error("POST /api/products error:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    const product = await prisma.product.update({
      where: { id: body.id },
      data: body,
    });
    return NextResponse.json(product);
  } catch (error) {
    console.error("PUT /api/products error:", error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    await prisma.product.delete({ where: { id: body.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/products error:", error);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
