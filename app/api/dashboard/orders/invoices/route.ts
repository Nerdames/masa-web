import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getToken } from "next-auth/jwt";

const secret = process.env.NEXTAUTH_SECRET as string;

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !token.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const orderId = url.searchParams.get("orderId");
    if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });

    const invoices = await prisma.invoice.findMany({
      where: { orderId },
    });

    return NextResponse.json(invoices);
  } catch (error) {
    console.error("GET /api/orders/invoices error:", error);
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !token.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, paid }: { id: string; paid: boolean } = await req.json();
    if (!id) return NextResponse.json({ error: "Invoice ID required" }, { status: 400 });

    const invoice = await prisma.invoice.update({
      where: { id },
      data: { paid },
    });

    return NextResponse.json(invoice);
  } catch (error) {
    console.error("PATCH /api/orders/invoices error:", error);
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
  }
}
