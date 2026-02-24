import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma from "@/lib/prisma";
import {
  Prisma,
  SaleStatus,
  PaymentMethod,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

/* ============================================================
   ROLE CONTROL
============================================================ */

const ALLOWED_ROLES = ["DEV", "ADMIN", "SALES", "CASHIER"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

const secret = process.env.NEXTAUTH_SECRET as string;

/* ============================================================
   DTO
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

  paymentMethods: PaymentMethod[];
};

/* ============================================================
   GET HANDLER
============================================================ */

export async function GET(req: NextRequest) {
  try {
    /* ================= AUTH ================= */

    const token = await getToken({ req, secret });

    if (
      !token ||
      typeof token.role !== "string" ||
      typeof token.organizationId !== "string" ||
      !ALLOWED_ROLES.includes(token.role as AllowedRole)
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = token.organizationId;
    const branchId =
      typeof token.branchId === "string" ? token.branchId : undefined;

    /* ================= QUERY PARAMS ================= */

    const { searchParams } = new URL(req.url);

    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(50, Number(searchParams.get("pageSize") ?? 10));

    const search = searchParams.get("search")?.trim() || undefined;

    const dateStartParam = searchParams.get("dateStart");
    const dateEndParam = searchParams.get("dateEnd");

    const dateStart = dateStartParam ? new Date(dateStartParam) : undefined;
    const dateEnd = dateEndParam ? new Date(dateEndParam) : undefined;

    if (dateEnd) {
      dateEnd.setHours(23, 59, 59, 999);
    }

    /* ---------- Status Filter ---------- */

    const statusParam = searchParams.get("status");
    const status =
      statusParam &&
      Object.values(SaleStatus).includes(statusParam as SaleStatus)
        ? (statusParam as SaleStatus)
        : undefined;

    /* ---------- Payment Method Filter ---------- */

    const paymentMethodParam = searchParams.get("paymentMethod");

    const paymentMethods =
      paymentMethodParam
        ?.split(",")
        .map((pm) => pm.trim())
        .filter((pm) =>
          Object.values(PaymentMethod).includes(pm as PaymentMethod)
        ) as PaymentMethod[] | undefined;

    /* ---------- Sorting ---------- */

    const sortParam = searchParams.get("sort") ?? "createdAt_DESC";

    let orderBy: Prisma.SaleOrderByWithRelationInput = {
      createdAt: "desc",
    };

    switch (sortParam) {
      case "createdAt_ASC":
        orderBy = { createdAt: "asc" };
        break;

      case "createdAt_DESC":
        orderBy = { createdAt: "desc" };
        break;

      case "productName_ASC":
        orderBy = { product: { name: "asc" } };
        break;

      case "productName_DESC":
        orderBy = { product: { name: "desc" } };
        break;

      default:
        orderBy = { createdAt: "desc" };
    }

    /* ================= WHERE CLAUSE ================= */

    const where: Prisma.SaleWhereInput = {
      organizationId,
      deletedAt: null,

      ...(branchId && { branchId }),
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
              {
                product: {
                  name: { contains: search, mode: "insensitive" },
                },
              },
              {
                customer: {
                  name: { contains: search, mode: "insensitive" },
                },
              },
              {
                cashier: {
                  name: { contains: search, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),

      ...(paymentMethods?.length
        ? {
            receipts: {
              some: {
                paymentMethod: { in: paymentMethods },
              },
            },
          }
        : {}),
    };

    /* ================= FETCH ================= */

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: { select: { name: true } },
          customer: { select: { name: true } },
          cashier: { select: { name: true } },
          receipts: { select: { paymentMethod: true } },
        },
      }),

      prisma.sale.count({ where }),
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
      customerId: s.customerId ?? null,

      productName: s.product?.name ?? null,
      customerName: s.customer?.name ?? null,
      cashierName: s.cashier?.name ?? null,

      paymentMethods: [
        ...new Set(s.receipts.map((r) => r.paymentMethod)),
      ],
    }));

    /* ================= RESPONSE ================= */

    return NextResponse.json({
      sales: mappedSales,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("GET /api/dashboard/sales error:", error);

    return NextResponse.json(
      { error: "Failed to fetch sales" },
      { status: 500 }
    );
  }
}