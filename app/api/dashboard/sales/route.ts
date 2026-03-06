"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma, SaleStatus, PaymentMethod } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

/* ============================================================
   DTO & Types
============================================================ */

export type SaleDTO = {
  id: string;
  organizationId: string;
  branchId: string;
  branchProductId: string;
  productId: string;
  invoiceId: string;

  quantity: number;
  unitPrice: number;
  total: number;
  currency: string;
  status: SaleStatus;
  createdAt: Date;

  cashierId: string;
  customerId: string | null;

  productName: string | null;
  customerName: string | null;
  cashierName: string | null;

  paymentMethod: PaymentMethod | "N/A";
};

type Role = "DEV" | "ADMIN" | "MANAGER" | "SALES" | "CASHIER" | "INVENTORY";

interface AuthUser {
  id: string;
  organizationId: string;
  branchId?: string;
  role: Role;
  isOrgOwner: boolean;
  disabled?: boolean;
  deletedAt?: Date | null;
}

interface ApiError {
  status: number;
  message: string;
}

/* ============================================================
   Auth Helper
============================================================ */

async function requireDashboardAccess(
  allowedRoles: Role[] = ["ADMIN", "MANAGER", "DEV", "SALES", "CASHIER"]
): Promise<AuthUser> {
  const session = await getServerSession(authOptions);

  if (!session?.user || !("organizationId" in session.user)) {
    throw { status: 401, message: "Unauthorized" } as ApiError;
  }

  const user = session.user as AuthUser;

  if (user.disabled || user.deletedAt) {
    throw { status: 403, message: "Account disabled" } as ApiError;
  }

  const hasAccess = user.isOrgOwner || allowedRoles.includes(user.role);

  if (!hasAccess) {
    throw { status: 403, message: "Forbidden: Insufficient Permissions" } as ApiError;
  }

  return user;
}

/* ============================================================
   GET HANDLER
============================================================ */

export async function GET(req: NextRequest) {
  try {
    /* ================= AUTH ================= */
    const user = await requireDashboardAccess();
    const { organizationId, isOrgOwner, branchId: userBranchId } = user;

    /* ================= QUERY PARAMS ================= */
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(50, Number(searchParams.get("pageSize") ?? 10));
    const search = searchParams.get("search")?.trim() || undefined;

    const dateStartParam = searchParams.get("dateStart");
    const dateEndParam = searchParams.get("dateEnd");
    const dateStart = dateStartParam ? new Date(dateStartParam) : undefined;
    const dateEnd = dateEndParam ? new Date(dateEndParam) : undefined;

    if (dateEnd) dateEnd.setHours(23, 59, 59, 999);

    const statusParam = searchParams.get("status");
    const status =
      statusParam && Object.values(SaleStatus).includes(statusParam as SaleStatus)
        ? (statusParam as SaleStatus)
        : undefined;

    const sortParam = searchParams.get("sort") ?? "createdAt_DESC";

    /* ================= WHERE CLAUSE ================= */
    const where: Prisma.SaleWhereInput = {
      organizationId,
      deletedAt: null,
      ...(isOrgOwner ? {} : { branchId: userBranchId }),
      ...(status && { status }),
      ...(dateStart || dateEnd
        ? {
            createdAt: {
              ...(dateStart && { gte: dateStart }),
              ...(dateEnd && { lte: dateEnd }),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { product: { name: { contains: search, mode: "insensitive" } } },
              { customer: { name: { contains: search, mode: "insensitive" } } },
              { cashier: { name: { contains: search, mode: "insensitive" } } },
              { invoice: { invoiceNumber: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    /* ================= ORDER BY ================= */
    let orderBy: Prisma.SaleOrderByWithRelationInput = { createdAt: "desc" };
    if (sortParam === "createdAt_ASC") orderBy = { createdAt: "asc" };
    if (sortParam === "productName_ASC") orderBy = { product: { name: "asc" } };
    if (sortParam === "productName_DESC") orderBy = { product: { name: "desc" } };

    /* ================= FETCH & AGGREGATE ================= */
    const [sales, totalCount, aggregateData] = await Promise.all([
      prisma.sale.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: { select: { name: true } },
          customer: { select: { name: true } },
          cashier: { select: { name: true } },
          receipt: { select: { paymentMethod: true } },
        },
      }),
      prisma.sale.count({ where }),
      prisma.sale.aggregate({
        where,
        _sum: {
          total: true,
          quantity: true,
        },
      }),
    ]);

    /* ================= TRANSFORM ================= */
    const mappedSales: SaleDTO[] = sales.map((s) => ({
      id: s.id,
      organizationId: s.organizationId,
      branchId: s.branchId,
      branchProductId: s.branchProductId,
      productId: s.productId,
      invoiceId: s.invoiceId,

      quantity: s.quantity,
      unitPrice: (s.unitPrice as Decimal).toNumber(),
      total: (s.total as Decimal).toNumber(),
      currency: s.currency,
      status: s.status,
      createdAt: s.createdAt,

      cashierId: s.cashierId,
      customerId: s.customerId,

      productName: s.product?.name ?? "Unknown Product",
      customerName: s.customer?.name ?? "Walk-in Customer",
      cashierName: s.cashier?.name ?? "System",

      paymentMethod: s.receipt?.paymentMethod ?? "N/A",
    }));

    /* ================= RESPONSE ================= */
    return NextResponse.json({
      summary: {
        totalRevenue: (aggregateData._sum.total as Decimal | null)?.toNumber() ?? 0,
        totalItemsSold: aggregateData._sum.quantity ?? 0,
        transactionCount: totalCount,
      },
      sales: mappedSales,
      pagination: {
        total: totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error: unknown) {
    const err = error as ApiError;
    console.error("GET /api/dashboard/sales error:", err);

    return NextResponse.json(
      { error: err.message || "Failed to fetch sales" },
      { status: err.status || 500 }
    );
  }
}