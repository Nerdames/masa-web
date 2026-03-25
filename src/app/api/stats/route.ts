// File: /app/api/dashboard/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";
import { getToken } from "next-auth/jwt";

const secret = process.env.NEXTAUTH_SECRET as string;

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (!token || !token.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = token.organizationId;

    // Counts for all models in your schema
    const [
      organizations,
      branches,
      personnel,
      customers,
      customerTags,
      customerGroups,
      products,
      branchProducts,
      categories,
      vendors,
      orders,
      orderItems,
      invoices,
      payments,
      sales,
      receipts,
      stockMovements,
      preferences,
      activityLogs,
      notifications,
      customerOrderSummaries,
    ] = await Promise.all([
      prisma.organization.count({ where: { id: orgId } }),
      prisma.branch.count({ where: { organizationId: orgId, deletedAt: null } }),
      prisma.authorizedPersonnel.count({ where: { organizationId: orgId, disabled: false, deletedAt: null } }),
      prisma.customer.count({ where: { organizationId: orgId, deletedAt: null } }),
      prisma.customerTag.count({ where: { organizationId: orgId } }),
      prisma.customerGroup.count({ where: { organizationId: orgId } }),
      prisma.product.count({ where: { organizationId: orgId, deletedAt: null } }),
      prisma.branchProduct.count({ where: { organizationId: orgId, deletedAt: null } }),
      prisma.category.count({ where: { organizationId: orgId } }),
      prisma.vendor.count({ where: { organizationId: orgId, deletedAt: null } }),
      prisma.order.count({ where: { organizationId: orgId, deletedAt: null } }),
      prisma.orderItem.count({
        where: {
          order: { organizationId: orgId, deletedAt: null }, // join to order
        },
      }),
      prisma.invoice.count({ where: { organizationId: orgId, deletedAt: null } }),
      prisma.payment.count({
        where: {
          invoice: { organizationId: orgId, deletedAt: null }, // join to invoice
        },
      }),
      prisma.sale.count({ where: { organizationId: orgId, deletedAt: null } }),
      prisma.receipt.count({ where: { organizationId: orgId } }),
      prisma.stockMovement.count({ where: { branch: { organizationId: orgId } } }),
      prisma.preference.count({ where: { organizationId: orgId } }),
      prisma.activityLog.count({ where: { organizationId: orgId } }),
      prisma.notification.count({ where: { organizationId: orgId } }),
      prisma.customerOrderSummary.count({ where: { organizationId: orgId } }),
    ]);

    return NextResponse.json({
      organizations,
      branches,
      personnel,
      customers,
      customerTags,
      customerGroups,
      products,
      branchProducts,
      categories,
      vendors,
      orders,
      orderItems,
      invoices,
      payments,
      sales,
      receipts,
      stockMovements,
      preferences,
      activityLogs,
      notifications,
      customerOrderSummaries,
    });
  } catch (error) {
    console.error("GET /api/dashboard/stats error:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard stats" },
      { status: 500 }
    );
  }
}