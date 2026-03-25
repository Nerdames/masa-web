import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";

export type ChartDataPayment = {
  date: string;
  amount: number;
};

export async function GET(req: NextRequest) {
  try {
    const payments = await prisma.order.groupBy({
      by: ["createdAt"],
      _sum: { total: true },
      orderBy: { createdAt: "asc" },
      take: 30,
    });
    const data: ChartDataPayment[] = payments.map((p) => ({
      date: p.createdAt.toISOString(),
      amount: p._sum.total ?? 0,
    }));
    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/dashboard/payments error:", err);
    return NextResponse.json([], { status: 500 });
  }
}
