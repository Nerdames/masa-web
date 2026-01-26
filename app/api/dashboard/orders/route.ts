import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { OrderListQuerySchema } from "@/lib/validators/order";
import { zodErrorResponse } from "@/lib/zodError";

const secret = process.env.NEXTAUTH_SECRET as string;

const ACCESS_DENIED = { type: "error", message: "Access Denied" };

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (!token?.organizationId) {
      return NextResponse.json(ACCESS_DENIED, { status: 403 });
    }

    const searchParams = Object.fromEntries(new URL(req.url).searchParams);

    // Parse query using Zod
    const parsedQuery = OrderListQuerySchema.parse(searchParams);
    const { page, pageSize, search, status, date } = parsedQuery;

    const skip = (page - 1) * pageSize;

    // Build Prisma where input
    const where: Prisma.OrderWhereInput = {
      organizationId: token.organizationId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { id: { contains: search, mode: "insensitive" } },
              {
                customer: {
                  name: { contains: search, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
      ...(date
        ? {
            createdAt: {
              gte: new Date(date), // from start of selected day
              lt: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000), // until end of day
            },
          }
        : {}),
    };

    // Fetch orders & total count in parallel
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: { name: true } },
          items: { select: { id: true } },
          invoices: { select: { id: true, paid: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    // Map orders to frontend-friendly format
    const formattedOrders = orders.map(order => ({
      id: order.id,
      customerId: order.customer?.name ?? null,
      total: order.total,
      paidAmount: order.paidAmount,
      balance: order.balance,
      currency: order.currency,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items,
      invoices: order.invoices,
    }));

    return NextResponse.json({ orders: formattedOrders, total });
  } catch (error) {
    return zodErrorResponse(error);
  }
}
