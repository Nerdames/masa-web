// app/api/dashboard/mark-paid/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma from "@/lib/prisma";
import { InvoiceStatus, OrderStatus } from "@prisma/client";

const secret = process.env.NEXTAUTH_SECRET as string;

interface PatchBody {
  ids: string[];
}

export async function PATCH(req: NextRequest) {
  try {
    // -----------------------
    // Authenticate
    // -----------------------
    const token = await getToken({ req, secret });

    if (!token?.organizationId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // -----------------------
    // Parse body
    // -----------------------
    const body = (await req.json()) as PatchBody;

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json({ error: "Invalid ids" }, { status: 400 });
    }

    // -----------------------
    // Fetch invoices + orders
    // -----------------------
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: body.ids },
        organizationId: token.organizationId,
        deletedAt: null
      },
      include: { order: true }
    });

    if (invoices.length === 0) {
      return NextResponse.json({ error: "No invoices found" }, { status: 404 });
    }

    // -----------------------
    // Transaction: mark paid + fulfill orders
    // -----------------------
    await prisma.$transaction(async (tx) => {
      const updatedOrders = new Set<string>();

      for (const invoice of invoices) {
        // Skip invoices already fully paid
        if (invoice.status === InvoiceStatus.PAID) continue;

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: invoice.total,
            balance: 0,
            status: InvoiceStatus.PAID,
            paidAt: new Date()
          }
        });

        if (invoice.orderId) updatedOrders.add(invoice.orderId);
      }

      // Update only unique orders
      for (const orderId of updatedOrders) {
        await tx.order.updateMany({
          where: {
            id: orderId,
            status: { not: OrderStatus.FULFILLED }
          },
          data: { status: OrderStatus.FULFILLED }
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/dashboard/mark-paid error:", error);
    return NextResponse.json(
      { error: "Failed to mark invoices as paid" },
      { status: 500 }
    );
  }
}
