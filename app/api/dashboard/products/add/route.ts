"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Decimal, Prisma, Product, BranchProduct, Vendor, Category } from "@prisma/client";

/* -------------------- Helpers -------------------- */
const toNumber = (value: number | Decimal | null | undefined): number =>
  value instanceof Decimal ? value.toNumber() : Number(value ?? 0);

interface CreateVendorBody {
  action: "createVendor";
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface CreateProductsBody {
  action: "createProducts";
  branchId: string;
  products: Array<{
    name: string;
    sku: string;
    description?: string;
    barcode?: string;
    categoryId?: string;
    costPrice?: number;
    stock?: number;
    sellingPrice?: number;
    unit?: string;
    vendorId?: string;
  }>;
}

type POSTBody = CreateVendorBody | CreateProductsBody;

/* -------------------- GET /api/products -------------------- */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId || !session.user.branchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.user.organizationId;
  const branchId = session.user.branchId;
  const url = new URL(req.url);
  const vendorId = url.searchParams.get("vendorId");
  const productId = url.searchParams.get("productId");
  const vendorList = url.searchParams.get("vendorList");
  const categoryList = url.searchParams.get("categoryList");

  try {
    // -------------------- VENDORS --------------------
    if (vendorList === "true") {
      const vendors: Vendor[] = await prisma.vendor.findMany({
        where: { organizationId: orgId, deletedAt: null },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ vendors });
    }

    // -------------------- CATEGORIES --------------------
    if (categoryList === "true") {
      const categories: Category[] = await prisma.category.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ categories });
    }

    // -------------------- SINGLE PRODUCT --------------------
    if (productId) {
      const product: Product | null = await prisma.product.findUnique({
        where: { id: productId },
        include: { category: true },
      });
      return NextResponse.json({ product });
    }

    // -------------------- BRANCH PRODUCTS --------------------
    if (vendorId) {
      const branchProducts: (BranchProduct & { product: Product; vendor: Vendor | null })[] =
        await prisma.branchProduct.findMany({
          where: { organizationId: orgId, branchId, vendorId, deletedAt: null },
          include: { product: true, vendor: true },
        });
      return NextResponse.json({ data: branchProducts });
    }

    // -------------------- GENERIC PRODUCTS --------------------
    const products: Product[] = await prisma.product.findMany({
      where: { organizationId: orgId },
      include: { category: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ data: products });
  } catch (err) {
    console.error("GET products failed:", err);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

/* -------------------- POST /api/products -------------------- */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId || !session.user.branchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.user.organizationId;

  const body: POSTBody = await req.json();

  try {
    // -------------------- CREATE VENDOR --------------------
    if (body.action === "createVendor") {
      if (!body.name.trim()) return NextResponse.json({ error: "Vendor name required" }, { status: 400 });

      let vendor: Vendor | null = await prisma.vendor.findFirst({
        where: { organizationId: orgId, name: body.name.trim() },
      });

      if (!vendor) {
        vendor = await prisma.vendor.create({
          data: {
            organizationId: orgId,
            name: body.name.trim(),
            email: body.email?.trim() ?? null,
            phone: body.phone?.trim() ?? null,
            address: body.address?.trim() ?? null,
          },
        });
      }

      return NextResponse.json({ vendor });
    }

    // -------------------- CREATE PRODUCTS --------------------
    if (body.action === "createProducts") {
      const { branchId, products } = body;
      if (!branchId || !products.length)
        return NextResponse.json({ error: "branchId and products required" }, { status: 400 });

      const created: Array<{ product: Product; branchProduct: BranchProduct }> = [];

      await prisma.$transaction(async (tx) => {
        for (const p of products) {
          // --- CREATE OR GET PRODUCT ---
          let product: Product | null = await tx.product.findFirst({
            where: { organizationId: orgId, sku: p.sku },
          });

          if (!product) {
            product = await tx.product.create({
              data: {
                organizationId: orgId,
                name: p.name,
                sku: p.sku,
                barcode: p.barcode,
                description: p.description,
                categoryId: p.categoryId,
                costPrice: p.costPrice ?? 0,
              },
            });
          }

          // --- CREATE OR GET BRANCHPRODUCT ---
          let branchProduct: BranchProduct | null = await tx.branchProduct.findFirst({
            where: { branchId, productId: product.id },
          });

          if (!branchProduct) {
            branchProduct = await tx.branchProduct.create({
              data: {
                organizationId: orgId,
                branchId,
                productId: product.id,
                stock: p.stock ?? 0,
                sellingPrice: p.sellingPrice ?? 0,
                unit: p.unit ?? "pcs",
                vendorId: p.vendorId,
                costPrice: p.costPrice ?? 0,
              },
            });
          }

          created.push({ product, branchProduct });
        }
      });

      return NextResponse.json({ success: true, created });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    console.error("POST products failed:", err);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Duplicate SKU or vendor detected" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create products" }, { status: 500 });
  }
}