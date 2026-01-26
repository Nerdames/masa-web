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

    if (
      !token?.organizationId ||
      !["DEV", "ADMIN"].includes(token.role as string)
    ) {
      return NextResponse.json(ACCESS_DENIED, { status: 403 });
    }

    const order = await prisma.order.findFirst({
      where: {
        id: params.id,
        organizationId: token.organizationId,
        deletedAt: null,
      },
      select: { status: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status === "CANCELLED" || order.status === "RETURNED") {
      return NextResponse.json(
        { error: "Order cannot be deleted" },
        { status: 400 }
      );
    }

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
