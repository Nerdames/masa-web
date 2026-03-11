import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { startOfYear, startOfMonth, subMonths, subYears } from "date-fns";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = session.user.organizationId;
    const now = new Date();
    const startOfCurrentYear = startOfYear(now);
    const startOfPreviousYear = subYears(startOfCurrentYear, 1);
    const startOfCurrentMonth = startOfMonth(now);
    const startOfPreviousMonth = subMonths(startOfCurrentMonth, 1);

    /* ---------------- Summary & Aggregates ---------------- */
    const [
      totalSalesAgg,
      totalOrders,
      newCustomers,
      prevMonthSalesAgg,
      prevMonthOrdersAgg,
      prevYearSalesAgg
    ] = await Promise.all([
      prisma.Sale.aggregate({
        _sum: { total: true },
        where: { organizationId, status: "COMPLETED" },
      }),
      prisma.Order.count({ where: { organizationId, deletedAt: null } }),
      prisma.Customer.count({ where: { organizationId, deletedAt: null } }),
      prisma.Sale.aggregate({
        _sum: { total: true },
        where: {
          organizationId,
          status: "COMPLETED",
          createdAt: { gte: startOfPreviousMonth, lt: startOfCurrentMonth },
        },
      }),
      prisma.Order.count({
        where: {
          organizationId,
          deletedAt: null,
          createdAt: { gte: startOfPreviousMonth, lt: startOfCurrentMonth },
        },
      }),
      prisma.Sale.aggregate({
        _sum: { total: true },
        where: {
          organizationId,
          status: "COMPLETED",
          createdAt: { gte: startOfPreviousYear, lt: startOfCurrentYear },
        },
      }),
    ]);

    const totalSales = Number(totalSalesAgg._sum.total || 0);
    const totalOrdersValue = totalOrders;
    const avgOrderValue = totalOrdersValue > 0 ? totalSales / totalOrdersValue : 0;
    const prevMonthSales = Number(prevMonthSalesAgg._sum.total || 0);
    const prevMonthOrders = prevMonthOrdersAgg;
    const prevYearSales = Number(prevYearSalesAgg._sum.total || 0);

    const changeSalesMoM = prevMonthSales ? ((totalSales - prevMonthSales) / prevMonthSales) * 100 : 0;
    const changeOrdersMoM = prevMonthOrders ? ((totalOrdersValue - prevMonthOrders) / prevMonthOrders) * 100 : 0;
    const changeAovMoM = prevMonthOrders ? ((avgOrderValue - prevMonthSales / prevMonthOrders) / (prevMonthSales / prevMonthOrders)) * 100 : 0;
    const changeSalesYoY = prevYearSales ? ((totalSales - prevYearSales) / prevYearSales) * 100 : 0;

    const summaryCards = [
      { id: "sales", title: "Total Sales", value: `$${totalSales.toLocaleString()}`, change: changeSalesMoM.toFixed(1) },
      { id: "orders", title: "Total Orders", value: totalOrdersValue, change: changeOrdersMoM.toFixed(1) },
      { id: "customers", title: "New Customers", value: newCustomers, change: 0 },
      { id: "aov", title: "Avg Order Value", value: `$${avgOrderValue.toFixed(2)}`, change: changeAovMoM.toFixed(1) },
    ];

    /* ---------------- Sales Chart ---------------- */
    const salesByMonthRaw = await prisma.Sale.findMany({
      where: { organizationId, status: "COMPLETED", createdAt: { gte: startOfCurrentYear } },
      select: { total: true, createdAt: true },
    });

    const salesDataPoints: number[] = Array(12).fill(0);
    salesByMonthRaw.forEach(sale => {
      const month = sale.createdAt.getMonth();
      salesDataPoints[month] += Number(sale.total);
    });

    const salesData = {
      labels: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
      datasets: [{
        label: "Sales",
        data: salesDataPoints,
        backgroundColor: "rgba(255,107,53,0.1)",
        borderColor: "#FF6B35",
        borderWidth: 2,
        tension: 0.3,
        pointBackgroundColor: "#FF6B35",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
      }],
    };

    /* ---------------- Popular Items ---------------- */
    const popularProducts = await prisma.Product.findMany({
      where: { organizationId, deletedAt: null },
      include: { sales: true },
      orderBy: { sales: { _count: "desc" } },
      take: 5,
    });

    const popularItems = popularProducts.map(p => ({
      id: p.id,
      name: p.name,
      category: p.categoryId || "Uncategorized",
      price: Number(p.costPrice),
      image: p.barcode ? `/images/${p.barcode}.jpg` : undefined,
      orders: p.sales.length,
    }));

    /* ---------------- Recent Orders ---------------- */
    const recentOrdersRaw = await prisma.Order.findMany({
      where: { organizationId, deletedAt: null },
      include: { customer: true, items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const recentOrders = recentOrdersRaw.map(o => ({
      id: o.id,
      customer: o.customer?.name || "Guest",
      items: o.items.map(i => i.product?.name || "Unknown").join(", "),
      date: o.createdAt.toISOString(),
      total: Number(o.total),
      status: o.status,
    }));

    /* ---------------- Notifications ---------------- */
    const notificationsRaw = await prisma.Notification.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const notifications = notificationsRaw.map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      read: n.read,
      type: n.type,
      createdAt: n.createdAt.toISOString(),
    }));

    /* ---------------- Return Full Dashboard ---------------- */
    return NextResponse.json({
      summaryCards,
      salesData,
      popularItems,
      recentOrders,
      notifications,
      salesChangeYoY: changeSalesYoY.toFixed(1),
    });
  } catch (error: any) {
    console.error("Dashboard overview error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard overview" }, { status: 500 });
  }
}