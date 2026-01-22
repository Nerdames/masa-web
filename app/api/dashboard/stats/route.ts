// app/api/dashboard/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getToken } from "next-auth/jwt";

const secret = process.env.NEXTAUTH_SECRET as string;

export interface StatCardProps {
  label: string;
  value: string;
  icon?: string;
}

const emptyStats: StatCardProps[] = [
  { label: "Total Orders", value: "0", icon: "bx-cart" },
  { label: "Total Products", value: "0", icon: "bx-box" },
  { label: "Total Users", value: "0", icon: "bx-user" },
  { label: "Total Sales", value: "$0", icon: "bx-chart" },
];

export async function GET(req: NextRequest) {
  try {
    // ----------------- Auth -----------------
    const token = await getToken({ req, secret });
    if (!token || !["DEV", "ADMIN", "MANAGER"].includes(token.role as string)) {
      return NextResponse.json(emptyStats, { status: 401 });
    }

    // Only filter by organization if not DEV
    const orgFilter = token.role === "DEV" ? {} : { organizationId: token.organizationId ?? "" };

    // ----------------- Fetch counts -----------------
    const [totalOrders, totalProducts, totalUsers, totalSalesAggregate] =
      await Promise.all([
        prisma.order.count({ where: orgFilter }),
        prisma.product.count({ where: orgFilter }),
        prisma.personnel.count({ where: orgFilter }), // AuthorizedPersonnel instead of user
        prisma.sale.aggregate({ _sum: { total: true }, where: orgFilter }),
      ]);

    const totalSales = totalSalesAggregate._sum.total ?? 0;

    const stats: StatCardProps[] = [
      { label: "Total Orders", value: totalOrders.toString(), icon: "bx-cart" },
      { label: "Total Products", value: totalProducts.toString(), icon: "bx-box" },
      { label: "Total Users", value: totalUsers.toString(), icon: "bx-user" },
      { label: "Total Sales", value: `$${totalSales}`, icon: "bx-chart" },
    ];

    return NextResponse.json(stats);
  } catch (error) {
    console.error("GET /api/dashboard/stats error:", error);
    return NextResponse.json(emptyStats); // safe fallback
  }
}
