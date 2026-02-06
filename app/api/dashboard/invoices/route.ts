import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { InvoiceStatus, StockMovementType } from "@prisma/client"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const page = Number(searchParams.get("page") ?? 1);
  const limit = Number(searchParams.get("limit") ?? 20);
  const skip = (page - 1) * limit;

  const branchId = searchParams.get("branchId");
  const statusParam = searchParams.get("status");
  const search = searchParams.get("search")?.trim();

  let statusFilter: InvoiceStatus[] | undefined;

  if (statusParam === "PAID") statusFilter = ["PAID"];
  else if (statusParam === "UNPAID")
    statusFilter = ["DRAFT", "ISSUED", "PARTIALLY_PAID"];
  else if (statusParam && Object.values(InvoiceStatus).includes(statusParam as InvoiceStatus))
    statusFilter = [statusParam as InvoiceStatus];

  const where: Prisma.InvoiceWhereInput = {
    deletedAt: null,
    ...(branchId ? { branchId } : {}),
    ...(statusFilter ? { status: { in: statusFilter } } : {}),
    ...(search
      ? {
          OR: [
            { id: { contains: search } },
            { customer: { name: { contains: search, mode: "insensitive" } } }
          ]
        }
      : {})
  };

  const invoices = await prisma.invoice.findMany({
    where,
    skip,
    take: limit,
    orderBy: { issuedAt: "desc" },
    include: {
      customer: true,
      branch: true,
      issuedBy: true
    }
  });

  const total = await prisma.invoice.count({ where });

  return NextResponse.json({
    data: invoices,
    meta: {
      page,
      limit,
      total
    }
  });
}




export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    orderId: string
    issuedById: string
    dueDate?: string
  }

  const order = await prisma.order.findUnique({
    where: { id: body.orderId },
    include: {
      items: {
        include: {
          branchProduct: true
        }
      }
    }
  })

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 })
  }

  const subtotal = order.items.reduce<number>(
    (sum, item) => sum + item.total,
    0
  )

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        organizationId: order.organizationId,
        branchId: order.branchId,
        orderId: order.id,
        issuedById: body.issuedById,
        customerId: order.customerId,
        subtotal,
        total: subtotal,
        balance: subtotal,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        status: InvoiceStatus.ISSUED
      }
    })

    for (const item of order.items) {
      await tx.sale.create({
        data: {
          organizationId: order.organizationId,
          invoiceId: created.id,
          branchId: order.branchId,
          branchProductId: item.branchProductId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          cashierId: body.issuedById,
          customerId: order.customerId
        }
      })

      await tx.stockMovement.create({
        data: {
          branchProductId: item.branchProductId,
          branchId: order.branchId,
          personnelId: body.issuedById,
          type: StockMovementType.OUT,
          quantity: item.quantity,
          referenceId: created.id
        }
      })
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "FULFILLED",
        invoicedAt: new Date()
      }
    })

    return created
  })

  return NextResponse.json(invoice)
}
