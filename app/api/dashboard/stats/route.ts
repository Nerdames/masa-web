import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getToken } from "next-auth/jwt";

const secret = process.env.NEXTAUTH_SECRET as string;

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (!token || !token.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgFilter = {
      organizationId: token.organizationId,
    };

    const [
      totalProducts,
      totalCustomers,
      totalOrders,
      totalBranches,
      totalSales,
      lowStockCount,
    ] = await Promise.all([
      prisma.product.count({
        where: { ...orgFilter, deletedAt: null },
      }),
      prisma.customer.count({
        where: { ...orgFilter, deletedAt: null },
      }),
      prisma.order.count({
        where: { ...orgFilter, deletedAt: null },
      }),
      prisma.branch.count({
        where: { ...orgFilter, deletedAt: null },
      }),
      prisma.sale.aggregate({
        where: orgFilter,
        _sum: { total: true },
      }),
      prisma.branchProduct.count({
        where: {
          ...orgFilter,
          tag: "LOW_STOCK",
        },
      }),
    ]);

    return NextResponse.json({
      totalProducts,
      totalCustomers,
      totalOrders,
      totalBranches,
      totalSalesAmount: totalSales._sum.total ?? 0,
      lowStockCount,
    });
  } catch (error) {
    console.error("GET /api/dashboard/stats error:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard stats" },
      { status: 500 }
    );
  }
}
