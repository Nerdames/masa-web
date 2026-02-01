import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma from "@/lib/prisma";

const secret = process.env.NEXTAUTH_SECRET as string;
const ACCESS_DENIED = { type: "error", message: "Access Denied" };

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = await getToken({ req, secret });

    if (!token?.organizationId || !["DEV", "ADMIN"].includes(token.role as string)) {
      return NextResponse.json(ACCESS_DENIED, { status: 403 });
    }

    // Fetch order with its invoice & payments
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: {
        status: true,
        organizationId: true,
        deletedAt: true,
        invoice: {
          select: {
            id: true,
            payments: { select: { id: true } },
          },
        },
      },
    });

    if (!order || order.organizationId !== token.organizationId || order.deletedAt) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const cancellableStatuses = ["DRAFT", "SUBMITTED"];
    if (!cancellableStatuses.includes(order.status as string)) {
      return NextResponse.json(
        { error: "Order cannot be deleted due to its status" },
        { status: 400 }
      );
    }

    // Prevent deletion if order has an invoice
    if (order.invoice) {
      // Prevent deletion if invoice has payments
      if (order.invoice.payments.length > 0) {
        return NextResponse.json(
          { error: "Order cannot be deleted because invoice has payments" },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: "Order cannot be deleted because it has an invoice" },
        { status: 400 }
      );
    }

    // Soft delete
    await prisma.order.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /dashboard/orders/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete order" },
      { status: 500 }
    );
  }
}
