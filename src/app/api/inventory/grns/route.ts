import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import {
  PermissionAction,
  ActorType,
  Severity,
  Prisma,
  GRNStatus,
  POStatus,
  Role,
  StockMovementType,
  NotificationType
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import crypto from "crypto";
import { z } from "zod";
import { authorize, RESOURCES } from "@/core/lib/permission";

/* -------------------------
  Helpers & Config
------------------------- */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const EXPORT_LIMIT = 10000;

const parseIntSafe = (v: string | null, fallback: number) => {
  const n = parseInt(v || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function csvEscape(value: any) {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Forensic Audit Log with Cryptographic Chaining
 */
async function createAuditLog(
  tx: Prisma.TransactionClient,
  data: {
    organizationId: string;
    branchId: string;
    actorId: string;
    actorRole: Role;
    action: string;
    resourceId: string;
    description: string;
    metadata?: any;
    requestId: string;
  }
) {
  const lastLog = await tx.activityLog.findFirst({
    where: { organizationId: data.organizationId },
    orderBy: { createdAt: "desc" },
    select: { hash: true },
  });

  const previousHash = lastLog?.hash ?? "0".repeat(64);
  const logPayload = JSON.stringify({
    action: data.action,
    actorId: data.actorId,
    requestId: data.requestId,
    previousHash,
    timestamp: Date.now()
  });
  const hash = crypto.createHash("sha256").update(logPayload).digest("hex");

  return tx.activityLog.create({
    data: {
      action: data.action,
      description: data.description,
      organizationId: data.organizationId,
      branchId: data.branchId,
      actorId: data.actorId,
      actorType: ActorType.USER,
      actorRole: data.actorRole,
      targetId: data.resourceId,
      targetType: "GRN",
      severity: Severity.HIGH,
      metadata: data.metadata ?? Prisma.JsonNull,
      requestId: data.requestId,
      previousHash,
      hash,
      critical: true,
    },
  });
}

async function notifyManagement(
  tx: Prisma.TransactionClient,
  organizationId: string,
  branchId: string,
  title: string,
  message: string,
  activityLogId: string
) {
  const managers = await tx.authorizedPersonnel.findMany({
    where: {
      organizationId,
      branchId,
      disabled: false,
      role: { in: [Role.ADMIN, Role.MANAGER, Role.AUDITOR] },
    },
    select: { id: true },
  });

  if (managers.length === 0) return;

  await tx.notification.create({
    data: {
      organizationId,
      branchId,
      type: NotificationType.INVENTORY,
      title,
      message,
      activityLogId,
      recipients: {
        create: managers.map((m) => ({ personnelId: m.id })),
      },
    },
  });
}

/* -------------------------
  Zod Validation
------------------------- */

const createGRNSchema = z.object({
  branchId: z.string().cuid(),
  vendorId: z.string().cuid().optional().nullable(),
  purchaseOrderId: z.string().cuid().optional().nullable(),
  receivedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(z.object({
    poItemId: z.string().cuid().optional().nullable(),
    productId: z.string().cuid(),
    quantityAccepted: z.number().positive(),
    quantityRejected: z.number().min(0).default(0),
    unitCost: z.number().optional().default(0),
  })).min(1),
});

/* -------------------------
  GET Handler
------------------------- */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;

    const { searchParams } = new URL(req.url);

    // Meta Handlers for UI Dropdowns
    const meta = searchParams.get("meta");
    if (meta === "vendors") {
      const vendors = await prisma.vendor.findMany({
        where: { organizationId: user.organizationId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ items: vendors });
    }

    const page = parseIntSafe(searchParams.get("page"), 1);
    const limit = Math.min(parseIntSafe(searchParams.get("limit"), DEFAULT_LIMIT), MAX_LIMIT);
    const search = searchParams.get("search")?.trim() || null;
    const status = searchParams.get("status") as GRNStatus | "all" | null;
    const exportAll = searchParams.get("export") === "true";

    const where: Prisma.GoodsReceiptNoteWhereInput = { organizationId: user.organizationId };
    
    // Branch Isolation
    if (!user.isOrgOwner && !["ADMIN", "MANAGER", "AUDITOR"].includes(user.role)) {
      where.branchId = user.branchId;
    }

    if (search) {
      where.OR = [
        { grnNumber: { contains: search, mode: "insensitive" } },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
        { purchaseOrder: { poNumber: { contains: search, mode: "insensitive" } } }
      ];
    }
    if (status && status !== "all") where.status = status;

    const [items, total] = await Promise.all([
      prisma.goodsReceiptNote.findMany({
        where,
        include: { 
          vendor: { select: { name: true } }, 
          purchaseOrder: { select: { poNumber: true } }, 
          items: { include: { product: { select: { name: true, sku: true } } } },
          receivedBy: { select: { name: true } }
        },
        orderBy: { createdAt: "desc" },
        take: exportAll ? EXPORT_LIMIT : limit,
        skip: exportAll ? 0 : (page - 1) * limit,
      }),
      prisma.goodsReceiptNote.count({ where }),
    ]);

    if (exportAll) {
      const header = ["GRN Number", "Date", "Vendor", "PO Ref", "Status", "Items"];
      const rows = items.map(g => [
        g.grnNumber,
        g.receivedAt.toISOString(),
        g.vendor?.name || "N/A",
        g.purchaseOrder?.poNumber || "N/A",
        g.status,
        g.items.length
      ]);
      const csv = [header, ...rows].map(r => r.map(csvEscape).join(",")).join("\n");
      return new NextResponse(csv, { headers: { "Content-Type": "text/csv" } });
    }

    return NextResponse.json({ items, total, page, limit });
  } catch (error) {
    console.error("[GRN_GET_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/* -------------------------
  POST Handler
------------------------- */

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = session.user as any;
    const requestId = crypto.randomUUID();

    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.CREATE,
      resource: RESOURCES.PROCUREMENT,
    });

    if (!auth.allowed) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const body = await req.json();
    const parsed = createGRNSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

    const { items, ...data } = parsed.data;

    // Serializable transaction to prevent concurrency race conditions during stock increment
    const result = await prisma.$transaction(async (tx) => {
      let branchId = data.branchId;
      let vendorId = data.vendorId;

      // 1. Resolve Context from PO
      if (data.purchaseOrderId) {
        const po = await tx.purchaseOrder.findUnique({ where: { id: data.purchaseOrderId } });
        if (!po) throw new Error("Purchase Order not found");
        if (po.status === POStatus.CANCELLED) throw new Error("Cannot receive items for a cancelled PO.");
        branchId = po.branchId;
        vendorId = po.vendorId; 
      }

      if (!vendorId) throw new Error("Vendor is required.");

      // 2. Create GRN Header
      const grnNumber = `GRN-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${Date.now().toString().slice(-4)}`;
      const grn = await tx.goodsReceiptNote.create({
        data: {
          organizationId: user.organizationId,
          branchId,
          vendorId,
          purchaseOrderId: data.purchaseOrderId || null,
          grnNumber,
          status: GRNStatus.RECEIVED,
          receivedAt: data.receivedAt ? new Date(data.receivedAt) : new Date(),
          receivedById: user.id,
          notes: data.notes,
        },
        include: { vendor: { select: { name: true } } }
      });

      // 3. Process Items: Self-Healing Upsert & Ledger Generation
      for (const item of items) {
        const itemCost = new Decimal(item.unitCost);

        // A. THE BRIDGE: Find or Create the BranchProduct entry automatically
        const branchProduct = await tx.branchProduct.upsert({
          where: {
            branchId_productId: {
              branchId: branchId,
              productId: item.productId,
            },
          },
          update: {
            stock: { increment: item.quantityAccepted },
            costPrice: itemCost, // Update moving average/latest cost
            vendorId: vendorId   // Update primary supplier
          },
          create: {
            organizationId: user.organizationId,
            branchId: branchId,
            productId: item.productId,
            vendorId: vendorId,
            stock: item.quantityAccepted,
            costPrice: itemCost,
            reorderLevel: 0,
            safetyStock: 0,
          },
        });

        // B. Link the physical receipt item to the GRN
        await tx.goodsReceiptItem.create({
          data: {
             grnId: grn.id,
             poItemId: item.poItemId || null,
             productId: item.productId,
             branchProductId: branchProduct.id,
             quantityAccepted: item.quantityAccepted,
             quantityRejected: item.quantityRejected,
             unitCost: itemCost
          }
        });

        // C. Double-Entry Stock Ledger (Strict Audit Trail)
        await tx.stockMovement.create({
          data: {
            organizationId: user.organizationId,
            branchId: branchId,
            branchProductId: branchProduct.id,
            productId: item.productId,
            type: StockMovementType.IN,
            quantity: item.quantityAccepted,
            unitCost: itemCost,
            totalCost: itemCost.mul(item.quantityAccepted),
            reason: `Restock via ${grn.grnNumber}`,
            runningBalance: branchProduct.stock, // Current snapshot after upsert
            handledById: user.id,
            grnId: grn.id,
          }
        });

        // D. Update PO Item Fulfillment
        if (item.poItemId) {
          await tx.purchaseOrderItem.update({
            where: { id: item.poItemId },
            data: { quantityReceived: { increment: item.quantityAccepted } }
          });
        }
      }

      // 4. Automated PO State Machine Sync
      if (data.purchaseOrderId) {
        const allPoItems = await tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId: data.purchaseOrderId }
        });

        const isFulfilled = allPoItems.every(i => 
          new Decimal(i.quantityReceived).gte(new Decimal(i.quantityOrdered))
        );

        await tx.purchaseOrder.update({
          where: { id: data.purchaseOrderId },
          data: { status: isFulfilled ? POStatus.FULFILLED : POStatus.PARTIALLY_RECEIVED }
        });
      }

      // 5. Forensic Audit Logging
      const log = await createAuditLog(tx, {
        organizationId: user.organizationId,
        branchId,
        actorId: user.id,
        actorRole: user.role as Role,
        action: "CREATE_GRN",
        resourceId: grn.id,
        description: `Physical Receipt logged: ${grn.grnNumber} from ${grn.vendor?.name}`,
        requestId,
        metadata: { itemsCount: items.length, poId: data.purchaseOrderId }
      });

      // 6. System-Wide Notification
      await notifyManagement(
        tx,
        user.organizationId,
        branchId,
        "Goods Received",
        `GRN ${grnNumber} generated. Stock levels for ${items.length} products have been updated.`,
        log.id
      );

      return grn;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 15000
    });

    return NextResponse.json({ success: true, id: result.id, grnNumber: result.grnNumber }, { status: 201 });
  } catch (error: any) {
    console.error("[GRN_POST_ERROR]", error.message);
    return NextResponse.json({ error: error.message || "Process failed" }, { status: 400 });
  }
}