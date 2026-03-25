import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";
import { InvoiceStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";

export async function POST(req: NextRequest) {
  try {
    // -----------------------
    // Authenticate user
    // -----------------------
    const session = await getServerSession(authOptions);
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // -----------------------
    // Parse request
    // -----------------------
    const { invoiceId, amount } = (await req.json()) as {
      invoiceId?: string;
      amount?: number;
    };

    if (!invoiceId || !amount || amount <= 0) {
      return NextResponse.json(
        { error: "Valid invoiceId and amount required" },
        { status: 400 }
      );
    }

    // -----------------------
    // Fetch invoice
    // -----------------------
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        organizationId: session.user.organizationId,
        deletedAt: null,
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    if (invoice.balance <= 0) {
      return NextResponse.json(
        { error: "Invoice already fully paid" },
        { status: 409 }
      );
    }

    if (amount > invoice.balance) {
      return NextResponse.json(
        { error: "Payment exceeds remaining balance" },
        { status: 400 }
      );
    }

    // -----------------------
    // Transactional update
    // -----------------------
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      const paidAmount = invoice.paidAmount + amount;
      const balance = invoice.total - paidAmount;

      return tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount,
          balance,
          status:
            balance === 0
              ? InvoiceStatus.PAID
              : InvoiceStatus.PARTIALLY_PAID,
          ...(balance === 0 && { paidAt: new Date() }),
        },
      });
    });

    return NextResponse.json(updatedInvoice);
  } catch (error) {
    console.error("PARTIAL PAYMENT ERROR:", error);
    return NextResponse.json(
      { error: "Failed to apply partial payment" },
      { status: 500 }
    );
  }
}