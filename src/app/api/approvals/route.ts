/**
 * app/api/approvals/route.ts
 * * PRODUCTION-GRADE APPROVAL PROTOCOL HANDLER
 * Integrates with fortified audit engine, strict O(1) permission cache from auth.ts,
 * and robust isolation levels to prevent concurrent race conditions.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { z } from "zod";
import {
  ApprovalStatus,
  CriticalAction,
  Role,
  NotificationType,
  Resource,
  Prisma,
} from "@prisma/client";
import crypto from "crypto";
import { authorize, ROLE_WEIGHT } from "@/core/lib/permission";
import { createAuditLog } from "@/core/lib/audit";
import { eventBus } from "@/core/events";

/* -------------------------------------------------------------------------- */
/* TYPES & CONFIGURATION                                                      */
/* -------------------------------------------------------------------------- */

interface SessionUser {
  id: string;
  organizationId: string;
  branchId: string | null;
  role: Role;
  isOrgOwner: boolean;
  permissions?: string[]; // Injected via dynamic auth.ts resolver
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const EXPORT_LIMIT = 5000;

// Re-aligned targets with Prisma Resource Enums for Audit Engine V2.6
export const ACTION_TARGET_MAP: Record<
  CriticalAction,
  { resource: Resource; tableName: string; getTarget: (tx: Prisma.TransactionClient, id: string) => Promise<any> }
> = {
  USER_LOCK_UNLOCK: { resource: Resource.PERSONNEL, tableName: "AuthorizedPersonnel", getTarget: (tx, id) => tx.authorizedPersonnel.findUnique({ where: { id } }) },
  EMAIL_CHANGE: { resource: Resource.PERSONNEL, tableName: "AuthorizedPersonnel", getTarget: (tx, id) => tx.authorizedPersonnel.findUnique({ where: { id } }) },
  PASSWORD_CHANGE: { resource: Resource.PERSONNEL, tableName: "AuthorizedPersonnel", getTarget: (tx, id) => tx.authorizedPersonnel.findUnique({ where: { id } }) },
  PRICE_UPDATE: { resource: Resource.PRODUCT, tableName: "BranchProduct", getTarget: (tx, id) => tx.branchProduct.findUnique({ where: { id } }) },
  STOCK_ADJUST: { resource: Resource.STOCK, tableName: "BranchProduct", getTarget: (tx, id) => tx.branchProduct.findUnique({ where: { id } }) },
  STOCK_TRANSFER: { resource: Resource.STOCK, tableName: "StockTransfer", getTarget: (tx, id) => tx.stockTransfer.findUnique({ where: { id } }) },
  VOID_INVOICE: { resource: Resource.INVOICE, tableName: "Invoice", getTarget: (tx, id) => tx.invoice.findUnique({ where: { id } }) },
};

/* -------------------------------------------------------------------------- */
/* ZOD SCHEMAS & UTILS                                                        */
/* -------------------------------------------------------------------------- */

const CreateApprovalSchema = z.object({
  actionType: z.nativeEnum(CriticalAction),
  targetId: z.string().cuid(),
  organizationId: z.string().cuid(),
  branchId: z.string().cuid().optional().nullable(),
  changes: z.record(z.any()), // Enforces an object payload for deterministic hashing
  expectedVersion: z.number().int().optional(),
});

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

/* -------------------------------------------------------------------------- */
/* GET: FETCH APPROVAL MATRIX DATA                                            */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;

    if (!user?.organizationId) return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });

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

    // 1. RBAC Visibility Context
    const isElevated = [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role);
    
    // Strict cross-branch access violation check
    if (branchId && user.branchId !== branchId && !user.isOrgOwner && user.role !== Role.ADMIN && user.role !== Role.AUDITOR) {
      return NextResponse.json({ error: "Cross-branch access violation." }, { status: 403 });
    }

    const where: Prisma.ApprovalRequestWhereInput = {
      organizationId: user.organizationId,
      ...(branchId && { branchId }),
      ...(!isElevated && { requesterId: user.id }), // Non-elevated only see their own requests
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

    // 2. Fetch Data with Parallel Promise
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

    // 3. Export Processor
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
    return NextResponse.json({ error: "Failed to fetch approval matrix" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* POST: INITIATE PROTOCOL                                                    */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    
    if (!user?.organizationId) return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });

    const body = await req.json();
    const validated = CreateApprovalSchema.parse(body);

    if (validated.branchId && user.branchId !== validated.branchId && !user.isOrgOwner && user.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Unauthorized branch mutation attempt." }, { status: 403 });
    }

    // Prepare Forensic Metadata
    const requestId = crypto.randomUUID();
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    // Strict Serializable isolation to prevent TOCTOU (Time-of-Check to Time-of-Use) attacks
    return await prisma.$transaction(async (tx) => {
      const config = ACTION_TARGET_MAP[validated.actionType];
      if (!config) throw new Error("Unsupported protocol signature.");

      // 1. Validate Target Integrity
      const target = await config.getTarget(tx, validated.targetId);
      if (!target) throw new Error("Target resource out of bounds or deleted.");
      if (target.organizationId !== validated.organizationId) throw new Error("Cross-organization restriction violation.");
      
      // 2. Anti-Self-Targeting mechanism
      if (target.id === user.id && ["USER_LOCK_UNLOCK", "EMAIL_CHANGE", "PASSWORD_CHANGE"].includes(validated.actionType)) {
        throw new Error("Self-targeting via secure protocols is strictly forbidden.");
      }

      // 3. Optimistic Concurrency Control (OCC) Check
      if (validated.expectedVersion !== undefined && "version" in target && target.version !== validated.expectedVersion) {
        throw new Error("State conflict: Target has been mutated by a concurrent process. Refresh and try again.");
      }

      // 4. Centralized ABAC/RBAC Engine Delegation
      const authResult = authorize({
        role: user.role,
        isOrgOwner: user.isOrgOwner,
        userPermissions: user.permissions || [],
        criticalAction: validated.actionType,
      });

      if (authResult.allowed) {
         // Direct execution is permitted. Halt the Approval Draft and enforce usage of primary resource endpoints.
         return NextResponse.json({
           error: "Privilege Level Bypass Detected: You have direct access to execute this action. Please use the standard resource endpoint to apply changes directly.",
           code: "DIRECT_EXECUTION_REQUIRED"
         }, { status: 400 });
      }

      if (!authResult.requiresApproval) {
        throw new Error(authResult.reason || "Clearance level strictly insufficient to request this action.");
      }

      // 5. Draft Approval Request (48h Time-To-Live)
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); 
      const request = await tx.approvalRequest.create({
        data: {
          organizationId: user.organizationId,
          branchId: validated.branchId,
          requesterId: user.id,
          actionType: validated.actionType,
          targetId: validated.targetId,
          targetType: config.tableName,
          changes: validated.changes as Prisma.InputJsonValue,
          requiredRole: Role.ADMIN, // Or dynamic logic if mapped
          status: ApprovalStatus.PENDING,
          expiresAt,
        },
      });

      // 6. Push to Forensic Audit V2.6 
      await createAuditLog(tx, {
        action: `REQUEST_APPROVAL_${validated.actionType}`,
        resource: config.resource,
        resourceId: target.id, // Audit the actual target, link approval via approvalId
        organizationId: user.organizationId,
        branchId: validated.branchId,
        actorId: user.id,
        actorRole: user.role,
        approvalId: request.id,
        description: `Authorization requested for ${validated.actionType} protocol.`,
        requestId,
        ipAddress,
        deviceInfo,
        changes: { to: validated.changes }, // Leverage the V2.6 diff scrub engine
        critical: true, // Elevates the log into immediate audit tracking
      });

      // 7. Dispatch to Notification Layer
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
    
    return NextResponse.json(
      { error: error instanceof z.ZodError ? error.flatten() : error.message },
      { status: 400 }
    );
  }
}