import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma from "@/lib/prisma";
import type { Sale } from "@/types/sale";
import type { SaleStatus, PaymentMethod } from "@/types/enums";
import type { Prisma } from "@prisma/client";

/* ================= Roles ================= */
const ALLOWED_ROLES = ["DEV", "ADMIN", "SALES", "CASHIER"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

const secret = process.env.NEXTAUTH_SECRET as string;

/* ================= DTO ================= */
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

/* ================= Handler ================= */
export async function GET(req: NextRequest) {
  try {
    /* ---------- AUTH ---------- */
    const token = await getToken({ req, secret });

    if (
      !token ||
      !("role" in token) ||
      !("organizationId" in token) ||
      !ALLOWED_ROLES.includes(token.role as AllowedRole)
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = token.organizationId as string;
    const branchId = token.branchId as string | undefined;

    /* ---------- QUERY PARAMS ---------- */
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(50, Number(searchParams.get("pageSize") ?? 10));
    const search = searchParams.get("search")?.trim();
    const date = searchParams.get("date");

    const statusParam = searchParams.get("status");
    const paymentMethodParam = searchParams.get("paymentMethod"); // can be CSV

    const status: SaleStatus | undefined =
      statusParam && ["PENDING", "COMPLETED", "CANCELLED"].includes(statusParam)
        ? (statusParam as SaleStatus)
        : undefined;

    const paymentMethods: PaymentMethod[] | undefined =
      paymentMethodParam
        ? (paymentMethodParam
            .split(",")
            .map((pm) => pm.trim())
            .filter((pm) =>
              ["CASH", "CARD", "BANK_TRANSFER", "MOBILE_MONEY", "POS"].includes(pm)
            ) as PaymentMethod[])
        : undefined;

    /* ---------- TYPED WHERE CLAUSE ---------- */
    const where: Prisma.SaleWhereInput = {
      organizationId,
      deletedAt: null,
      ...(branchId && { branchId }),
      ...(status && { status }),
      ...(date && {
        createdAt: {
          gte: new Date(date),
          lte: new Date(new Date(date).setHours(23, 59, 59, 999)),
        },
      }),
      ...(search && {
        OR: [
          {
            product: { name: { contains: search, mode: "insensitive" } },
          },
          {
            customer: { name: { contains: search, mode: "insensitive" } },
          },
        ],
      }),
      ...(paymentMethods && paymentMethods.length > 0 && {
        receipts: {
          some: {
            OR: paymentMethods.map((pm) => ({ paymentMethod: pm })),
          },
        },
      }),
    };

    /* ---------- FETCH SALES ---------- */
    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
          cashier: { select: { id: true, name: true } },
          receipts: { select: { id: true, paymentMethod: true, amount: true } },
        },
      }),
      prisma.sale.count({ where }),
    ]);

    /* ---------- TRANSFORM ---------- */
    const mappedSales: SaleDTO[] = (sales as Sale[]).map((s) => ({
      id: s.id,
      organizationId: s.organizationId,
      branchId: s.branchId,
      branchProductId: s.branchProductId,
      productId: s.productId,
      invoiceId: s.invoiceId,

      quantity: s.quantity,
      unitPrice: s.unitPrice,
      total: s.total,
      currency: s.currency,
      status: s.status,
      createdAt: s.createdAt,

      cashierId: s.cashierId,
      customerId: s.customerId ?? null,

      productName: s.product?.name ?? null,
      customerName: s.customer?.name ?? null,
      cashierName: s.cashier?.name ?? null,

      paymentMethods: s.receipts?.map((r) => r.paymentMethod) ?? [],
    }));

    /* ---------- RESPONSE ---------- */
    return NextResponse.json({
      sales: mappedSales,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("GET /api/dashboard/sales error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sales" },
      { status: 500 }
    );
  }
}
