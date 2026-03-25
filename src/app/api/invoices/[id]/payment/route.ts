import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";
import { InvoiceStatus, PaymentMethod } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const invoiceId = params.id;

    const body: {
      amount: number;
      method: PaymentMethod;
      cashierId?: string; // optional, defaults to current user
      reference?: string;
    } = await req.json();

    if (!body.amount || body.amount <= 0) {
      return NextResponse.json({ error: "Invalid payment amount" }, { status: 400 });
    }

    if (!body.method) {
      return NextResponse.json({ error: "Payment method is required" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null, organizationId: session.user.organizationId },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const cashierId = body.cashierId ?? session.user.id;

    const payment = await prisma.$transaction(async (tx) => {
      // Create Payment
      const createdPayment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          cashierId,
          amount: body.amount,
          method: body.method,
          reference: body.reference,
          currency: invoice.currency,
        },
      });

      // Update Invoice
      const newPaidAmount = invoice.paidAmount + body.amount;
      const newBalance = Math.max(invoice.total - newPaidAmount, 0);
      const newStatus =
        newBalance <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaidAmount,
          balance: newBalance,
          status: newStatus,
        },
      });

      return createdPayment;
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      console.error("PRISMA ERROR:", error);
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("CREATE PAYMENT ERROR:", error);
    return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
  }
}