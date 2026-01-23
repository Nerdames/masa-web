import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getToken } from "next-auth/jwt";

const secret = process.env.NEXTAUTH_SECRET as string;

interface OrderItemUpdatePayload {
  id: string;
  quantity?: number;
}

export async function PATCH(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !token.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, quantity }: OrderItemUpdatePayload = await req.json();
    if (!id) return NextResponse.json({ error: "Order item ID required" }, { status: 400 });

    const orderItem = await prisma.orderItem.findFirst({
      where: { id },
      include: { branchProduct: true, product: true },
    });
    if (!orderItem) return NextResponse.json({ error: "Order item not found" }, { status: 404 });

    if (quantity !== undefined) {
      if (orderItem.branchProduct.stock + orderItem.quantity < quantity) {
        return NextResponse.json(
          { error: `Insufficient stock for ${orderItem.product.name}` },
          { status: 400 }
        );
      }

      const delta = quantity - orderItem.quantity;

      await prisma.$transaction([
        prisma.orderItem.update({
          where: { id },
          data: { quantity, total: orderItem.price * quantity },
        }),
        prisma.branchProduct.update({
          where: { id: orderItem.branchProductId },
          data: { stock: { decrement: delta } },
        }),
      ]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/orders/items error:", error);
    return NextResponse.json({ error: "Failed to update order item" }, { status: 500 });
  }
}
