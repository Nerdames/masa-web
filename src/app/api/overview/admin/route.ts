import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import prisma from "@/infrastructure/prisma/client"; // Singleton database client
import { authorize } from "@/server/permissions/enforcer"; // Server permissions enforcer
import { Role, PermissionAction, Severity, ActorType } from "@prisma/client";

// Ensure this route is never statically cached
export const dynamic = "force-dynamic";

// Define resources locally since your schema uses String for resource
const RESOURCES = {
  REPORT: "REPORT",
  INVOICE: "INVOICE"
} as const;

export async function GET(req: Request) {
  try {
    // 1. Authenticate Request via NextAuth
    const session = await getServerSession();
    
    if (!session || !session.user || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Identify User & Context
    // FIX: Using findFirst instead of findUnique because 'email' is part of a compound unique key
    const user = await prisma.authorizedPersonnel.findFirst({
      where: { email: session.user.email },
      select: { 
        id: true, 
        role: true, 
        organizationId: true, 
        isOrgOwner: true 
      }
    });

    if (!user) {
      return NextResponse.json({ error: "User identity not found" }, { status: 404 });
    }

    const orgId = user.organizationId;
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "UNKNOWN";
    const deviceInfo = req.headers.get("user-agent") || "UNKNOWN";

    // 3. Centralized RBAC Authorization
    const authCheck = await authorize({
      role: user.role as Role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.READ,
      resources: RESOURCES.REPORT, 
    });

    if (!authCheck.allowed) {
      // Forensic Audit Log for blocked access
      await prisma.activityLog.create({
        data: {
          organizationId: orgId,
          actorId: user.id,
          actorType: ActorType.USER,
          actorRole: user.role,
          action: "UNAUTHORIZED_DASHBOARD_ACCESS",
          targetType: RESOURCES.REPORT,
          targetId: "admin-overview-terminal",
          severity: Severity.HIGH,
          critical: true,
          description: `Blocked attempt to access Admin Overview. Role: ${user.role}`,
          ipAddress,
          deviceInfo,
        }
      });

      return NextResponse.json({ error: "Forbidden access" }, { status: 403 });
    }

    // 4. Fetch Dashboard Statistics (30-day window)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalRevenueResult, totalOrders, totalCustomers] = await Promise.all([
      prisma.invoice.aggregate({
        where: { 
          organizationId: orgId, 
          status: { in: ['PAID', 'PARTIALLY_PAID', 'ISSUED'] },
          issuedAt: { gte: thirtyDaysAgo },
          deletedAt: null
        },
        _sum: { total: true }
      }),
      prisma.order.count({
        where: { 
          organizationId: orgId, 
          status: 'FULFILLED',
          deletedAt: null
        }
      }),
      prisma.customer.count({
        where: { 
          organizationId: orgId, 
          deletedAt: null 
        }
      })
    ]);

    const totalRevenue = Number(totalRevenueResult._sum.total || 0);

    // 5. Fetch Chart Data (Revenue vs Expenses by Branch)
    const branches = await prisma.branch.findMany({
      where: { organizationId: orgId, active: true, deletedAt: null },
      select: { id: true, name: true }
    });

    const chartData = await Promise.all(branches.map(async (branch) => {
      const branchRev = await prisma.invoice.aggregate({
        where: { branchId: branch.id, status: { in: ['PAID', 'ISSUED'] }, deletedAt: null },
        _sum: { total: true }
      });
      
      const branchExp = await prisma.expense.aggregate({
        where: { branchId: branch.id, status: 'PAID' },
        _sum: { amount: true }
      });

      const revenue = Number(branchRev._sum.total || 0);

      return {
        branch: branch.name.split(" ")[0], // Shorten name for UI fit
        revenue,
        expenses: Number(branchExp._sum.amount || 0),
        target: revenue * 1.2 || 500000 
      };
    }));

    // 6. Fetch Recent Operations Data (Recent Invoices)
    const recentInvoicesRaw = await prisma.invoice.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: { issuedAt: 'desc' },
      take: 5,
      include: { branch: { select: { name: true } } }
    });

    const recentInvoices = recentInvoicesRaw.map(inv => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber || `INV-${inv.id.slice(-6).toUpperCase()}`,
      total: Number(inv.total || 0),
      status: inv.status,
      issuedAt: inv.issuedAt,
      branchName: inv.branch.name
    }));

    // 7. Fire & Forget Forensic Audit Log (Non-blocking)
    prisma.activityLog.create({
      data: {
        organizationId: orgId,
        actorId: user.id,
        actorType: ActorType.USER,
        actorRole: user.role,
        action: "VIEW_DASHBOARD",
        targetType: RESOURCES.REPORT,
        targetId: "admin-overview-terminal",
        severity: Severity.LOW,
        critical: false,
        description: "Accessed the Admin Overview Control Terminal",
        ipAddress,
        deviceInfo,
      }
    }).catch(err => console.error("Forensic Audit Log Failed:", err));

    // 8. Return Validated Structured Payload
    return NextResponse.json({
      stats: {
        totalRevenue,
        totalOrders,
        totalCustomers,
      },
      chartData,
      recentInvoices
    });

  } catch (error) {
    console.error("OVERVIEW_API_ERROR:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}