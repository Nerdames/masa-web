import { NextRequest, NextResponse } from "next/server";
import { InvoiceStatus } from "@prisma/client";
import prisma from "@/core/lib/prisma";

// =====================================================
// GET: Fetch single invoice with relations
// =====================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        deletedAt: null, // exclude soft-deleted invoices
      },
      include: {
        customer: true,
        branch: true,
        issuedBy: true,
        payments: true,
        receipts: true,
        sales: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json(invoice);
  } catch (error) {
    console.error("GET /api/dashboard/invoices/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch invoice" }, { status: 500 });
  }
}

// =====================================================
// PATCH: Void or Lock an invoice
// =====================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as {
      void?: boolean;
      lock?: boolean;
    };

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        deletedAt: null,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const updated = await prisma.invoice.update({
      where: { id: params.id },
      data: {
        status: body.void ? InvoiceStatus.VOIDED : undefined,
        lockedAt: body.lock ? new Date() : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/dashboard/invoices/[id] error:", error);
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
  }
}