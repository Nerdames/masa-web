"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { SaleStatus, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import dayjs from "dayjs";
import type { VendorFull } from "@/types/vendor";

/* -------------------- Helpers -------------------- */
const toNumber = (value: number | Decimal | null | undefined): number =>
  value instanceof Decimal ? value.toNumber() : Number(value ?? 0);

const parseDate = (value: string | null): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
};

const sanitizePageLimit = (page: number, limit: number) => {
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 10;
  return { safePage, safeLimit };
};

/* -------------------- Auth -------------------- */
async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user || !("organizationId" in session.user)) {
    throw { status: 401, message: "Unauthorized" };
  }

  const { role, isOrgOwner, disabled, deletedAt } = session.user as {
    role: string;
    isOrgOwner: boolean;
    disabled?: boolean;
    deletedAt?: Date | null;
  };

  if (disabled || deletedAt) {
    throw { status: 403, message: "Account disabled" };
  }

  if (role !== "ADMIN" && !isOrgOwner) {
    throw { status: 403, message: "Forbidden" };
  }

  return session.user;
}

/* -------------------- GET /api/vendors -------------------- */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAdmin();
    const { organizationId, branchId, isOrgOwner } = user;

    const params = req.nextUrl.searchParams;
    const { safePage: page, safeLimit: limit } = sanitizePageLimit(
      Number(params.get("page")),
      Number(params.get("limit"))
    );
    const search = params.get("search")?.trim() ?? "";
    const sort = params.get("sort")?.trim() ?? "performance";
    const fromDate = parseDate(params.get("from"));
    const toDate = parseDate(params.get("to"));

    const dateFilter: Prisma.SaleWhereInput = fromDate && toDate
      ? { createdAt: { gte: fromDate, lte: toDate } }
      : {};

    const vendorWhere: Prisma.VendorWhereInput = {
      organizationId,
      deletedAt: null,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...(isOrgOwner
        ? {}
        : { branchProducts: { some: { branchId, organizationId, deletedAt: null } } }),
    };

    const totalVendors = await prisma.vendor.count({ where: vendorWhere });

    const vendorsRaw = await prisma.vendor.findMany({
      where: vendorWhere,
      include: {
        branchProducts: {
          where: { organizationId, deletedAt: null, ...(isOrgOwner ? {} : { branchId }) },
          include: {
            sales: {
              where: { organizationId, status: SaleStatus.COMPLETED, deletedAt: null, ...dateFilter },
              select: { quantity: true, total: true, createdAt: true },
            },
          },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    /* -------------------- Compute Analytics -------------------- */
    const vendors: VendorFull[] = vendorsRaw.map((vendor) => {
      let totalRevenue = 0;
      let totalQuantitySold = 0;
      let totalStockValue = 0;
      const salesDates: Date[] = [];

      const branchProducts = vendor.branchProducts.map((bp) => {
        totalStockValue += Number(bp.stock ?? 0) * toNumber(bp.sellingPrice);
        bp.sales.forEach((sale) => {
          totalRevenue += toNumber(sale.total);
          totalQuantitySold += sale.quantity;
          salesDates.push(sale.createdAt);
        });
        return { ...bp, sales: bp.sales.map((s) => ({ ...s, quantity: Number(s.quantity), total: toNumber(s.total) })) };
      });

      let salesVelocity = 0;
      if (salesDates.length > 0) {
        const sorted = salesDates.sort((a, b) => a.getTime() - b.getTime());
        const first = sorted[0], last = sorted[sorted.length - 1];
        const daysActive = Math.max(dayjs(last).diff(dayjs(first), "day") + 1, 1);
        salesVelocity = totalQuantitySold / daysActive;
      }

      return { ...vendor, branchProducts, productsSupplied: branchProducts.length, totalRevenue, totalQuantitySold, totalStockValue, salesVelocity, performanceScore: 0 };
    });

    /* -------------------- Normalize Performance -------------------- */
    const maxRevenue = Math.max(...vendors.map((v) => v.totalRevenue), 1);
    const maxVelocity = Math.max(...vendors.map((v) => v.salesVelocity), 1);
    const maxDiversity = Math.max(...vendors.map((v) => v.productsSupplied), 1);

    vendors.forEach((v) => {
      const revenueScore = (v.totalRevenue / maxRevenue) * 40;
      const velocityScore = (v.salesVelocity / maxVelocity) * 30;
      const diversityScore = (v.productsSupplied / maxDiversity) * 20;
      const stockScore = v.totalStockValue > 0 ? 10 : 0;
      v.performanceScore = Math.round(revenueScore + velocityScore + diversityScore + stockScore);
    });

    const sortedVendors = [...vendors].sort((a, b) => {
      switch (sort) {
        case "newest": return b.createdAt.getTime() - a.createdAt.getTime();
        case "oldest": return a.createdAt.getTime() - b.createdAt.getTime();
        case "highest_spent": return b.totalRevenue - a.totalRevenue;
        case "lowest_spent": return a.totalRevenue - b.totalRevenue;
        default: return b.performanceScore - a.performanceScore;
      }
    });

    return NextResponse.json({
      summary: { totalVendors, totalRevenue: vendors.reduce((sum, v) => sum + v.totalRevenue, 0) },
      vendors: sortedVendors,
      pagination: { total: totalVendors, page, totalPages: Math.max(1, Math.ceil(totalVendors / limit)), limit },
    });
  } catch (err: unknown) {
    console.error("Vendor GET failed:", err);
    const message = (err as { message?: string })?.message || "Failed to load vendors";
    const status = (err as { status?: number })?.status || 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/* -------------------- POST /api/vendors -------------------- */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    const { organizationId } = user;

    const body: { name?: string; email?: string; phone?: string; address?: string } = await req.json();
    if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const existing = await prisma.vendor.findFirst({ where: { organizationId, name: body.name.trim(), deletedAt: null } });
    if (existing) return NextResponse.json({ error: "Vendor already exists" }, { status: 409 });

    const newVendor = await prisma.vendor.create({
      data: { organizationId, name: body.name.trim(), email: body.email?.trim() ?? null, phone: body.phone?.trim() ?? null, address: body.address?.trim() ?? null },
    });

    return NextResponse.json({ vendor: newVendor });
  } catch (err: unknown) {
    const message = (err as { message?: string })?.message || "Failed to create vendor";
    const status = (err as { status?: number })?.status || 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/* -------------------- PATCH /api/vendors/:id -------------------- */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdmin();
    const { organizationId } = user;
    const { id } = params;

    const body: { name?: string; email?: string; phone?: string; address?: string } = await req.json();

    const vendor = await prisma.vendor.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    if (body.name && body.name.trim() !== vendor.name) {
      const duplicate = await prisma.vendor.findFirst({ where: { organizationId, name: body.name.trim(), deletedAt: null, NOT: { id } } });
      if (duplicate) return NextResponse.json({ error: "Vendor with this name already exists" }, { status: 409 });
    }

    const updated = await prisma.vendor.update({
      where: { id },
      data: { name: body.name?.trim(), email: body.email?.trim() ?? null, phone: body.phone?.trim() ?? null, address: body.address?.trim() ?? null },
    });

    return NextResponse.json({ vendor: updated });
  } catch (err: unknown) {
    const message = (err as { message?: string })?.message || "Failed to update vendor";
    const status = (err as { status?: number })?.status || 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/* -------------------- DELETE /api/vendors/:id -------------------- */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdmin();
    const { organizationId } = user;
    const { id } = params;

    const vendor = await prisma.vendor.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { branchProducts: { where: { deletedAt: null } } },
    });

    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    if (vendor.branchProducts.length > 0) return NextResponse.json({ error: "Cannot delete vendor linked to active products" }, { status: 400 });

    await prisma.vendor.update({ where: { id }, data: { deletedAt: new Date() } });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = (err as { message?: string })?.message || "Failed to delete vendor";
    const status = (err as { status?: number })?.status || 500;
    return NextResponse.json({ error: message }, { status });
  }
}