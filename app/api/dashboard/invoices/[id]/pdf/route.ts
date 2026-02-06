import { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"
import prisma from "@/lib/prisma"
import PDFDocument from "pdfkit"
import { InvoiceStatus } from "@prisma/client"

const secret = process.env.NEXTAUTH_SECRET as string

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // -----------------------
    // Authenticate user
    // -----------------------
    const token = await getToken({ req, secret })

    if (!token?.organizationId) {
      return new Response("Unauthorized", { status: 403 })
    }

    // -----------------------
    // Fetch invoice
    // -----------------------
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        organizationId: token.organizationId
      },
      include: {
        customer: true,
        order: {
          include: {
            items: {
              include: {
                product: true
              }
            }
          }
        }
      }
    })

    if (!invoice) {
      return new Response("Invoice not found", { status: 404 })
    }

    // -----------------------
    // Create PDF
    // -----------------------
    const doc = new PDFDocument({ margin: 40 })
    const buffers: Buffer[] = []

    doc.on("data", (chunk: Buffer) => buffers.push(chunk))

    // Header
    doc.fontSize(18).text("INVOICE", { align: "center" })
    doc.moveDown()

    // Invoice info
    doc.fontSize(10)
    doc.text(`Invoice ID: ${invoice.id}`)
    doc.text(`Date: ${invoice.issuedAt.toDateString()}`)
    doc.text(`Customer: ${invoice.customer?.name ?? "Walk-in"}`)
    doc.text(`Status: ${invoice.status}`)
    doc.moveDown()

    // Items
    doc.fontSize(11).text("Items:")
    doc.moveDown(0.5)

    for (const item of invoice.order.items) {
      const name = item.product?.name ?? "Unknown product"
      const qty = item.quantity
      const price = item.unitPrice
      const total = item.total

      doc.text(
        `${name} — ${qty} × ₦${price.toLocaleString()} = ₦${total.toLocaleString()}`
      )
    }

    doc.moveDown()

    // Summary
    doc.fontSize(12)
    if (invoice.subtotal !== null) {
      doc.text(`Subtotal: ₦${invoice.subtotal.toLocaleString()}`)
    }

    if (invoice.discount && invoice.discount > 0) {
      doc.text(`Discount: ₦${invoice.discount.toLocaleString()}`)
    }

    if (invoice.tax && invoice.tax > 0) {
      doc.text(`Tax: ₦${invoice.tax.toLocaleString()}`)
    }

    doc.text(`Total: ₦${invoice.total.toLocaleString()}`)
    doc.text(`Paid: ₦${invoice.paidAmount.toLocaleString()}`)
    doc.text(`Balance: ₦${invoice.balance.toLocaleString()}`)

    if (invoice.status === InvoiceStatus.PAID) {
      doc.moveDown()
      doc.fontSize(12).text("✓ PAID", { align: "right" })
    }

    doc.end()

    // -----------------------
    // Return PDF
    // -----------------------
    const pdf = await new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(buffers)))
    })

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=invoice-${invoice.id}.pdf`
      }
    })
  } catch (error) {
    console.error("GET /api/dashboard/invoices/[id]/pdf error:", error)
    return new Response("Failed to generate PDF", { status: 500 })
  }
}
