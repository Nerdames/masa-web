import { NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";
import { POStatus, Severity, ActorType } from "@prisma/client";

// Utility for standardized numbering
const generatePONumber = () => `PO-${Date.now().toString().slice(-6)}`;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    const branchId = searchParams.get("branchId");

    if (!organizationId || !branchId) {
      return NextResponse.json({ error: "Missing Context IDs" }, { status: 400 });
    }

    const data = await prisma.purchaseOrder.findMany({
      where: { organizationId, branchId, deletedAt: null },
      include: {
        vendor: { select: { name: true, email: true } },
        createdBy: { select: { name: true } },
        items: {
          include: { product: { select: { name: true, sku: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Trace: " + error }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      organizationId, 
      branchId, 
      vendorId, 
      items, 
      expectedDate, 
      userId,
      role 
    } = body;

    // Validation
    if (!items?.length) {
      return NextResponse.json({ error: "Registry requires items" }, { status: 400 });
    }

    const totalAmount = items.reduce((sum: number, i: any) => sum + (i.quantityOrdered * i.unitCost), 0);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create PO record
      const newPO = await tx.purchaseOrder.create({
        data: {
          organizationId,
          branchId,
          vendorId,
          poNumber: generatePONumber(),
          status: POStatus.ISSUED,
          totalAmount,
          expectedDate: expectedDate ? new Date(expectedDate) : null,
          createdById: userId,
          items: {
            create: items.map((item: any) => ({
              productId: item.productId,
              quantityOrdered: Number(item.quantityOrdered),
              unitCost: Number(item.unitCost),
              totalCost: Number(item.quantityOrdered) * Number(item.unitCost),
            }))
          }
        }
      });

      // 2. Audit Trail
      await tx.activityLog.create({
        data: {
          organizationId,
          branchId,
          actorId: userId,
          actorType: ActorType.USER,
          actorRole: role,
          action: "PO_CREATE",
          description: `Manual Generation of ${newPO.poNumber}`,
          severity: Severity.LOW,
          targetId: newPO.id,
          targetType: "PURCHASE_ORDER"
        }
      });

      return newPO;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Protocol Failure" }, { status: 500 });
  }
}