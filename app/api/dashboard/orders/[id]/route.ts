import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getToken } from "next-auth/jwt";

const secret = process.env.NEXTAUTH_SECRET as string;

// -------------------------------
// GET: fetch single order by ID
// -------------------------------
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        personnel: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, name: true, email: true, phone: true, type: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, costPrice: true } },
            branchProduct: { select: { id: true, stock: true, sellingPrice: true } },
          },
        },
        invoices: true,
      },
    });

    if (!order || order.deletedAt) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

// -------------------------------
// PATCH: update order status or items
// -------------------------------
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  try {
    const token = await getToken({ req, secret });
    if (!token || !["ADMIN", "MANAGER", "SALES"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json() as {
      status?: "PENDING" | "PROCESSING" | "COMPLETED" | "CANCELLED" | "RETURNED";
      items?: { id: string; quantity: number }[];
    };

    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order || order.deletedAt) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Update status if provided
    if (body.status) {
      await prisma.order.update({ where: { id }, data: { status: body.status } });
    }

    // Update items if provided
    if (body.items?.length) {
      await Promise.all(
        body.items.map(async (item) => {
          await prisma.orderItem.update({
            where: { id: item.id },
            data: { quantity: item.quantity },
          });
        })
      );

      // Recalculate total
      const updatedItems = await prisma.orderItem.findMany({ where: { orderId: id } });
      const newTotal = updatedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

      await prisma.order.update({ where: { id }, data: { total: newTotal } });
    }

    const updatedOrder = await prisma.order.findUnique({
      where: { id },
      include: {
        personnel: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, name: true, email: true, phone: true, type: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, costPrice: true } },
            branchProduct: { select: { id: true, stock: true, sellingPrice: true } },
          },
        },
        invoices: true,
      },
    });

    return NextResponse.json(updatedOrder);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// -------------------------------
// DELETE: soft-delete order
// -------------------------------
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  try {
    const token = await getToken({ req, secret });
    if (!token || !["ADMIN", "MANAGER", "SALES"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const order = await prisma.order.findUnique({ where: { id } });

    if (!order || order.deletedAt) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    await prisma.order.update({ where: { id }, data: { deletedAt: new Date() } });

    return NextResponse.json({ message: "Order deleted successfully" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete order" }, { status: 500 });
  }
}
