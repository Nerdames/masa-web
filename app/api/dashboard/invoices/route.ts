//api/dashboard/invoices
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma from "@/lib/prisma";
import type { Invoice as PrismaInvoice, Order as PrismaOrder, Customer as PrismaCustomer } from "@prisma/client";

const secret = process.env.NEXTAUTH_SECRET as string;

export async function GET(req: NextRequest) {
  try {
    // -----------------------
    // Authenticate user
    // -----------------------
    const token = await getToken({ req, secret });
    if (!token?.organizationId) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);

    // -----------------------
    // MODE 1: Fetch by orderId
    // -----------------------
    const orderId = searchParams.get("orderId");
    if (orderId) {
      const invoices = await prisma.invoice.findMany({
        where: {
          orderId,
          order: {
            organizationId: token.organizationId,
            deletedAt: null,
          },
        },
        include: {
          order: { include: { customer: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ invoices: invoices.map(formatInvoice) });
    }

    // -----------------------
    // MODE 2: Dashboard invoices
    // -----------------------
    const page = Number(searchParams.get("page") ?? 1);
    const pageSize = Number(searchParams.get("pageSize") ?? 10);
    const search = searchParams.get("search");
    const paidParam = searchParams.get("paid");

    if (Number.isNaN(page) || Number.isNaN(pageSize)) {
      return NextResponse.json(
        { error: "Invalid pagination parameters" },
        { status: 400 }
      );
    }

    const paid = paidParam === null ? undefined : paidParam === "true";

    // -----------------------
    // Prisma-compatible where clause
    // -----------------------
    const where = {
      ...(paid !== undefined ? { paid } : {}),
      order: {
        organizationId: token.organizationId,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { id: { contains: search, mode: "insensitive" } },
                { customer: { is: { name: { contains: search, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
    };

    // -----------------------
    // Fetch invoices, count, and sums
    // -----------------------
    const [invoices, total, revenue] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          order: { include: { customer: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }) as Promise<
        (PrismaInvoice & { order: PrismaOrder & { customer: PrismaCustomer | null } })[]
      >,
      prisma.invoice.count({ where }),
      prisma.invoice.aggregate({
        where: {
          paid: true,
          order: { organizationId: token.organizationId, deletedAt: null },
        },
        _sum: {
          total: true,
          discount: true,
          tax: true,
        },
      }),
    ]);

    return NextResponse.json({
      invoices: invoices.map(formatInvoice),
      total,
      page,
      pageSize,
      totalRevenue: revenue._sum.total ?? 0,
      totalDiscount: revenue._sum.discount ?? 0,
      totalTax: revenue._sum.tax ?? 0,
    });
  } catch (error) {
    console.error("GET /dashboard/invoices error:", error);
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
  }
}

/**
 * Format Prisma Invoice object to a frontend-friendly structure
 */
function formatInvoice(
  inv: PrismaInvoice & { order: PrismaOrder & { customer: PrismaCustomer | null } }
) {
  return {
    id: inv.id,
    orderId: inv.orderId,
    total: inv.total,
    paid: inv.paid,
    currency: inv.currency,
    discount: inv.discount ?? null,
    tax: inv.tax ?? null,
    createdAt: inv.createdAt.toISOString(),
    order: {
      id: inv.order.id,
      organizationId: inv.order.organizationId,
      branchId: inv.order.branchId,
      personnelId: inv.order.personnelId,
      customerId: inv.order.customerId,
      total: inv.order.total,
      paidAmount: inv.order.paidAmount,
      balance: inv.order.balance,
      currency: inv.order.currency,
      status: inv.order.status,
      dueDate: inv.order.dueDate?.toISOString() ?? null,
      paymentTerms: inv.order.paymentTerms ?? null,
      notes: inv.order.notes ?? null,
      deletedAt: inv.order.deletedAt?.toISOString() ?? null,
      createdAt: inv.order.createdAt.toISOString(),
      updatedAt: inv.order.updatedAt.toISOString(),
      customer: inv.order.customer
        ? {
            id: inv.order.customer.id,
            name: inv.order.customer.name,
            email: inv.order.customer.email ?? null,
            phone: inv.order.customer.phone ?? null,
          }
        : null,
    },
  };
}
