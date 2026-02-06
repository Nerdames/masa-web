import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma from "@/lib/prisma";
import type { Invoice as PrismaInvoice, Order as PrismaOrder, Customer as PrismaCustomer } from "@prisma/client";

const secret = process.env.NEXTAUTH_SECRET as string;

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token?.organizationId) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);

    const page = Number(searchParams.get("page") ?? 1);
    const pageSize = Number(searchParams.get("pageSize") ?? 10);
    const search = searchParams.get("search")?.trim();
    const paidParam = searchParams.get("paid");
    const paid = paidParam === null ? undefined : paidParam === "true";

    if (Number.isNaN(page) || Number.isNaN(pageSize)) {
      return NextResponse.json({ error: "Invalid pagination parameters" }, { status: 400 });
    }

    // Build where clause
    const where: any = {
      ...(paid !== undefined ? { paid } : {}),
      order: { organizationId: token.organizationId, deletedAt: null },
    };

    if (search) {
      // Only filter by invoice id or customer name if search exists
      where.OR = [
        { id: { contains: search, mode: "insensitive" } },
        { order: { customer: { is: { name: { contains: search, mode: "insensitive" } } } } },
      ];
    }

    // Fetch invoices
    const [invoices, total, totalRevenue, unpaidTotal] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { order: { include: { customer: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.invoice.count({ where }),
      prisma.invoice.aggregate({
        where: { paid: true, order: { organizationId: token.organizationId, deletedAt: null } },
        _sum: { total: true },
      }),
      prisma.invoice.aggregate({
        where: { paid: false, order: { organizationId: token.organizationId, deletedAt: null } },
        _sum: { total: true },
      }),
    ]);

    return NextResponse.json({
      invoices: invoices.map(formatInvoice),
      total,
      page,
      pageSize,
      totalRevenue: totalRevenue._sum.total ?? 0,
      unpaidTotal: unpaidTotal._sum.total ?? 0,
    });
  } catch (error) {
    console.error("GET /dashboard/invoices error:", error);
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
  }
}

// Format invoice to frontend schema
function formatInvoice(
  inv: PrismaInvoice & { order: PrismaOrder & { customer: PrismaCustomer | null } }
) {
  return {
    id: inv.id,
    total: inv.total,
    paid: inv.paid,
    currency: inv.currency,
    createdAt: inv.createdAt.toISOString(),
    order: {
      id: inv.order.id,
      status: inv.order.status,
      balance: inv.order.balance,
      dueDate: inv.order.dueDate?.toISOString() ?? undefined,
      customer: inv.order.customer
        ? {
            name: inv.order.customer.name,
            email: inv.order.customer.email ?? undefined,
            phone: inv.order.customer.phone ?? undefined,
          }
        : undefined,
    },
  };
}
