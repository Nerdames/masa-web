//api/dashboard/mark-paind/
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma from "@/lib/prisma";
import { OrderStatus } from "@prisma/client";

const secret = process.env.NEXTAUTH_SECRET as string;

interface PatchBody {
  ids: string[];
}

export async function PATCH(req: NextRequest) {
  try {
    // -----------------------
    // Authenticate user
    // -----------------------
    const token = await getToken({ req, secret });
    if (!token?.organizationId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // -----------------------
    // Parse request body
    // -----------------------
    const body: PatchBody = await req.json();
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json({ error: "Invalid ids" }, { status: 400 });
    }

    // -----------------------
    // Fetch invoices & their orders
    // -----------------------
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: body.ids },
        order: { organizationId: token.organizationId },
      },
      include: { order: true },
    });

    if (invoices.length === 0) {
      return NextResponse.json({ error: "No invoices found" }, { status: 404 });
    }

    // -----------------------
    // Transaction: update invoices & orders atomically
    // -----------------------
    await prisma.$transaction(async (tx) => {
      // 1️⃣ Mark invoices as paid
      await tx.invoice.updateMany({
        where: { id: { in: body.ids } },
        data: { paid: true },
      });

      // 2️⃣ Update each order once
      const ordersToUpdate = invoices.map((inv) => inv.order);

      for (const order of ordersToUpdate) {
        await tx.order.update({
          where: { id: order.id },
          data: {
            paidAmount: order.total,
            balance: 0,
            status: OrderStatus.COMPLETED,
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /invoices error:", error);
    return NextResponse.json(
      { error: "Failed to update invoices" },
      { status: 500 }
    );
  }
}
