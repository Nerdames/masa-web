import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import {
  Role,
  ApprovalStatus,
  CriticalAction,
  Prisma,
  NotificationType,
  PermissionAction,
} from "@prisma/client";
import { ACTION_REQUIREMENTS, ROLE_WEIGHT } from "@/core/lib/permission";
import { applyActionDirectly } from "@/core/lib/actions";
import { eventBus } from "@/core/events";

/**
 * Maps actions to their Resource (for RBAC) and Table Name (for raw SQL in PATCH)
 */
const ACTION_TARGET_MAP: Record<
  CriticalAction,
  { resource: string; tableName: string; getTarget: (tx: Prisma.TransactionClient, id: string) => Promise<any> }
> = {
  USER_LOCK_UNLOCK: {
    resource: "USER",
    tableName: "AuthorizedPersonnel",
    getTarget: (tx, id) => tx.authorizedPersonnel.findUnique({ where: { id } }),
  },
  EMAIL_CHANGE: {
    resource: "USER",
    tableName: "AuthorizedPersonnel",
    getTarget: (tx, id) => tx.authorizedPersonnel.findUnique({ where: { id } }),
  },
  PASSWORD_CHANGE: {
    resource: "USER",
    tableName: "AuthorizedPersonnel",
    getTarget: (tx, id) => tx.authorizedPersonnel.findUnique({ where: { id } }),
  },
  PRICE_UPDATE: {
    resource: "PRODUCT",
    tableName: "BranchProduct",
    getTarget: (tx, id) => tx.branchProduct.findUnique({ where: { id } }),
  },
  STOCK_ADJUST: {
    resource: "INVENTORY",
    tableName: "BranchProduct",
    getTarget: (tx, id) => tx.branchProduct.findUnique({ where: { id } }),
  },
  STOCK_TRANSFER: {
    resource: "INVENTORY",
    tableName: "StockTransfer",
    getTarget: (tx, id) => tx.stockTransfer.findUnique({ where: { id } }),
  },
  VOID_INVOICE: {
    resource: "INVOICE",
    tableName: "Invoice",
    getTarget: (tx, id) => tx.invoice.findUnique({ where: { id } }),
  },
};

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = (searchParams.get("status") as ApprovalStatus) || ApprovalStatus.PENDING;
    const branchId = searchParams.get("branchId");
    const user = session.user;

    // Branch isolation security
    if (branchId && user.branchId !== branchId && !user.isOrgOwner && user.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Cross-branch access denied" }, { status: 403 });
    }

    const isElevated = [Role.ADMIN, Role.MANAGER, Role.AUDITOR].includes(user.role as Role);

    const approvals = await prisma.approvalRequest.findMany({
      where: {
        organizationId: user.organizationId,
        ...(branchId && { branchId }),
        ...(!isElevated && { requesterId: user.id }),
        status,
      },
      include: {
        requester: { select: { id: true, name: true, role: true, staffCode: true } },
        approver: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(approvals);
  } catch (error) {
    console.error("[GET_APPROVALS_ERROR]:", error);
    return NextResponse.json({ error: "Failed to fetch approvals" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = session.user;
    const body = await req.json();
    const { actionType, targetId, changes, organizationId, branchId, expectedVersion } = body;

    // 1. Basic Validation
    if (!actionType || !targetId || organizationId !== user.organizationId) {
      return NextResponse.json({ error: "Invalid parameters or organization mismatch" }, { status: 400 });
    }
    if (!Object.values(CriticalAction).includes(actionType)) {
      return NextResponse.json({ error: "Invalid action type" }, { status: 400 });
    }

    // 2. Branch Access Validation
    if (branchId && user.branchId !== branchId && !user.isOrgOwner && user.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Unauthorized branch access" }, { status: 403 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const device = req.headers.get("user-agent") || "unknown";

    return await prisma.$transaction(async (tx) => {
      const config = ACTION_TARGET_MAP[actionType as CriticalAction];
      if (!config) throw new Error("Unsupported action");

      const target = await config.getTarget(tx, targetId);
      if (!target) throw new Error("Target resource not found");

      // 3. Tenancy & Logic Checks
      if (target.organizationId !== organizationId) throw new Error("Cross-organization access denied");
      if ("branchId" in target && branchId && target.branchId && target.branchId !== branchId) {
        throw new Error("Invalid branch target");
      }

      // 4. Self-Protection Rule
      if (target.id === user.id && ["USER_LOCK_UNLOCK", "EMAIL_CHANGE", "PASSWORD_CHANGE"].includes(actionType)) {
        throw new Error("Cannot perform security-sensitive actions on your own account");
      }

      // 5. Optimistic Lock Check
      if (expectedVersion !== undefined && "version" in target && target.version !== expectedVersion) {
        throw new Error("Conflict detected: The resource has been updated by another process. Refresh and retry.");
      }

      // 6. DB-Level Permission Check (ABAC)
      let isAuthorized = user.isOrgOwner;
      if (!isAuthorized) {
        const permission = await tx.permission.findUnique({
          where: {
            organizationId_role_action_resource: {
              organizationId,
              role: user.role as Role,
              action: PermissionAction.UPDATE,
              resource: config.resource,
            },
          },
        });
        if (permission) isAuthorized = true;
      }
      if (!isAuthorized) throw new Error("You do not have permission to modify this resource");

      // 7. Role Weight Check for Direct Execution
      const requiredRole = ACTION_REQUIREMENTS[actionType as CriticalAction] || Role.ADMIN;
      const canExecuteDirectly = user.isOrgOwner || ROLE_WEIGHT[user.role as Role] >= ROLE_WEIGHT[requiredRole];

      if (canExecuteDirectly) {
        const result = await applyActionDirectly(tx, actionType, targetId, changes, user.id, organizationId, branchId);
        
        await tx.activityLog.create({
          data: {
            organizationId, branchId, personnelId: user.id,
            action: `EXECUTE_${actionType}`,
            critical: true, ipAddress: ip, deviceInfo: device,
            metadata: { targetId, previousState: target, revertable: true } as Prisma.InputJsonValue,
          },
        });

        return NextResponse.json({ status: "COMPLETED", result });
      }

      // 8. Otherwise, Create Approval Request
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const request = await tx.approvalRequest.create({
        data: {
          organizationId, branchId, requesterId: user.id,
          actionType, targetId, targetType: config.tableName, // Save tableName for PATCH resolution
          changes: changes as Prisma.InputJsonValue,
          requiredRole, status: ApprovalStatus.PENDING, expiresAt,
        },
      });

      await tx.activityLog.create({
        data: {
          organizationId, branchId, personnelId: user.id,
          action: `REQUEST_APPROVAL_${actionType}`,
          approvalId: request.id, ipAddress: ip, deviceInfo: device,
        },
      });

      eventBus.emitEvent("approval.requested", {
        organizationId, branchId, approvalId: request.id,
        requesterId: user.id, actionType, notificationType: NotificationType.APPROVAL,
      });

      return NextResponse.json({ status: "PENDING", approvalId: request.id });
    });
  } catch (error: any) {
    console.error("[APPROVAL_POST_ERROR]", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 400 });
  }
}