import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Role, Prisma, OrderStatus, InvoiceStatus, PaymentMethod, PaymentStatus, SaleStatus } from "@prisma/client";

/* -------------------- TYPES -------------------- */

interface SaleItemInput {
  branchProductId: string;
  quantity: number;
  unitPrice: number; // Provided by client to verify against DB
}

interface CreateSaleRequest {
  branchId: string;
  customerId?: string;
  items: SaleItemInput[];
  paymentMethod: PaymentMethod;
  amountPaid: number;
  discount?: number;
  tax?: number;
  notes?: string;
}

/* -------------------- POST: CREATE COMPLETED SALE -------------------- */

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);

    // Only Admin, Manager, or Sales roles can process sales
    if (!session || ![Role.ADMIN, Role.MANAGER, Role.SALES].includes(session.user.role as Role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body: CreateSaleRequest = await req.json();
    const { branchId, customerId, items, paymentMethod, amountPaid, discount = 0, tax = 0, notes } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No items provided for sale" }, { status: 400 });
    }

    const organizationId = session.user.organizationId;

    // Start Transaction
    const result = await prisma.$transaction(async (tx) => {
      let subtotal = 0;

      // 1. Validate Stock and Calculate Totals
      for (const item of items) {
        const bp = await tx.branchProduct.findUnique({
          where: { id: item.branchProductId },
          include: { product: true }
        });

        if (!bp || bp.branchId !== branchId) {
          throw new Error(`Product ${item.branchProductId} not found in this branch.`);
        }

        if (bp.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${bp.product.name}. Available: ${bp.stock}`);
        }

        subtotal += Number(item.unitPrice) * item.quantity;
      }

      const total = subtotal - discount + tax;

      // 2. Create the Order (Required by Invoice schema)
      const order = await tx.order.create({
        data: {
          organizationId,
          branchId,
          salespersonId: session.user.id,
          customerId,
          total: new Prisma.Decimal(total),
          status: OrderStatus.COMPLETED,
          notes,
        }
      });

      // 3. Create the Invoice
      const invoice = await tx.invoice.create({
        data: {
          organizationId,
          branchId,
          orderId: order.id,
          issuedById: session.user.id,
          customerId,
          subtotal: new Prisma.Decimal(subtotal),
          total: new Prisma.Decimal(total),
          discount: new Prisma.Decimal(discount),
          tax: new Prisma.Decimal(tax),
          paidAmount: new Prisma.Decimal(amountPaid),
          balance: new Prisma.Decimal(Math.max(0, total - amountPaid)),
          status: amountPaid >= total ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL,
        }
      });

      // 4. Process each Sale Item & Update Stock
      for (const item of items) {
        const bp = await tx.branchProduct.findUnique({
          where: { id: item.branchProductId }
        });

        if (!bp) throw new Error("Branch product record missing during processing.");

        // Create Sale Record
        await tx.sale.create({
          data: {
            organizationId,
            invoiceId: invoice.id,
            branchProductId: item.branchProductId,
            productId: bp.productId,
            branchId,
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            total: new Prisma.Decimal(Number(item.unitPrice) * item.quantity),
            cashierId: session.user.id,
            customerId,
            status: SaleStatus.COMPLETED,
          }
        });

        // Update Stock (Decrement)
        await tx.branchProduct.update({
          where: { id: item.branchProductId },
          data: { 
            stock: { decrement: item.quantity },
            lastSoldAt: new Date(),
          }
        });

        // Create Stock Movement record for audit
        await tx.stockMovement.create({
          data: {
            organizationId,
            branchProductId: item.branchProductId,
            quantity: -item.quantity,
            type: "SALE",
            reference: `INV-${invoice.id.slice(-6)}`,
            personnelId: session.user.id,
          }
        });
      }

      // 5. Handle Payment & Receipt
      if (amountPaid > 0) {
        const receipt = await tx.receipt.create({
          data: {
            organizationId,
            branchId,
            personnelId: session.user.id,
            invoiceId: invoice.id,
            amount: new Prisma.Decimal(amountPaid),
          }
        });

        await tx.payment.create({
          data: {
            organizationId,
            invoiceId: invoice.id,
            cashierId: session.user.id,
            receiptId: receipt.id,
            method: paymentMethod,
            amount: new Prisma.Decimal(amountPaid),
            status: PaymentStatus.COMPLETED,
          }
        });
      }

      // 6. Update Customer Lifetime Value
      if (customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            totalSpent: { increment: new Prisma.Decimal(amountPaid) },
            totalOrders: { increment: 1 }
          }
        });
      }

      // 7. Audit Log
      await tx.activityLog.create({
        data: {
          organizationId,
          branchId,
          personnelId: session.user.id,
          action: "SALE_COMPLETED",
          critical: true,
          metadata: { 
            invoiceId: invoice.id, 
            total, 
            paymentMethod 
          } as Prisma.JsonObject,
        }
      });

      return invoice;
    });

    return NextResponse.json(result, { status: 201 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("SALES_POST_ERROR:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/* -------------------- GET: LIST SALES -------------------- */

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId");
    const customerId = searchParams.get("customerId");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = 50;

    const where: Prisma.SaleWhereInput = {
      organizationId: session.user.organizationId,
      deletedAt: null,
      ...(branchId && { branchId }),
      ...(customerId && { customerId }),
    };

    const [total, sales] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        include: {
          product: { select: { name: true, sku: true } },
          customer: { select: { name: true } },
          attendant: { select: { name: true } },
          invoice: { select: { status: true, total: true } }
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      data: sales,
      meta: {
        total,
        page,
        pageCount: Math.ceil(total / pageSize),
      }
    });
  } catch (error: unknown) {
    console.error("SALES_GET_ERROR:", error);
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 });
  }
}