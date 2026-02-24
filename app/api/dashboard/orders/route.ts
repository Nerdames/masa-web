// app/api/dashboard/orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { OrderListQuerySchema } from "@/lib/validators/order";
import { zodErrorResponse } from "@/lib/zodError";

const secret = process.env.NEXTAUTH_SECRET as string;
const ACCESS_DENIED = { type: "error", message: "Access Denied" };

// Helper to serialize Decimal to number
const serializeOrder = (order: any) => ({
  id: order.id,
  customer: order.customer ? { name: order.customer.name } : null,
  salesperson: order.salesperson ? { name: order.salesperson.name } : null,
  total: Number(order.total),
  currency: order.currency,
  status: order.status,
  createdAt: order.createdAt.toISOString(),
  updatedAt: order.updatedAt.toISOString(),
  items: order.items.map((item: any) => ({
    id: item.id,
    product: item.product ? { name: item.product.name } : null,
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice),
    total: Number(item.total),
    discount: Number(item.discount ?? 0),
    tax: Number(item.tax ?? 0),
  })),
  invoice: order.invoice
    ? {
        id: order.invoice.id,
        total: Number(order.invoice.total ?? 0),
        paidAmount: Number(order.invoice.paidAmount ?? 0),
        balance: Number(order.invoice.balance ?? 0),
        status: order.invoice.status,
      }
    : null,
});

// ================= GET =================
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token?.organizationId) return NextResponse.json(ACCESS_DENIED, { status: 403 });

    const searchParams = Object.fromEntries(new URL(req.url).searchParams);
    const parsedQuery = OrderListQuerySchema.parse(searchParams);
    const { page, pageSize, search, status, date } = parsedQuery;

    const skip = (page - 1) * pageSize;

    const where: Prisma.OrderWhereInput = {
      organizationId: token.organizationId,
      deletedAt: null,
      ...(status && status !== "ALL" ? { status } : {}),
      ...(search
        ? {
            OR: [
              { id: { contains: search, mode: "insensitive" } },
              { customer: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(date
        ? {
            createdAt: {
              gte: new Date(date),
              lt: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000),
            },
          }
        : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: { name: true } },
          salesperson: { select: { name: true } },
          items: {
            select: {
              id: true,
              quantity: true,
              unitPrice: true,
              total: true,
              discount: true,
              tax: true,
              product: { select: { name: true } },
            },
          },
          invoice: {
            select: { id: true, total: true, paidAmount: true, balance: true, status: true },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    const formattedOrders = orders.map(serializeOrder);

    return NextResponse.json({ orders: formattedOrders, total });
  } catch (error) {
    return zodErrorResponse(error);
  }
}

// ================= POST =================
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token?.organizationId) return NextResponse.json(ACCESS_DENIED, { status: 403 });

    const body = await req.json();
    const { branchId, customerId, salespersonId, items, currency = "NGN" } = body;

    if (!branchId || !salespersonId || !items?.length)
      return NextResponse.json({ type: "error", message: "Missing required fields" }, { status: 400 });

    // Calculate total
    let total = 0;
    items.forEach((i: any) => {
      const itemTotal = Number(i.unitPrice) * Number(i.quantity) - Number(i.discount ?? 0) + Number(i.tax ?? 0);
      total += itemTotal;
    });

    const order = await prisma.order.create({
      data: {
        organizationId: token.organizationId,
        branchId,
        customerId: customerId || undefined,
        salespersonId,
        currency,
        total,
        status: "DRAFT",
        items: {
          create: items.map((i: any) => ({
            productId: i.productId,
            branchProductId: i.branchProductId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: Number(i.total),
            discount: Number(i.discount ?? 0),
            tax: Number(i.tax ?? 0),
          })),
        },
      },
      include: {
        customer: { select: { name: true } },
        salesperson: { select: { name: true } },
        items: {
          include: { product: { select: { name: true } } },
        },
        invoice: true,
      },
    });

    return NextResponse.json(serializeOrder(order), { status: 201 });
  } catch (error) {
    return zodErrorResponse(error);
  }
}

// ================= PATCH =================
export async function PATCH(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token?.organizationId) return NextResponse.json(ACCESS_DENIED, { status: 403 });

    const body = await req.json();
    const { ids, status } = body;

    if (!ids?.length || !status)
      return NextResponse.json({ type: "error", message: "Missing ids or status" }, { status: 400 });

    const updated = await prisma.order.updateMany({
      where: { id: { in: ids }, organizationId: token.organizationId, deletedAt: null },
      data: { status },
    });

    return NextResponse.json({ updated: updated.count });
  } catch (error) {
    return zodErrorResponse(error);
  }
}

// ================= DELETE =================
export async function DELETE(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token?.organizationId) return NextResponse.json(ACCESS_DENIED, { status: 403 });

    const { ids } = await req.json();
    if (!ids?.length) return NextResponse.json({ type: "error", message: "No ids provided" }, { status: 400 });

    // Soft delete
    const deleted = await prisma.order.updateMany({
      where: { id: { in: ids }, organizationId: token.organizationId },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ deleted: deleted.count });
  } catch (error) {
    return zodErrorResponse(error);
  }
}