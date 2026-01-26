import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma from "@/lib/prisma";

const secret = process.env.NEXTAUTH_SECRET as string;

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token?.organizationId) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    const orderId = new URL(req.url).searchParams.get("orderId");
    if (!orderId) {
      return NextResponse.json(
        { error: "orderId is required" },
        { status: 400 }
      );
    }

    const items = await prisma.orderItem.findMany({
      where: {
        orderId,
        order: {
          organizationId: token.organizationId,
          deletedAt: null,
        },
      },
      include: {
        product: true,
        branchProduct: true,
      },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /orders/items error:", error);
    return NextResponse.json(
      { error: "Failed to fetch order items" },
      { status: 500 }
    );
  }
}
