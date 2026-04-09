import { NextResponse } from "next/server";
import { prisma } from "@/core/lib/prisma"; // Adjust based on your prisma client export path
import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.organizationId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const orgId = session.user.organizationId;
  const branchId = session.user.branchId;

  try {
    // Parallel execution for high-speed terminal response
    const [lowStock, pendingApprovals, activeOrders, inTransit] = await Promise.all([
      // 1. Low Stock: branch products where stock is <= reorderLevel [cite: 36, 40]
      prisma.branchProduct.count({
        where: { 
          organizationId: orgId, 
          branchId: branchId || undefined, 
          stock: { lte: prisma.branchProduct.fields.reorderLevel } 
        }
      }),
      // 2. Pending Approvals: Requests awaiting decision [cite: 14, 18]
      prisma.approvalRequest.count({
        where: { organizationId: orgId, status: "PENDING" }
      }),
      // 3. Active Orders: POs in Draft or Issued status [cite: 3, 43]
      prisma.purchaseOrder.count({
        where: { 
          organizationId: orgId, 
          status: { in: ["DRAFT", "ISSUED"] } 
        }
      }),
      // 4. In Transit: Stock transfers that are currently pending [cite: 2, 5, 7]
      prisma.stockTransfer.count({
        where: { 
          organizationId: orgId, 
          status: "PENDING" 
        }
      })
    ]);

    // Return numeric values as expected by the DashboardStats interface
    return NextResponse.json({
      lowStock,
      pendingApprovals,
      activeOrders,
      inTransit
    });
  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    // Return zeros on error to prevent UI crash
    return NextResponse.json({ 
      lowStock: 0, 
      pendingApprovals: 0, 
      activeOrders: 0, 
      inTransit: 0 
    });
  }
}