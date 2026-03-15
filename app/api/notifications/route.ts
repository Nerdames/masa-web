import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { ApprovalStatus } from "@prisma/client";

interface ApprovalPayload {
  approvalId: string;
  decision: "APPROVED" | "REJECTED";
  rejectionNote?: string;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as ApprovalPayload;
    const { approvalId, decision, rejectionNote } = body;

    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.findUnique({
        where: { id: approvalId },
      });

      if (!request || request.status !== ApprovalStatus.PENDING) {
        throw new Error("Request is no longer valid or has already been processed.");
      }

      const updatedRequest = await tx.approvalRequest.update({
        where: { id: approvalId },
        data: { 
          status: decision,
          approverId: session.user.id,
          appliedAt: decision === "APPROVED" ? new Date() : null,
          rejectionNote
        }
      });

      if (decision === "APPROVED") {
        const changes = request.changes as Record<string, unknown>;
        
        switch (request.actionType) {
          case "USER_LOCK_UNLOCK":
            await tx.authorizedPersonnel.update({
              where: { id: String(request.targetId) },
              data: { 
                isLocked: Boolean(changes.isLocked), 
                lockReason: changes.lockReason ? String(changes.lockReason) : null 
              }
            });
            break;
          case "PRICE_UPDATE":
            await tx.branchProduct.update({
              where: { id: String(request.targetId) },
              data: { sellingPrice: Number(changes.newPrice) }
            });
            break;
          // Extend with other CriticalActions (STOCK_ADJUST, VOID_INVOICE, etc.)
        }
      }

      await tx.activityLog.create({
        data: {
          organizationId: request.organizationId,
          action: `APPROVAL_${decision}_${request.actionType}`,
          personnelId: session.user.id,
          critical: false, // Set to true if you want processing actions to also trigger alerts
          metadata: { requestId: approvalId }
        }
      });

      return updatedRequest;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "An unknown error occurred" }, { status: 500 });
  }
}