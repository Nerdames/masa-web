import { NextRequest, NextResponse } from "next/server";
import prisma  from "@/lib/prisma";
import { getToken } from "next-auth/jwt";

const secret = process.env.NEXTAUTH_SECRET as string;

// --------------------------
// Types
// --------------------------
interface SaleItem {
  productId: string;
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
  payment?: string;
  date?: string;
}

interface SaleResponse {
  orderId: string;
  success: boolean;
}

// --------------------------
// GET — Fetch sales
// --------------------------
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !["DEV", "ADMIN", "SALES"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sales = await prisma.sale.findMany({
      include: {
        product: true,
        order: { include: { customer: true, user: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(sales, { status: 200 });
  } catch (error) {
    console.error("GET /api/sales error:", error);
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 });
  }
}

// --------------------------
// POST — Create sale
// --------------------------
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !["DEV", "ADMIN", "SALES"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as SalePayload;
    const { buyer, items, payment, date } = body;

    if (!buyer || !items?.length) {
      return NextResponse.json({ error: "Invalid sale payload" }, { status: 400 });
    }

    // 1️⃣ Find or create buyer
    let customer = await prisma.customer.findFirst({
      where: { name: { equals: buyer.name, mode: "insensitive" }, type: "BUYER" },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          name: buyer.name,
          email: buyer.email ?? null,
          phone: buyer.phone ?? null,
          type: "BUYER",
        },
      });
    }

    // 2️⃣ Load products
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });

    let totalAmount = 0;
    for (const item of items) {
      const p = products.find((x) => x.id === item.productId);
      if (!p) return NextResponse.json({ error: `Product not found: ${item.productId}` }, { status: 404 });
      if (p.sellingPrice == null) return NextResponse.json({ error: `Product '${p.name}' has no selling price` }, { status: 400 });
      if (item.quantity > p.stock) return NextResponse.json({ error: `Insufficient stock for '${p.name}'` }, { status: 400 });
      totalAmount += p.sellingPrice * item.quantity;
    }

    // 3️⃣ Transaction — create order, order items, sales, stock movements
    const order = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          userId: token.sub ?? "SYSTEM",
          customerId: customer.id,
          status: "COMPLETED",
          total: totalAmount,
          paymentMethod: payment ?? "UNKNOWN",
          createdAt: date ? new Date(date) : undefined,
        },
      });

      for (const item of items) {
        const product = products.find((p) => p.id === item.productId);
        if (!product) continue;

        const lineTotal = product.sellingPrice! * item.quantity;

        // Order item
        await tx.orderItem.create({
          data: {
            orderId: createdOrder.id,
            productId: product.id,
            quantity: item.quantity,
            price: product.sellingPrice!,
            total: lineTotal,
          },
        });

        // Update product stock & stats
        await tx.product.update({
          where: { id: product.id },
          data: {
            stock: { decrement: item.quantity },
            totalSold: { increment: item.quantity },
            revenue: { increment: lineTotal },
          },
        });

        // Stock movement log
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            branchId: product.branchId ?? null,
            userId: token.sub ?? "SYSTEM",
            type: "OUT",
            quantity: item.quantity,
            note: "Sale processed",
          },
        });

        // Sale log
        await tx.sale.create({
          data: {
            productId: product.id,
            quantity: item.quantity,
            total: lineTotal,
            createdAt: date ? new Date(date) : undefined,
          },
        });
      }

      // Update buyer totals
      await tx.customer.update({
        where: { id: customer.id },
        data: { totalOrders: { increment: 1 }, totalSpent: { increment: totalAmount } },
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
