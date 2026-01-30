import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getToken } from "next-auth/jwt";
import { Prisma } from "@prisma/client";

const secret = process.env.NEXTAUTH_SECRET as string;

type AllowedRole = "DEV" | "ADMIN" | "SALES" | "CASHIER";

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (
      !token ||
      !("role" in token) ||
      !("organizationId" in token) ||
      !(["DEV", "ADMIN", "SALES", "CASHIER"] as AllowedRole[]).includes(
        token.role as AllowedRole
      )
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page") ?? 1);
    const pageSize = Number(searchParams.get("pageSize") ?? 10);
    const search = searchParams.get("search");
    const paymentType = searchParams.get("paymentType") as
      | "CASH"
      | "CARD"
      | "BANK_TRANSFER"
      | "MOBILE_MONEY"
      | "POS"
      | undefined;
    const date = searchParams.get("date");

    // Base filter
    const where: Prisma.SaleWhereInput = {
      organizationId: token.organizationId as string,
      status: "COMPLETED",
    };

    // Date filter
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }

    // Search filter
    if (search) {
      where.OR = [
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
      ];
    }

    // Include payments for filtering by paymentType
    const includePayments = paymentType
      ? {
          invoice: {
            include: {
              payments: {
                where: { method: paymentType },
              },
            },
          },
        }
      : {
          invoice: true,
        };

    // Fetch sales
    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          product: { select: { name: true } },
          customer: { select: { name: true } },
          cashier: { select: { name: true } },
          ...includePayments,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.sale.count({ where }),
    ]);

    // Filter out sales without matching payment type (if applied)
    const filteredSales = paymentType
      ? sales.filter((s) => s.invoice?.payments?.length)
      : sales;

    const response = filteredSales.map((s) => ({
      id: s.id,
      productId: s.productId,
      quantity: s.quantity,
      total: s.total,
      currency: s.currency,
      createdAt: s.createdAt,
      productName: s.product?.name ?? null,
      buyer: s.customer?.name ?? null,
      attendant: s.cashier?.name ?? null,
      paymentType: s.invoice?.payments?.[0]?.method ?? null,
      status: s.status,
    }));

    return NextResponse.json({
      sales: response,
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
