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
    // Authenticate user
    // -----------------------
    const token = await getToken({ req, secret });

    if (!token?.organizationId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // -----------------------
    // Parse request body
    // -----------------------
    const body = (await req.json()) as PatchBody;

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json({ error: "Invalid invoice IDs" }, { status: 400 });
    }

    // -----------------------
    // Fetch invoices with their orders
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
    // Transaction: mark invoices as paid & fulfill related orders
    // -----------------------
    await prisma.$transaction(async (tx) => {
      const affectedOrders = new Set<string>();

      for (const invoice of invoices) {
        // Skip already paid invoices
        if (invoice.status === InvoiceStatus.PAID) continue;

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: invoice.total,
            balance: 0,
            status: InvoiceStatus.PAID
          }
        });

        if (invoice.orderId) affectedOrders.add(invoice.orderId);
      }

      // Fulfill only unique orders that are not yet fulfilled
      for (const orderId of affectedOrders) {
        await tx.order.updateMany({
          where: { id: orderId, status: { not: OrderStatus.FULFILLED } },
          data: { status: OrderStatus.FULFILLED }
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("MARK PAID ERROR:", error);
    return NextResponse.json(
      { error: "Failed to mark invoices as paid" },
      { status: 500 }
    );
  }
}