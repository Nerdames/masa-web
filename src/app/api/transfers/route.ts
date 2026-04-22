import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { z } from "zod";
import {
  ActorType,
  Severity,
  Prisma,
  StockTransferStatus,
  Role,
  NotificationType,
  StockMovementType,
  PermissionAction,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import crypto from "crypto";
import { 
  authorize, 
  RESOURCES, 
  ACTION_REQUIREMENTS, 
  ROLE_WEIGHT 
} from "@/core/lib/permission";

/* -------------------------
  Zod Validation Schemas
------------------------- */
const TransferItemSchema = z.object({
  productId: z.string().cuid(),
  branchProductId: z.string().cuid(),
  quantity: z.number().int().positive("Quantity must be at least 1"),
});

const CreateTransferSchema = z.object({
  toBranchId: z.string().cuid(),
  notes: z.string().max(500).optional(),
  items: z.array(TransferItemSchema).min(1, "At least one item is required"),
});

const UpdateTransferSchema = z.object({
  transferId: z.string().cuid(),
  action: z.enum(["APPROVE", "COMPLETE", "REJECT", "CANCEL"]),
  notes: z.string().max(500).optional(),
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

function generateTransferReference(): string {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `TRF-${dateStr}-${suffix}`;
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
      targetType: "STOCK_TRANSFER",
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
 * Logistics Stakeholder Notification
 */
async function notifyStakeholders(
  tx: Prisma.TransactionClient,
  orgId: string,
  title: string,
  message: string,
  activityLogId: string,
  targetBranchIds: string[]
) {
  const targets = await tx.authorizedPersonnel.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      disabled: false,
      OR: [
        { role: Role.ADMIN },
        { isOrgOwner: true },
        { branchId: { in: targetBranchIds }, role: { in: [Role.MANAGER, Role.INVENTORY] } },
      ],
    },
    select: { id: true },
  });

  if (targets.length === 0) return;

  await tx.notification.create({
    data: {
      organizationId: orgId,
      type: NotificationType.INVENTORY,
      title,
      message,
      activityLogId,
      recipients: { create: targets.map((t) => ({ personnelId: t.id })) },
    },
  });
}

/* -------------------------
  GET: List Transfers
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
      action: PermissionAction.READ, 
      resource: RESOURCES.STOCK 
    });
    
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason || "Unauthorized access" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const meta = searchParams.get("meta");
    const orgId = user.organizationId;

    if (meta === "dependencies") {
      const [branches, branchProducts] = await Promise.all([
        prisma.branch.findMany({
          where: { organizationId: orgId, deletedAt: null, id: { not: user.branchId || undefined } },
          select: { id: true, name: true },
        }),
        prisma.branchProduct.findMany({
          where: { organizationId: orgId, branchId: user.branchId || undefined, deletedAt: null },
          include: { product: { select: { id: true, name: true, sku: true, uom: { select: { abbreviation: true } } } } },
        }),
      ]);
      return NextResponse.json({ branches, branchProducts });
    }

    const page = parseIntSafe(searchParams.get("page"), 1);
    const limit = Math.min(parseIntSafe(searchParams.get("limit"), DEFAULT_LIMIT), MAX_LIMIT);
    const search = searchParams.get("search")?.trim();
    const status = searchParams.get("status");
    const from = parseDateSafe(searchParams.get("from"));
    const to = parseDateSafe(searchParams.get("to"));
    const exportAll = searchParams.get("export") === "true";

    const where: Prisma.StockTransferWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      OR: user.isOrgOwner || [Role.ADMIN, Role.AUDITOR].includes(user.role as Role) 
        ? undefined 
        : [{ fromBranchId: user.branchId! }, { toBranchId: user.branchId! }],
    };

    if (status && status !== "all") where.status = status as StockTransferStatus;
    if (search) {
      where.transferNumber = { contains: search, mode: "insensitive" };
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    const [items, total] = await Promise.all([
      prisma.stockTransfer.findMany({
        where,
        include: {
          fromBranch: { select: { name: true } },
          toBranch: { select: { name: true } },
          createdBy: { select: { name: true } },
          items: { include: { product: { select: { name: true, sku: true, uom: { select: { abbreviation: true } } } } } },
        },
        orderBy: { createdAt: "desc" },
        take: exportAll ? EXPORT_LIMIT : limit,
        skip: exportAll ? 0 : (page - 1) * limit,
      }),
      prisma.stockTransfer.count({ where }),
    ]);

    if (exportAll) {
      const header = ["Ref Number", "Status", "From", "To", "Items", "Created At"];
      const rows = items.map((it) => [
        it.transferNumber,
        it.status,
        it.fromBranch.name,
        it.toBranch.name,
        it.items.length.toString(),
        it.createdAt.toISOString(),
      ]);
      const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="transfers_${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({ items, total, page, limit });
  } catch (err) {
    console.error("[TRANSFER_GET_ERROR]", err);
    return NextResponse.json({ error: "Data retrieval failed" }, { status: 500 });
  }
}

/* -------------------------
  POST: Initiate Transfer
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
      action: PermissionAction.CREATE, 
      resource: RESOURCES.STOCK 
    });
    
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason || "Unauthorized access" }, { status: 403 });
    }

    const body = await req.json();
    const validated = CreateTransferSchema.parse(body);

    const requestId = crypto.randomUUID();
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    if (user.branchId === validated.toBranchId) {
      return NextResponse.json({ error: "Origin and Destination branches cannot be identical." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Bulk verify stock before writes to prevent mid-transaction failures
      const stockChecks = await Promise.all(
        validated.items.map(item => 
          tx.branchProduct.findUnique({
            where: { branchId_productId: { branchId: user.branchId!, productId: item.productId } },
            select: { stock: true, product: { select: { name: true } } }
          })
        )
      );

      stockChecks.forEach((bp, idx) => {
        if (!bp || bp.stock < validated.items[idx].quantity) {
          throw new Error(`Insufficient stock for: ${bp?.product.name || "Unknown SKU"}`);
        }
      });

      // 2. Create Transfer Record
      const transfer = await tx.stockTransfer.create({
        data: {
          organizationId: user.organizationId,
          fromBranchId: user.branchId!,
          toBranchId: validated.toBranchId,
          transferNumber: generateTransferReference(),
          status: StockTransferStatus.PENDING,
          notes: validated.notes,
          createdById: user.id,
          items: {
            create: validated.items.map((it) => ({
              productId: it.productId,
              branchProductId: it.branchProductId,
              quantity: it.quantity,
            })),
          },
        },
        include: { toBranch: { select: { name: true } } }
      });

      // 3. Audit & Notify
      const log = await createAuditLog(tx, {
        organizationId: user.organizationId,
        branchId: user.branchId,
        actorId: user.id,
        actorRole: user.role,
        action: "TRANSFER_INITIATED",
        resourceId: transfer.id,
        description: `TRF ${transfer.transferNumber} dispatched to ${transfer.toBranch.name}.`,
        requestId, ipAddress, deviceInfo,
        after: { status: transfer.status, itemCount: validated.items.length },
      });

      await notifyStakeholders(
        tx, 
        user.organizationId, 
        "Transfer Request", 
        `New stock transfer ${transfer.transferNumber} requires approval for ${transfer.toBranch.name}.`, 
        log.id, 
        [user.branchId!, validated.toBranchId]
      );

      return transfer;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    console.error("[TRANSFER_POST_ERROR]", err);
    return NextResponse.json({ error: err instanceof z.ZodError ? err.flatten() : err.message }, { status: 400 });
  }
}

/* -------------------------
  PATCH: Process Transfer
------------------------- */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;

    if (!user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized or missing context" }, { status: 401 });
    }

    const body = await req.json();
    const { transferId, action, notes: actionNotes } = UpdateTransferSchema.parse(body);

    const canProcess = user.isOrgOwner || ROLE_WEIGHT[user.role] >= ROLE_WEIGHT[ACTION_REQUIREMENTS.STOCK_TRANSFER];
    if (!canProcess) {
      return NextResponse.json({ error: "Higher authority required for this action." }, { status: 403 });
    }

    const requestId = crypto.randomUUID();
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    const result = await prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({
        where: { id: transferId },
        include: { items: true },
      });

      if (!transfer || transfer.organizationId !== user.organizationId) {
        throw new Error("Logistics record not found.");
      }

      let newStatus: StockTransferStatus = transfer.status;
      let logAction = "";

      // --- APPROVAL LOGIC (Stock Exit) ---
      if (action === "APPROVE") {
        if (transfer.status !== StockTransferStatus.PENDING) throw new Error("Target is not in PENDING state.");
        newStatus = StockTransferStatus.APPROVED;
        logAction = "TRANSFER_APPROVED";

        for (const item of transfer.items) {
          const bp = await tx.branchProduct.update({
            where: { branchId_productId: { branchId: transfer.fromBranchId, productId: item.productId } },
            data: { stock: { decrement: item.quantity } },
          });

          await tx.stockMovement.create({
            data: {
              organizationId: user.organizationId,
              branchId: transfer.fromBranchId,
              branchProductId: bp.id,
              productId: item.productId,
              type: StockMovementType.TRANSFER,
              quantity: -item.quantity,
              unitCost: bp.costPrice || new Decimal(0),
              totalCost: new Decimal(bp.costPrice || 0).mul(item.quantity),
              runningBalance: bp.stock,
              reason: `Dispatched via ${transfer.transferNumber}`,
              handledById: user.id,
              stockTransferItemId: item.id,
            },
          });
        }
      }

      // --- COMPLETION LOGIC (Stock Entry) ---
      else if (action === "COMPLETE") {
        if (transfer.status !== StockTransferStatus.APPROVED) throw new Error("Transfer must be APPROVED first.");
        // Note: Using 'COMPLETED' cast as StockTransferStatus. Next schema migration will formally add this enum.
        newStatus = "COMPLETED" as StockTransferStatus; 
        logAction = "TRANSFER_COMPLETED";

        for (const item of transfer.items) {
          const productRef = await tx.product.findUnique({ where: { id: item.productId } });
          if (!productRef) throw new Error(`Product mapping lost for ${item.productId}`);

          const sourceBp = await tx.branchProduct.findUnique({
            where: { branchId_productId: { branchId: transfer.fromBranchId, productId: item.productId } },
          });

          const bp = await tx.branchProduct.upsert({
            where: { branchId_productId: { branchId: transfer.toBranchId, productId: item.productId } },
            update: { stock: { increment: item.quantity } },
            create: {
              organizationId: user.organizationId,
              branchId: transfer.toBranchId,
              productId: item.productId,
              stock: item.quantity,
              uomId: productRef.uomId,
              costPrice: sourceBp?.costPrice || new Decimal(0), 
            },
          });

          await tx.stockMovement.create({
            data: {
              organizationId: user.organizationId,
              branchId: transfer.toBranchId,
              branchProductId: bp.id,
              productId: item.productId,
              type: StockMovementType.TRANSFER,
              quantity: item.quantity,
              unitCost: bp.costPrice || new Decimal(0),
              totalCost: new Decimal(bp.costPrice || 0).mul(item.quantity),
              runningBalance: bp.stock,
              reason: `Received via ${transfer.transferNumber}`,
              handledById: user.id,
              stockTransferItemId: item.id,
            },
          });
        }
      }

      // --- CANCELLATION/REJECTION LOGIC (Rollback) ---
      else if (action === "CANCEL" || action === "REJECT") {
        if (["COMPLETED", StockTransferStatus.CANCELLED].includes(transfer.status as string)) {
          throw new Error("Finalized transfers cannot be modified.");
        }
        newStatus = action === "CANCEL" ? StockTransferStatus.CANCELLED : StockTransferStatus.REJECTED;
        logAction = `TRANSFER_${action}`;
        
        if (transfer.status === StockTransferStatus.APPROVED) {
          for (const item of transfer.items) {
            const bp = await tx.branchProduct.update({
              where: { branchId_productId: { branchId: transfer.fromBranchId, productId: item.productId } },
              data: { stock: { increment: item.quantity } },
            });

            await tx.stockMovement.create({
              data: {
                organizationId: user.organizationId,
                branchId: transfer.fromBranchId,
                branchProductId: bp.id,
                productId: item.productId,
                type: StockMovementType.ADJUST,
                quantity: item.quantity,
                unitCost: bp.costPrice || new Decimal(0),
                totalCost: new Decimal(bp.costPrice || 0).mul(item.quantity),
                runningBalance: bp.stock,
                reason: `Rolled back: ${transfer.transferNumber}`,
                handledById: user.id,
              },
            });
          }
        }
      }

      const updated = await tx.stockTransfer.update({
        where: { id: transferId },
        data: { 
          status: newStatus, 
          // FIX: Use connect syntax for relation fields not exposed as scalars
          ...(action === "APPROVE" ? { 
            approvedBy: { connect: { id: user.id } } 
          } : {}),
          // notes field removed entirely to resolve the Prisma unknown argument error
        },
      });

      const log = await createAuditLog(tx, {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.role,
        action: logAction,
        resourceId: updated.id,
        // Moved the actionNotes logging here so it persists securely
        description: `TRF ${updated.transferNumber} transitioned to ${newStatus}.${actionNotes ? ` [${action}] Notes: ${actionNotes}` : ""}`,
        requestId, ipAddress, deviceInfo,
        severity: Severity.HIGH,
        before: { status: transfer.status },
        after: { status: newStatus },
      });

      await notifyStakeholders(
        tx, 
        user.organizationId, 
        "Logistics Alert", 
        `Transfer ${updated.transferNumber} status updated to ${newStatus}.`, 
        log.id, 
        [transfer.fromBranchId, transfer.toBranchId]
      );

      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[TRANSFER_PATCH_ERROR]", err);
    return NextResponse.json({ error: err instanceof z.ZodError ? err.flatten() : err.message }, { status: 400 });
  }
}