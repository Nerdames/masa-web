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
  Role,
  NotificationType,
  StockMovementType,
  TransactionType,
  AccountType,
  PermissionAction as AuthPermissionAction, // FIX: Import and alias from Prisma client
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import crypto from "crypto";
import { 
  authorize, 
  RESOURCES, 
  ROLE_WEIGHT 
} from "@/core/lib/permission"; // FIX: Removed non-existent exports PermissionAction and ACTION_REQUIREMENTS

/* -------------------------
  Zod Validation Schemas
------------------------- */
const RefundItemSchema = z.object({
  branchProductId: z.string().cuid("Invalid Branch Product ID"),
  productId: z.string().cuid().optional(),
  quantity: z.number().int().positive("Return quantity must be at least 1"),
  refundAmount: z.number().min(0, "Refund amount cannot be negative"),
  restocked: z.boolean().default(true),
});

const CreateRefundSchema = z.object({
  invoiceId: z.string().cuid("Invalid Invoice ID"),
  reason: z.string().max(500, "Reason too long").optional(),
  items: z.array(RefundItemSchema).min(1, "At least one item is required to initiate a return"),
});

const UpdateRefundSchema = z.object({
  refundId: z.string().cuid(),
  status: z.enum([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED]),
  notes: z.string().max(500).optional(),
  financialAccountId: z.string().cuid("Invalid Financial Account ID").optional(),
});

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

function generateRefundReference(): string {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `RET-${dateStr}-${suffix}`;
}

/**
 * Forensic Audit Logging Engine
 */
async function createAuditLog(
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
      targetType: "REFUND",
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

/**
 * Operations Stakeholder Notification
 */
async function notifyStakeholders(
  tx: Prisma.TransactionClient,
  orgId: string,
  branchId: string,
  title: string,
  message: string,
  activityLogId: string
) {
  const targets = await tx.authorizedPersonnel.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      disabled: false,
      OR: [
        { role: Role.ADMIN },
        { isOrgOwner: true },
        { branchId: branchId, role: { in: [Role.MANAGER, Role.INVENTORY, Role.AUDITOR] } },
      ],
    },
    select: { id: true },
  });

  if (targets.length === 0) return;

  await tx.notification.create({
    data: {
      organizationId: orgId,
      type: NotificationType.TRANSACTIONAL,
      title,
      message,
      activityLogId,
      recipients: { create: targets.map((t) => ({ personnelId: t.id })) },
    },
  });
}

/* -------------------------
  GET: List Returns & Refunds
------------------------- */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;

    if (!user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized or missing organization context" }, { status: 401 });
    }

    const auth = authorize({ 
      role: user.role, 
      isOrgOwner: user.isOrgOwner, 
      action: AuthPermissionAction.READ, 
      resource: RESOURCES.INVOICE // FIX: SALES was not a valid key in RESOURCES
    });
    
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason || "Unauthorized access" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const meta = searchParams.get("meta");
    const orgId = user.organizationId;

    if (meta === "dependencies") {
      const [accounts, branchProducts] = await Promise.all([
        prisma.financeAccount.findMany({
          where: { 
            organizationId: orgId, 
            deletedAt: null,
            OR: [{ branchId: user.branchId }, { branchId: null }]
          },
          select: { id: true, name: true, balance: true, type: true },
        }),
        prisma.branchProduct.findMany({
          where: { organizationId: orgId, branchId: user.branchId || undefined, deletedAt: null },
          include: { product: { select: { id: true, name: true, sku: true, uom: { select: { abbreviation: true } } } } },
        }),
      ]);
      return NextResponse.json({ accounts, branchProducts });
    }

    const page = parseIntSafe(searchParams.get("page"), 1);
    const limit = Math.min(parseIntSafe(searchParams.get("limit"), DEFAULT_LIMIT), MAX_LIMIT);
    const search = searchParams.get("search")?.trim();
    const status = searchParams.get("status");
    const from = parseDateSafe(searchParams.get("from"));
    const to = parseDateSafe(searchParams.get("to"));
    const exportAll = searchParams.get("export") === "true";

    const where: Prisma.RefundWhereInput = {
      organizationId: orgId,
      ...(user.isOrgOwner || [Role.ADMIN, Role.AUDITOR].includes(user.role as Role)
        ? {} 
        : { branchId: user.branchId! }),
    };

    if (status && status !== "all") where.status = status as ApprovalStatus;
    if (search) {
      where.OR = [
        { refundNumber: { contains: search, mode: "insensitive" } },
        { invoice: { invoiceNumber: { contains: search, mode: "insensitive" } } }
      ];
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    const [items, total] = await Promise.all([
      prisma.refund.findMany({
        where,
        include: {
          invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
          processedBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
          items: { 
            include: { 
              branchProduct: { 
                include: { product: { select: { name: true, sku: true, uom: { select: { abbreviation: true } } } } } 
              } 
            } 
          },
        },
        orderBy: { createdAt: "desc" },
        take: exportAll ? EXPORT_LIMIT : limit,
        skip: exportAll ? 0 : (page - 1) * limit,
      }),
      prisma.refund.count({ where }),
    ]);

    if (exportAll) {
      const header = ["Ref Number", "Invoice", "Status", "Customer", "Items", "Total Refunded", "Reason", "Created At"];
      const rows = items.map((it) => [
        it.refundNumber,
        it.invoice?.invoiceNumber || "N/A",
        it.status,
        it.invoice?.customer?.name || "Walk-in",
        it.items.length.toString(),
        it.totalRefunded.toString(),
        it.reason || "",
        it.createdAt.toISOString(),
      ]);
      const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="refunds_${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({ items, total, page, limit });
  } catch (err) {
    console.error("[REFUND_GET_ERROR]", err);
    return NextResponse.json({ error: "Data retrieval failed" }, { status: 500 });
  }
}

/* -------------------------
  POST: Initiate Return
------------------------- */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;

    if (!user?.organizationId || !user.branchId) {
      return NextResponse.json({ error: "Unauthorized: Branch context required" }, { status: 401 });
    }

    const auth = authorize({ 
      role: user.role, 
      isOrgOwner: user.isOrgOwner, 
      action: AuthPermissionAction.CREATE, 
      resource: RESOURCES.INVOICE // FIX: SALES was not a valid key in RESOURCES
    });
    
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason || "Unauthorized access" }, { status: 403 });
    }

    const body = await req.json();
    const validated = CreateRefundSchema.parse(body);

    const requestId = crypto.randomUUID();
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: validated.invoiceId },
        select: { id: true, branchId: true, invoiceNumber: true }
      });

      if (!invoice || invoice.branchId !== user.branchId) {
        throw new Error("Target invoice not accessible in current branch context.");
      }

      const branchProductIds = validated.items.map(i => i.branchProductId);
      const sales = await tx.sale.findMany({
        where: { 
          invoiceId: validated.invoiceId, 
          branchProductId: { in: branchProductIds }
        }
      });

      const totalRefunded = validated.items.reduce((sum, item) => sum + item.refundAmount, 0);

      const refund = await tx.refund.create({
        data: {
          organizationId: user.organizationId,
          branchId: user.branchId!,
          invoiceId: validated.invoiceId,
          refundNumber: generateRefundReference(),
          status: ApprovalStatus.PENDING,
          totalRefunded: new Decimal(totalRefunded),
          reason: validated.reason,
          processedById: user.id,
          items: {
            create: validated.items.map((it) => {
              const saleRecord = sales.find(s => s.branchProductId === it.branchProductId);
              if (!saleRecord) {
                 throw new Error(`Product match not found in origin Invoice for branchProduct ID: ${it.branchProductId}`);
              }
              return {
                branchProductId: it.branchProductId,
                saleId: saleRecord.id,
                quantity: it.quantity,
                refundAmount: new Decimal(it.refundAmount),
                restocked: it.restocked,
              };
            }),
          },
        },
      });

      const log = await createAuditLog(tx, {
        organizationId: user.organizationId,
        branchId: user.branchId,
        actorId: user.id,
        actorRole: user.role,
        action: "REFUND_INITIATED",
        resourceId: refund.id,
        description: `Refund ${refund.refundNumber} initiated for Invoice ${invoice.invoiceNumber}.`,
        requestId, ipAddress, deviceInfo,
        after: { status: refund.status, amount: totalRefunded },
      });

      await notifyStakeholders(
        tx, 
        user.organizationId, 
        user.branchId!,
        "Refund Request", 
        `Return ${refund.refundNumber} requires manager approval.`, 
        log.id
      );

      return refund;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    console.error("[REFUND_POST_ERROR]", err);
    return NextResponse.json({ error: err instanceof z.ZodError ? err.flatten() : err.message }, { status: 400 });
  }
}

/* -------------------------
  PATCH: Process Return
------------------------- */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;

    if (!user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized or missing context" }, { status: 401 });
    }

    const body = await req.json();
    const { refundId, status: targetStatus, notes, financialAccountId } = UpdateRefundSchema.parse(body);

    const canProcess = user.isOrgOwner || ROLE_WEIGHT[user.role] >= ROLE_WEIGHT[Role.MANAGER];
    if (!canProcess) {
      return NextResponse.json({ error: "Managerial authority required to finalize returns." }, { status: 403 });
    }

    const requestId = crypto.randomUUID();
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    const result = await prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({
        where: { id: refundId },
        include: { items: true },
      });

      if (!refund || refund.organizationId !== user.organizationId) {
        throw new Error("Refund record not found.");
      }

      if (refund.status !== ApprovalStatus.PENDING) {
        throw new Error("This request has already been processed.");
      }

      let logAction = "";
      let metadataPayload: any = {};

      if (targetStatus === ApprovalStatus.APPROVED) {
        logAction = "REFUND_APPROVED";

        if (refund.totalRefunded.gt(0)) {
          if (!financialAccountId) throw new Error("Funding account is required for payouts.");

          const account = await tx.financeAccount.findUnique({ where: { id: financialAccountId } });
          if (!account || account.balance.lt(refund.totalRefunded)) {
            throw new Error(`Insufficient funds in ${account?.name || 'selected account'}.`);
          }

          const newBalance = account.balance.minus(refund.totalRefunded);

          await tx.financeAccount.update({
            where: { id: account.id },
            data: { balance: newBalance },
          });

          const financialTx = await tx.transaction.create({
            data: {
              accountId: account.id,
              type: TransactionType.REFUND,
              amount: new Decimal(refund.totalRefunded).mul(-1),
              runningBalance: newBalance,
              refundId: refund.id,
              handledById: user.id,
              metadata: { 
                reference: refund.refundNumber, 
                description: `Refund Approved: ${refund.refundNumber}` 
              },
            },
          });

          metadataPayload.transactionId = financialTx.id;
        }

        for (const item of refund.items) {
          if (item.restocked) {
            const bp = await tx.branchProduct.update({
              where: { id: item.branchProductId },
              data: { stock: { increment: item.quantity } },
            });

            await tx.stockMovement.create({
              data: {
                organizationId: user.organizationId,
                branchId: refund.branchId,
                branchProductId: bp.id,
                productId: bp.productId,
                type: StockMovementType.IN,
                quantity: item.quantity,
                unitCost: bp.costPrice || new Decimal(0),
                totalCost: new Decimal(bp.costPrice || 0).mul(item.quantity),
                runningBalance: bp.stock,
                reason: `Restocked via Refund: ${refund.refundNumber}`,
                handledById: user.id,
                refundItemId: item.id,
              },
            });
          }
        }
      } else {
        logAction = "REFUND_REJECTED";
      }

      const updated = await tx.refund.update({
        where: { id: refundId },
        data: { 
          status: targetStatus,
          approvedBy: { connect: { id: user.id } },
          reason: notes ? `${refund.reason || ""}\n[Finalized]: ${notes}` : refund.reason
        },
      });

      const log = await createAuditLog(tx, {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.role,
        action: logAction,
        resourceId: updated.id,
        description: `Refund ${updated.refundNumber} transitioned to ${targetStatus}.`,
        requestId, ipAddress, deviceInfo,
        severity: targetStatus === ApprovalStatus.APPROVED ? Severity.HIGH : Severity.MEDIUM,
        metadata: metadataPayload,
        before: { status: refund.status },
        after: { status: targetStatus },
      });

      await notifyStakeholders(
        tx, 
        user.organizationId, 
        refund.branchId,
        "Refund Finalized", 
        `Refund ${updated.refundNumber} was ${targetStatus.toLowerCase()}.`, 
        log.id
      );

      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[REFUND_PATCH_ERROR]", err);
    return NextResponse.json({ error: err instanceof z.ZodError ? err.flatten() : err.message }, { status: 400 });
  }
}