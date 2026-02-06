import { NextRequest, NextResponse } from "next/server"
import { InvoiceStatus } from "@prisma/client"
import prisma from "@/lib/prisma"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      branch: true,
      issuedBy: true,
      payments: true,
      receipts: true,
      sales: {
        include: {
          product: true
        }
      }
    }
  })

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  }

  return NextResponse.json(invoice)
}



export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = (await req.json()) as {
    void?: boolean
    lock?: boolean
  }

  const invoice = await prisma.invoice.update({
    where: { id: params.id },
    data: {
      status: body.void ? InvoiceStatus.VOIDED : undefined,
      lockedAt: body.lock ? new Date() : undefined
    }
  })

  return NextResponse.json(invoice)
}
