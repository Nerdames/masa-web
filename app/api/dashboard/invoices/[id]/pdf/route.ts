import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma from "@/lib/prisma";
import PDFDocument from "pdfkit";

const secret = process.env.NEXTAUTH_SECRET as string;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // -----------------------
    // Authenticate user
    // -----------------------
    const token = await getToken({ req, secret });
    if (!token?.organizationId) {
      return new Response("Unauthorized", { status: 403 });
    }

    // -----------------------
    // Fetch invoice with order, customer, items
    // -----------------------
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        order: { organizationId: token.organizationId },
      },
      include: {
        order: {
          include: {
            customer: true,
            items: {
              include: { product: true },
            },
          },
        },
      },
    });

    if (!invoice) {
      return new Response("Invoice not found", { status: 404 });
    }

    // -----------------------
    // Create PDF
    // -----------------------
    const doc = new PDFDocument({ margin: 40 });
    const buffers: Buffer[] = [];

    doc.on("data", (b) => buffers.push(b));

    // Header
    doc.fontSize(18).text("INVOICE", { align: "center" });
    doc.moveDown();

    // Invoice info
    doc.fontSize(10).text(`Invoice ID: ${invoice.id}`);
    doc.text(`Date: ${invoice.createdAt.toDateString()}`);
    doc.text(`Customer: ${invoice.order.customer?.name ?? "Walk-in"}`);
    doc.moveDown();

    // Line items
    invoice.order.items.forEach((item) => {
      const productName = item.product?.name ?? "Unknown product";
      const quantity = item.quantity ?? 1;
      const total = item.total ?? 0;
      doc.text(`${productName} x${quantity} — ₦${total.toLocaleString()}`);
    });

    doc.moveDown();

    // Summary
    doc.fontSize(12).text(`Subtotal: ₦${invoice.order.total.toLocaleString()}`);
    if (invoice.discount) doc.text(`Discount: ₦${invoice.discount.toLocaleString()}`);
    if (invoice.tax) doc.text(`Tax: ₦${invoice.tax.toLocaleString()}`);
    doc.text(`Total: ₦${invoice.total.toLocaleString()}`);
    doc.text(invoice.paid ? "Status: PAID" : "Status: UNPAID");

    doc.end();

    // Wait for PDF to finish
    const pdf = await new Promise<Buffer>((resolve) =>
      doc.on("end", () => resolve(Buffer.concat(buffers)))
    );

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=invoice-${invoice.id}.pdf`,
      },
    });
  } catch (error) {
    console.error("GET /invoice/pdf error:", error);
    return new Response("Failed to generate PDF", { status: 500 });
  }
}
