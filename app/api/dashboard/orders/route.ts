import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getToken } from "next-auth/jwt";
import { OrderStatus, ProductTag } from "@prisma/client";

const secret = process.env.NEXTAUTH_SECRET as string;

/* --------------------------------
   TypeScript interfaces
--------------------------------- */

interface OrderItemPayload {
  branchProductId: string;
  quantity: number;
}

interface OrderCreatePayload {
  customerId?: string;
  items: OrderItemPayload[];
  paidAmount?: number;
}

interface OrderUpdatePayload {
  id: string;
  paidAmount?: number;
  status?: OrderStatus;
}

/* --------------------------------
   GET — Fetch orders
--------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (!token || !token.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const branchId = url.searchParams.get("branchId");
    const status = url.searchParams.get("status") as OrderStatus | null;

    const orders = await prisma.order.findMany({
      where: {
        organizationId: token.organizationId,
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        customer: true,
        personnel: true,
        items: {
          include: {
            product: true,
            branchProduct: true,
          },
        },
        invoices: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(orders);
  } catch (error) {
    console.error("GET /api/orders error:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

/* --------------------------------
   POST — Create order
--------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (
      !token ||
      !token.organizationId ||
      !token.branchId ||
      !["DEV", "ADMIN", "SALES", "CASHIER"].includes(token.role as string)
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as OrderCreatePayload;
    const { customerId, items, paidAmount = 0 } = body;

    if (!items?.length) {
      return NextResponse.json({ error: "Order must have items" }, { status: 400 });
    }

    // Validate branchProductIds
    const branchProductIds = [
      ...new Set(items.map((i) => i.branchProductId).filter(Boolean)),
    ];

    // Load branch products with product details
    const branchProducts = await prisma.branchProduct.findMany({
      where: {
        id: { in: branchProductIds },
        branchId: token.branchId,
      },
      include: { product: true },
    });

    if (branchProducts.length !== branchProductIds.length) {
      return NextResponse.json({ error: "Invalid branch product(s) provided" }, { status: 400 });
    }

    // Calculate total and validate stock
    let total = 0;
    for (const item of items) {
      const bp = branchProducts.find((b) => b.id === item.branchProductId)!;

      if (bp.stock < item.quantity) {
        return NextResponse.json(
          { error: `Insufficient stock for ${bp.product.name}` },
          { status: 400 }
        );
      }

      total += bp.sellingPrice * item.quantity;
    }

    const balance = total - paidAmount;

    // Transaction: create order, order items, sales, stock movements, invoice
    const order = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          organizationId: token.organizationId!,
          branchId: token.branchId!,
          personnelId: token.sub!,
          customerId: customerId ?? null,
          total,
          paidAmount,
          balance,
          status: balance <= 0 ? "COMPLETED" : "PENDING",
        },
      });

      for (const item of items) {
        const bp = branchProducts.find((b) => b.id === item.branchProductId)!;
        const lineTotal = bp.sellingPrice * item.quantity;

        // OrderItem
        await tx.orderItem.create({
          data: {
            orderId: createdOrder.id,
            branchProductId: bp.id,
            productId: bp.productId,
            quantity: item.quantity,
            price: bp.sellingPrice,
            total: lineTotal,
          },
        });

        // Update stock and tag
        let newTag: ProductTag = bp.tag;
        if (bp.stock - item.quantity <= bp.reorderLevel) {
          newTag = ProductTag.LOW_STOCK;
        }

        await tx.branchProduct.update({
          where: { id: bp.id },
          data: { stock: { decrement: item.quantity }, tag: newTag },
        });

        // Stock movement log
        await tx.stockMovement.create({
          data: {
            branchProductId: bp.id,
            branchId: token.branchId!,
            personnelId: token.sub!,
            type: "OUT",
            quantity: item.quantity,
            note: "Order processed",
          },
        });

        // Sale record (reporting)
        await tx.sale.create({
          data: {
            organizationId: token.organizationId!,
            branchProductId: bp.id,
            productId: bp.productId,
            quantity: item.quantity,
            total: lineTotal,
            currency: bp.product.currency,
          },
        });
      }

      // Create invoice
      await tx.invoice.create({
        data: {
          orderId: createdOrder.id,
          total,
          paid: balance <= 0,
          currency: "NGN",
        },
      });

      return createdOrder;
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("POST /api/orders error:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}

/* --------------------------------
   PATCH — Update order (payment/status)
--------------------------------- */
export async function PATCH(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !token.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as OrderUpdatePayload;
    const { id, paidAmount, status } = body;

    if (!id) return NextResponse.json({ error: "Order ID required" }, { status: 400 });

    const order = await prisma.order.findFirst({
      where: { id, organizationId: token.organizationId },
    });

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const newPaid = paidAmount ?? order.paidAmount;
    const newBalance = order.total - newPaid;

    const updated = await prisma.order.update({
      where: { id },
      data: {
        paidAmount: newPaid,
        balance: newBalance,
        status: status ?? (newBalance <= 0 ? "COMPLETED" : order.status),
      },
    });

    // Update invoice if fully paid
    if (newBalance <= 0) {
      await prisma.invoice.updateMany({
        where: { orderId: id },
        data: { paid: true },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/orders error:", error);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}

/* --------------------------------
   DELETE — Soft delete order
--------------------------------- */
export async function DELETE(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (!token || !["DEV", "ADMIN"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id }: { id?: string } = await req.json();
    if (!id) return NextResponse.json({ error: "Order ID required" }, { status: 400 });

    await prisma.order.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/orders error:", error);
    return NextResponse.json({ error: "Failed to delete order" }, { status: 500 });
  }
}
