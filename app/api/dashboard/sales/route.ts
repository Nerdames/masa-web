import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getToken } from "next-auth/jwt";

const secret = process.env.NEXTAUTH_SECRET as string;

/* --------------------------------
   Types
-------------------------------- */
interface SaleItem {
  branchProductId: string;
  quantity: number;
}

interface BuyerInfo {
  name: string;
  email?: string | null;
  phone?: string | null;
}

interface SalePayload {
  buyer: BuyerInfo;
  items: SaleItem[];
  date?: string;
}

interface SaleResponse {
  success: boolean;
  orderId: string;
}

/* --------------------------------
   GET — Fetch sales
-------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (!token || !["DEV", "ADMIN", "SALES"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sales = await prisma.sale.findMany({
      where: { organizationId: token.organizationId },
      include: {
        product: true,
        branchProduct: { include: { branch: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(sales);
  } catch (error) {
    console.error("GET /api/sales error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sales" },
      { status: 500 }
    );
  }
}

/* --------------------------------
   POST — Create sale (Order + Sales + Stock Movements)
-------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (!token || !["DEV", "ADMIN", "SALES"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as SalePayload;
    const { buyer, items, date } = body;

    if (!buyer || !items?.length) {
      return NextResponse.json({ error: "Invalid sale payload" }, { status: 400 });
    }

    // Find or create customer
    let customer = await prisma.customer.findFirst({
      where: {
        organizationId: token.organizationId,
        name: { equals: buyer.name, mode: "insensitive" },
        type: "BUYER",
      },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          organizationId: token.organizationId!,
          name: buyer.name,
          email: buyer.email ?? null,
          phone: buyer.phone ?? null,
          type: "BUYER",
        },
      });
    }

    // Load branch products
    const branchProductIds = items.map(i => i.branchProductId);
    const branchProducts = await prisma.branchProduct.findMany({
      where: {
        id: { in: branchProductIds },
        organizationId: token.organizationId,
      },
      include: { product: true },
    });

    if (branchProducts.length !== items.length) {
      return NextResponse.json({ error: "Invalid branch product reference" }, { status: 404 });
    }

    // Validate stock & calculate total
    let totalAmount = 0;
    for (const item of items) {
      const bp = branchProducts.find(b => b.id === item.branchProductId)!;
      if (item.quantity > bp.stock) {
        return NextResponse.json(
          { error: `Insufficient stock for ${bp.product.name}` },
          { status: 400 }
        );
      }
      totalAmount += bp.sellingPrice * item.quantity;
    }

    // Transaction: create order, items, sales, stock movements
    const order = await prisma.$transaction(async tx => {
      const createdOrder = await tx.order.create({
        data: {
          organizationId: token.organizationId!,
          branchId: branchProducts[0].branchId,
          personnelId: token.sub!,
          customerId: customer.id,
          total: totalAmount,
          paidAmount: totalAmount,
          balance: 0,
          status: "COMPLETED",
          createdAt: date ? new Date(date) : undefined,
        },
      });

      for (const item of items) {
        const bp = branchProducts.find(b => b.id === item.branchProductId)!;
        const lineTotal = bp.sellingPrice * item.quantity;

        // Order item
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

        // Decrement stock
        await tx.branchProduct.update({
          where: { id: bp.id },
          data: { stock: { decrement: item.quantity } },
        });

        // Sale log
        await tx.sale.create({
          data: {
            organizationId: token.organizationId!,
            branchProductId: bp.id,
            productId: bp.productId,
            quantity: item.quantity,
            total: lineTotal,
            currency: bp.product.currency,
            createdAt: date ? new Date(date) : undefined,
          },
        });

        // Stock movement
        await tx.stockMovement.create({
          data: {
            branchProductId: bp.id,
            branchId: bp.branchId,
            personnelId: token.sub!,
            type: "OUT",
            quantity: item.quantity,
            note: "Sale",
          },
        });
      }

      // Update customer aggregates
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalOrders: { increment: 1 },
          totalSpent: { increment: totalAmount },
        },
      });

      return createdOrder;
    });

    const response: SaleResponse = { success: true, orderId: order.id };
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("POST /api/sales error:", error);
    return NextResponse.json({ error: "Failed to create sale" }, { status: 500 });
  }
}
