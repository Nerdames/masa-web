// app/api/dashboard/orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma from "@/src/core/lib/prisma";
import { Order, OrderItem } from "@prisma/client"; // Prisma-generated types

const secret = process.env.NEXTAUTH_SECRET as string;
const ACCESS_DENIED = { type: "error", message: "Access Denied" };

interface SerializedOrderItem {
  id: string;
  product: { name: string } | null;
  quantity: number;
  unitPrice: number;
  total: number;
  discount: number;
  tax: number;
}

interface SerializedInvoice {
  id: string;
  total: number;
  paidAmount: number;
  balance: number;
  status: string;
  issuedAt: string;
  dueDate: string | null;
}

interface SerializedOrder {
  id: string;
  customer: { name: string } | null;
  salesperson: { name: string } | null;
  total: number;
  currency: string;
  status: Order["status"];
  notes: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: SerializedOrderItem[];
  invoice: SerializedInvoice | null;
}

const serializeOrder = (order: Order & {
  customer: { name: string } | null;
  salesperson: { name: string } | null;
  items: (OrderItem & { product: { name: string } | null })[];
  invoice:
    | {
        id: string;
        total: number | null;
        paidAmount: number | null;
        balance: number | null;
        status: string;
        issuedAt: Date;
        dueDate: Date | null;
      }
    | null;
}): SerializedOrder => ({
  id: order.id,
  customer: order.customer ? { name: order.customer.name } : null,
  salesperson: order.salesperson ? { name: order.salesperson.name } : null,
  total: Number(order.total),
  currency: order.currency,
  status: order.status,
  notes: order.notes ?? null,
  expiresAt: order.expiresAt?.toISOString() ?? null,
  createdAt: order.createdAt.toISOString(),
  updatedAt: order.updatedAt.toISOString(),
  items: order.items.map((item) => ({
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
        issuedAt: order.invoice.issuedAt.toISOString(),
        dueDate: order.invoice.dueDate?.toISOString() ?? null,
      }
    : null,
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = await getToken({ req, secret });
    if (!token?.organizationId) return NextResponse.json(ACCESS_DENIED, { status: 403 });

    const { id } = params;

    const order = await prisma.order.findFirst({
      where: { id, organizationId: token.organizationId, deletedAt: null },
      include: {
        customer: { select: { name: true } },
        salesperson: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
        invoice: {
          select: { id: true, total: true, paidAmount: true, balance: true, status: true, issuedAt: true, dueDate: true },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ type: "error", message: "Order not found" }, { status: 404 });
    }

    return NextResponse.json(serializeOrder(order));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ type: "error", message: "Failed to fetch order" }, { status: 500 });
  }
}