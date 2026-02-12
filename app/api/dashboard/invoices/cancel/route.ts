import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { InvoiceStatus, StockMovementType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { invoiceId } = (await req.json()) as { invoiceId?: string };

    if (!invoiceId) {
      return NextResponse.json(
        { error: "Invoice ID required" },
        { status: 400 }
      );
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        organizationId: session.user.organizationId,
        deletedAt: null,
      },
      include: {
        sales: true,
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      return NextResponse.json(
        { error: "Invoice already cancelled" },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const sale of invoice.sales) {
        await tx.branchProduct.update({
          where: { id: sale.branchProductId },
          data: {
            stock: {
              increment: sale.quantity,
            },
          },
        });

        await tx.stockMovement.create({
          data: {
            branchProductId: sale.branchProductId,
            branchId: sale.branchId,
            personnelId: session.user.id,
            type: StockMovementType.IN,
            quantity: sale.quantity,
            referenceId: invoice.id,
          },
        });
      }

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.CANCELLED,
        },
      });
    });

    return NextResponse.json({ message: "Invoice cancelled successfully" });
  } catch (error) {
    console.error("CANCEL INVOICE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to cancel invoice" },
      { status: 500 }
    );
  }
}
