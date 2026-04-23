import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { z } from "zod";
import {
  ActorType,
  Severity,
  Prisma,
  ApprovalStatus,
  CriticalAction,
  Role,
  NotificationType,
  PermissionAction,
} from "@prisma/client";
import crypto from "crypto";
import {
  authorize,
  RESOURCES,
  ACTION_REQUIREMENTS,
  ROLE_WEIGHT,
} from "@/core/lib/permission";
import { applyActionDirectly } from "@/core/lib/actions";
import { eventBus } from "@/core/events";

/* -------------------------
  Types & Helpers
------------------------- */
interface SessionUser {
  id: string;
  organizationId: string;
  branchId: string | null;
  role: Role;
  isOrgOwner: boolean;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const EXPORT_LIMIT = 5000;

function parseIntSafe(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseDateSafe(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export const ACTION_TARGET_MAP: Record<
  CriticalAction,
  { resource: string; tableName: string; getTarget: (tx: Prisma.TransactionClient, id: string) => Promise<any> }
> = {
  USER_LOCK_UNLOCK: { resource: "USER", tableName: "AuthorizedPersonnel", getTarget: (tx, id) => tx.authorizedPersonnel.findUnique({ where: { id } }) },
  EMAIL_CHANGE: { resource: "USER", tableName: "AuthorizedPersonnel", getTarget: (tx, id) => tx.authorizedPersonnel.findUnique({ where: { id } }) },
  PASSWORD_CHANGE: { resource: "USER", tableName: "AuthorizedPersonnel", getTarget: (tx, id) => tx.authorizedPersonnel.findUnique({ where: { id } }) },
  PRICE_UPDATE: { resource: "PRODUCT", tableName: "BranchProduct", getTarget: (tx, id) => tx.branchProduct.findUnique({ where: { id } }) },
  STOCK_ADJUST: { resource: "INVENTORY", tableName: "BranchProduct", getTarget: (tx, id) => tx.branchProduct.findUnique({ where: { id } }) },
  STOCK_TRANSFER: { resource: "INVENTORY", tableName: "StockTransfer", getTarget: (tx, id) => tx.stockTransfer.findUnique({ where: { id } }) },
  VOID_INVOICE: { resource: "INVOICE", tableName: "Invoice", getTarget: (tx, id) => tx.invoice.findUnique({ where: { id } }) },
};

/* -------------------------
  Zod Schemas
------------------------- */
const CreateApprovalSchema = z.object({
  actionType: z.nativeEnum(CriticalAction),
  targetId: z.string().cuid(),
  organizationId: z.string().cuid(),
  branchId: z.string().cuid().optional().nullable(),
  changes: z.any(),
  expectedVersion: z.number().int().optional(),
});

/* -------------------------
  Forensic Engine
------------------------- */
export async function createAuditLog(
  tx: Prisma.TransactionClient,
  data: {
    organizationId: string;
    branchId?: string | null;
    actorId: string;
    actorRole: Role;
    action: string;
    resourceId: string;
    description: string;
    severity?: Severity;
    requestId: string;
    ipAddress: string;
    deviceInfo: string;
    metadata?: any;
    before?: any;
    after?: any;
  }
) {
  if (!data.organizationId) throw new Error("Log Integrity Violation: Missing Organization ID");

  const { resourceId, ...logData } = data;

  const lastLog = await tx.activityLog.findFirst({
    where: { organizationId: data.organizationId },
    orderBy: { createdAt: "desc" },
    select: { hash: true },
  });

  const previousHash = lastLog?.hash ?? "0".repeat(64);
  const hashPayload = JSON.stringify({
    previousHash,
    requestId: data.requestId,
    actorId: data.actorId,
    action: data.action,
    targetId: resourceId,
    timestamp: Date.now(),
  });

  const hash = crypto.createHash("sha256").update(hashPayload).digest("hex");

  return await tx.activityLog.create({
    data: {
      ...logData,
      actorType: ActorType.USER,
      targetType: "APPROVAL_REQUEST",
      targetId: resourceId,
      severity: data.severity ?? Severity.MEDIUM,
      metadata: data.metadata || Prisma.JsonNull,
      before: data.before || Prisma.JsonNull,
      after: data.after || Prisma.JsonNull,
      previousHash,
      hash,
      critical: data.severity === Severity.HIGH || data.severity === Severity.CRITICAL,
    },
  });
}

/* -------------------------
  GET: Fetch Matrix Data
------------------------- */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;

    if (!user?.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const page = parseIntSafe(searchParams.get("page"), 1);
    const limit = Math.min(parseIntSafe(searchParams.get("limit"), DEFAULT_LIMIT), MAX_LIMIT);
    const search = searchParams.get("search")?.trim();
    const status = searchParams.get("status");
    const actionType = searchParams.get("actionType");
    const branchId = searchParams.get("branchId");
    const from = parseDateSafe(searchParams.get("from"));
    const to = parseDateSafe(searchParams.get("to"));
    const exportAll = searchParams.get("export") === "true";

    // RBAC Context
    const isElevated = [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role);
    if (branchId && user.branchId !== branchId && !user.isOrgOwner && user.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Cross-branch access denied" }, { status: 403 });
    }

    const where: Prisma.ApprovalRequestWhereInput = {
      organizationId: user.organizationId,
      ...(branchId && { branchId }),
      ...(!isElevated && { requesterId: user.id }),
    };

    if (status && status !== "all") where.status = status as ApprovalStatus;
    if (actionType && actionType !== "all") where.actionType = actionType as CriticalAction;
    if (search) {
      where.OR = [
        { id: { contains: search, mode: "insensitive" } },
        { requester: { name: { contains: search, mode: "insensitive" } } }
      ];
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    const [items, total] = await Promise.all([
      prisma.approvalRequest.findMany({
        where,
        include: {
          requester: { select: { id: true, name: true, email: true, role: true, staffCode: true } },
          approver: { select: { id: true, name: true, email: true, role: true } },
          branch: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: "desc" },
        take: exportAll ? EXPORT_LIMIT : limit,
        skip: exportAll ? 0 : (page - 1) * limit,
      }),
      prisma.approvalRequest.count({ where }),
    ]);

    if (exportAll && isElevated) {
      const header = ["RequestID", "ActionType", "Status", "Requester", "TargetNode", "CreatedAt", "Approver"];
      const rows = items.map((it) => [
        it.id,
        it.actionType,
        it.status,
        it.requester?.name || "Unknown",
        it.branch?.name || "Global",
        it.createdAt.toISOString(),
        it.approver?.name || "Pending"
      ]);
      const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="approval_audit_${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({ items, total, page, limit });
  } catch (error) {
    console.error("[GET_APPROVALS_ERROR]:", error);
    return NextResponse.json({ error: "Failed to fetch approvals" }, { status: 500 });
  }
}

/* -------------------------
  POST: Initiate Protocol
------------------------- */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!user?.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const validated = CreateApprovalSchema.parse(body);

    if (validated.branchId && user.branchId !== validated.branchId && !user.isOrgOwner && user.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Unauthorized branch access" }, { status: 403 });
    }

    const requestId = crypto.randomUUID();
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    return await prisma.$transaction(async (tx) => {
      const config = ACTION_TARGET_MAP[validated.actionType];
      if (!config) throw new Error("Unsupported protocol signature.");

      const target = await config.getTarget(tx, validated.targetId);
      if (!target) throw new Error("Target resource out of bounds.");
      if (target.organizationId !== validated.organizationId) throw new Error("Cross-organization restriction.");
      
      // Self-Protection check
      if (target.id === user.id && ["USER_LOCK_UNLOCK", "EMAIL_CHANGE", "PASSWORD_CHANGE"].includes(validated.actionType)) {
        throw new Error("Self-targeting via secure protocols is strictly forbidden.");
      }

      if (validated.expectedVersion !== undefined && "version" in target && target.version !== validated.expectedVersion) {
        throw new Error("State conflict: Target has been mutated by a concurrent process.");
      }

      // Check ABAC override first
      let isAuthorized = user.isOrgOwner;
      if (!isAuthorized) {
        const permission = await tx.permission.findUnique({
          where: {
            organizationId_role_action_resource: {
              organizationId: user.organizationId,
              role: user.role,
              action: PermissionAction.UPDATE,
              resource: config.resource,
            },
          },
        });
        if (permission) isAuthorized = true;
      }
      if (!isAuthorized) throw new Error("Matrix clearance level insufficient.");

      // Role weight check for immediate execution vs. requiring approval
      const requiredRole = ACTION_REQUIREMENTS[validated.actionType] || Role.ADMIN;
      const canExecuteDirectly = user.isOrgOwner || ROLE_WEIGHT[user.role] >= ROLE_WEIGHT[requiredRole];

      if (canExecuteDirectly) {
        const result = await applyActionDirectly(tx, validated.actionType, validated.targetId, validated.changes, user.id, user.organizationId, validated.branchId);
        
        await createAuditLog(tx, {
          organizationId: user.organizationId,
          branchId: validated.branchId,
          actorId: user.id,
          actorRole: user.role,
          action: `EXECUTE_${validated.actionType}`,
          resourceId: target.id, // Log against the specific item
          description: `Direct execution of ${validated.actionType} matrix.`,
          requestId, ipAddress, deviceInfo,
          severity: Severity.HIGH,
          before: target,
          after: validated.changes,
        });

        return NextResponse.json({ status: "COMPLETED", result });
      }

      // Draft Approval Request
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h limit
      const request = await tx.approvalRequest.create({
        data: {
          organizationId: user.organizationId,
          branchId: validated.branchId,
          requesterId: user.id,
          actionType: validated.actionType,
          targetId: validated.targetId,
          targetType: config.tableName,
          changes: validated.changes as Prisma.InputJsonValue,
          requiredRole,
          status: ApprovalStatus.PENDING,
          expiresAt,
        },
      });

      await createAuditLog(tx, {
        organizationId: user.organizationId,
        branchId: validated.branchId,
        actorId: user.id,
        actorRole: user.role,
        action: `REQUEST_APPROVAL_${validated.actionType}`,
        resourceId: request.id,
        description: `Authorization requested for ${validated.actionType}.`,
        requestId, ipAddress, deviceInfo,
        severity: Severity.MEDIUM,
      });

      eventBus.emitEvent("approval.requested", {
        organizationId: user.organizationId,
        branchId: validated.branchId,
        approvalId: request.id,
        requesterId: user.id,
        actionType: validated.actionType,
        notificationType: NotificationType.APPROVAL,
      });

      return NextResponse.json({ status: "PENDING", approvalId: request.id });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error: any) {
    console.error("[APPROVAL_POST_ERROR]", error);
    return NextResponse.json({ error: error instanceof z.ZodError ? error.flatten() : error.message }, { status: 400 });
  }
}