import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  if (!startParam || !endParam) {
    return NextResponse.json({ success: false, message: "Missing date range" }, { status: 400 });
  }

  const start = new Date(startParam);
  const end = new Date(endParam);
  const orgId = session.user.organizationId;
  const branchId = session.user.branchId || undefined; 

  try {
    // Parallel fetching of time-series data based on the MASA Schema
    const [logs, approvals, stockMoves, purchaseOrders, expenses] = await Promise.all([
      prisma.activityLog.findMany({
        where: { organizationId: orgId, branchId, createdAt: { gte: start, lte: end } },
        select: { id: true, action: true, createdAt: true, critical: true }
      }),
      prisma.approvalRequest.findMany({
        where: { organizationId: orgId, branchId, createdAt: { gte: start, lte: end } },
        select: { id: true, actionType: true, status: true, createdAt: true }
      }),
      prisma.stockMovement.findMany({
        where: { organizationId: orgId, branchId, createdAt: { gte: start, lte: end } },
        select: { id: true, type: true, quantity: true, createdAt: true }
      }),
      prisma.purchaseOrder.findMany({
        where: { organizationId: orgId, branchId, createdAt: { gte: start, lte: end } },
        select: { id: true, poNumber: true, status: true, createdAt: true }
      }),
      prisma.expense.findMany({
        where: { organizationId: orgId, branchId, date: { gte: start, lte: end } },
        select: { id: true, reference: true, amount: true, date: true }
      })
    ]);

    // Standardize the event structure for the calendar component
    const formattedEvents = [
      ...logs.map(l => ({ 
        id: l.id, 
        type: l.critical ? "SECURITY" : "LOG", 
        title: l.action.replace(/_/g, " "), 
        date: l.createdAt 
      })),
      ...approvals.map(a => ({ 
        id: a.id, 
        type: "APPROVAL", 
        title: `${a.actionType} [${a.status}]`, 
        date: a.createdAt 
      })),
      ...stockMoves.map(s => ({ 
        id: s.id, 
        type: "STOCK", 
        title: `${s.type} MOVE (${s.quantity})`, 
        date: s.createdAt 
      })),
      ...purchaseOrders.map(p => ({ 
        id: p.id, 
        type: "PO", 
        title: `PO #${p.poNumber} [${p.status}]`, 
        date: p.createdAt 
      })),
      ...expenses.map(e => ({ 
        id: e.id, 
        type: "EXPENSE", 
        title: `EXP: ${e.reference || 'N/A'}`, 
        date: e.date 
      }))
    ];

    return NextResponse.json({ success: true, data: formattedEvents });
  } catch (error) {
    console.error("[CALENDAR_API_ERROR]", error);
    return NextResponse.json({ success: false, error: "Database fetch failed" }, { status: 500 });
  }
}