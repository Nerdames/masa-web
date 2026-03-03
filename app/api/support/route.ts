import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { SupportRequestSchema } from "@/lib/validators/support";
import { CriticalAction, ApprovalStatus, Role, NotificationType } from "@prisma/client";

interface SupportResponse {
  success: boolean;
  requestId?: string;
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<SupportResponse>> {
  try {
    const json: unknown = await req.json();
    const result = SupportRequestSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { subject, message, category, metadata } = result.data;
    const targetRole = metadata.isAdmin ? Role.DEV : Role.ADMIN;

    // Map frontend actionKey to Prisma CriticalAction Enum
    // This allows the Approval List to show specific "Quick Action" buttons
    let mappedAction: CriticalAction;
    
    switch (metadata.actionKey) {
      case "USER_LOCK_UNLOCK":
        mappedAction = CriticalAction.USER_LOCK_UNLOCK;
        break;
      case "BRANCH_TRANSFER":
        mappedAction = CriticalAction.STOCK_TRANSFER; // Proxying since schema lacks STAFF_TRANSFER
        break;
      default:
        // Use a generic critical action if it's a general support ticket
        mappedAction = CriticalAction.USER_LOCK_UNLOCK; 
    }

    // 1. Create the Approval Request with the specific Action Type
    const request = await prisma.approvalRequest.create({
      data: {
        organizationId: metadata.organizationId,
        branchId: metadata.branchId,
        requesterId: metadata.personnelId,
        actionType: mappedAction, 
        status: ApprovalStatus.PENDING,
        requiredRole: targetRole,
        changes: {
          kind: "SUPPORT_TICKET",
          actionKey: metadata.actionKey, // Saved for directed UI actions
          subject,
          message,
          category,
          submittedBy: metadata.personnelId
        },
      },
    });

    // 2. Trigger a System Notification
    await prisma.notification.create({
      data: {
        organizationId: metadata.organizationId,
        branchId: metadata.branchId,
        targetRole: targetRole,
        type: NotificationType.APPROVAL_REQUIRED,
        title: `Support Protocol: ${subject}`,
        message: `Action Required: ${metadata.actionKey.replace(/_/g, ' ')}`,
      },
    });

    // 3. Log the activity
    await logActivity({
      personnelId: metadata.personnelId,
      organizationId: metadata.organizationId,
      branchId: metadata.branchId,
      approvalRequestId: request.id,
      action: "SUPPORT_TICKET_SUBMITTED",
      meta: JSON.stringify({ subject, actionKey: metadata.actionKey }) 
    });

    return NextResponse.json({ success: true, requestId: request.id }, { status: 200 });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}