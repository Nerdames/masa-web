import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { InvoiceStatus, PaymentMethod } from "@prisma/client"

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = (await req.json()) as {
    amount: number
    method: PaymentMethod
    cashierId: string
    reference?: string
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id }
  })

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        cashierId: body.cashierId,
        amount: body.amount,
        method: body.method,
        reference: body.reference
      }
    })

    const paidAmount = invoice.paidAmount + body.amount
    const balance = invoice.total - paidAmount

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        paidAmount,
        balance,
        status:
          balance <= 0
            ? InvoiceStatus.PAID
            : InvoiceStatus.PARTIALLY_PAID
      }
    })

    return created
  })

  return NextResponse.json(payment)
}
