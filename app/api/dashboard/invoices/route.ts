import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma, InvoiceStatus, StockMovementType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

// =====================================================
// GET INVOICES
// =====================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;

    const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
    const limit = Math.max(Number(searchParams.get("limit") ?? 20), 1);
    const skip = (page - 1) * limit;

    const branchId = searchParams.get("branchId");
    const statusParam = searchParams.get("status");
    const search = searchParams.get("search")?.trim();

    let statusFilter: InvoiceStatus[] | undefined;

    if (statusParam === "PAID") statusFilter = [InvoiceStatus.PAID];
    else if (statusParam === "UNPAID")
      statusFilter = [
        InvoiceStatus.DRAFT,
        InvoiceStatus.ISSUED,
        InvoiceStatus.PARTIALLY_PAID,
      ];
    else if (
      statusParam &&
      Object.values(InvoiceStatus).includes(statusParam as InvoiceStatus)
    ) {
      statusFilter = [statusParam as InvoiceStatus];
    }

    const where: Prisma.InvoiceWhereInput = {
      organizationId: session.user.organizationId,
      deletedAt: null,
      ...(branchId && { branchId }),
      ...(statusFilter && { status: { in: statusFilter } }),
      ...(search && {
        OR: [
          { id: { contains: search } },
          {
            customer: {
              name: { contains: search, mode: "insensitive" },
            },
          },
        ],
      }),
    };

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { issuedAt: "desc" },
        include: {
          customer: true, // include customer relation
          branch: true,
          issuedBy: true,
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    // Map to include buyerName
    const mappedInvoices = invoices.map((inv) => ({
      ...inv,
      buyerName: inv.customer?.name ?? "Walk-in",
      customer: undefined, // optional: remove the customer object
    }));

    return NextResponse.json({
      data: mappedInvoices,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET INVOICES ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}


// =====================================================
// CREATE INVOICE FROM ORDER
// =====================================================
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: {
      orderId: string;
      dueDate?: string;
    } = await req.json();

    if (!body.orderId) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 }
      );
    }

    const order = await prisma.order.findFirst({
      where: {
        id: body.orderId,
        organizationId: session.user.organizationId,
      },
      include: {
        items: {
          include: {
            branchProduct: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    if (order.status === "FULFILLED") {
      return NextResponse.json(
        { error: "Order already invoiced" },
        { status: 409 }
      );
    }

    const subtotal = order.items.reduce<number>(
      (sum, item) => sum + item.total,
      0
    );

    const invoice = await prisma.$transaction(async (tx) => {
      // Validate stock before deduction
      for (const item of order.items) {
        if (item.branchProduct.stock < item.quantity) {
          throw new Error(
            `Insufficient stock for product ${item.productId}`
          );
        }
      }

      const created = await tx.invoice.create({
        data: {
          organizationId: order.organizationId,
          branchId: order.branchId,
          orderId: order.id,
          issuedById: session.user.id,
          customerId: order.customerId,
          subtotal,
          total: subtotal,
          balance: subtotal,
          dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
          status: InvoiceStatus.ISSUED,
          issuedAt: new Date(),
        },
      });

      for (const item of order.items) {
        // Create sale record
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
            cashierId: session.user.id,
            customerId: order.customerId,
          },
        });

        // Deduct stock
        await tx.branchProduct.update({
          where: { id: item.branchProductId },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });

        // Log stock movement
        await tx.stockMovement.create({
          data: {
            branchProductId: item.branchProductId,
            branchId: order.branchId,
            personnelId: session.user.id,
            type: StockMovementType.OUT,
            quantity: item.quantity,
            referenceId: created.id,
          },
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "FULFILLED",
          invoicedAt: new Date(),
        },
      });

      return created;
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      console.error("PRISMA ERROR:", error);
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error("CREATE INVOICE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 }
    );
  }
}


// =====================================================
// PUT: Update Invoice Status
// =====================================================
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: {
      id?: string;
      status?: InvoiceStatus;
    } = await req.json();

    if (!body.id || !body.status) {
      return NextResponse.json(
        { error: "Invoice ID and status are required" },
        { status: 400 }
      );
    }

    if (!Object.values(InvoiceStatus).includes(body.status)) {
      return NextResponse.json(
        { error: "Invalid invoice status" },
        { status: 400 }
      );
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: body.id,
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

    const updated = await prisma.invoice.update({
      where: { id: body.id },
      data: { status: body.status },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("UPDATE INVOICE STATUS ERROR:", error);
    return NextResponse.json(
      { error: "Failed to update invoice status" },
      { status: 500 }
    );
  }
}
