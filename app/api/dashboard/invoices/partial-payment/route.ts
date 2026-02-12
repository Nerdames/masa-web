import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { InvoiceStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const newBalance = invoice.balance - amount;

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        balance: newBalance,
        status:
          newBalance === 0
            ? InvoiceStatus.PAID
            : InvoiceStatus.PARTIALLY_PAID,
        ...(newBalance === 0 && { paidAt: new Date() }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PARTIAL PAYMENT ERROR:", error);
    return NextResponse.json(
      { error: "Failed to apply partial payment" },
      { status: 500 }
    );
  }
}
