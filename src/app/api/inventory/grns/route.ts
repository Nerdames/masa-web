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

const parseDateSafe = (v: string | null) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

function csvEscape(value: any) {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Audit Log with Cryptographic Chaining
 * Aligned with your verified working logic
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

  const previousHash = lastLog?.hash ?? "GENESIS";
  const logPayload = JSON.stringify({
    action: data.action,
    actorId: data.actorId,
    requestId: data.requestId,
    previousHash,
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
      targetType: RESOURCES.PROCUREMENT,
      severity: Severity.MEDIUM,
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
      type: "INVENTORY",
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
    unitCost: z.number().optional(),
  })).min(1),
});

/* -------------------------
  GET Handler
------------------------- */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user;

    const { searchParams } = new URL(req.url);

    // Meta Handlers for UI Dropdowns (required for Workspace page)
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
    
    if (search) {
      where.OR = [
        { grnNumber: { contains: search, mode: "insensitive" } },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
      ];
    }
    if (status && status !== "all") where.status = status;

    const [items, total] = await Promise.all([
      prisma.goodsReceiptNote.findMany({
        where,
        include: { 
          vendor: { select: { name: true } }, 
          purchaseOrder: { select: { poNumber: true } }, 
          items: true,
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

    const user = session.user;
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

    const result = await prisma.$transaction(async (tx) => {
      let branchId = data.branchId;
      let vendorId = data.vendorId;

      // 1. Resolve Branch & Vendor from PO context
      if (data.purchaseOrderId) {
        const po = await tx.purchaseOrder.findUnique({ where: { id: data.purchaseOrderId } });
        if (!po) throw new Error("Purchase Order not found");
        branchId = po.branchId;
        vendorId = po.vendorId; 
      }

      if (!vendorId) throw new Error("Vendor is required.");

      // 2. Map products to branch catalog
      const productIds = items.map(i => i.productId);
      const branchProducts = await tx.branchProduct.findMany({
        where: { branchId, productId: { in: productIds } },
        select: { id: true, productId: true }
      });
      const bpMap = new Map(branchProducts.map(bp => [bp.productId, bp.id]));

      // 3. Create GRN
      const grnNumber = `GRN-${Date.now().toString().slice(-8)}`;
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
          items: {
            create: items.map(i => {
              const bpId = bpMap.get(i.productId);
              if (!bpId) throw new Error(`Product ${i.productId} is not registered in this branch.`);
              return {
                productId: i.productId,
                branchProductId: bpId,
                quantityAccepted: i.quantityAccepted,
                quantityRejected: i.quantityRejected,
                unitCost: new Decimal(i.unitCost || 0),
              };
            })
          }
        }
      });

      // 4. Update Stock and PO Progression
      for (const item of items) {
        if (item.poItemId) {
          await tx.purchaseOrderItem.update({
            where: { id: item.poItemId },
            data: { quantityReceived: { increment: item.quantityAccepted } }
          });
        }

        await tx.branchProduct.updateMany({
          where: { branchId, productId: item.productId },
          data: { stock: { increment: item.quantityAccepted } }
        });
      }

      // 5. Automated PO Status Sync
      if (data.purchaseOrderId) {
        const allPoItems = await tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId: data.purchaseOrderId }
        });
        
        // FIX: Using Number() to avoid "gte is not a function" error
        const isFulfilled = allPoItems.every(i => 
          Number(i.quantityReceived) >= Number(i.quantityOrdered)
        );
        
        await tx.purchaseOrder.update({
          where: { id: data.purchaseOrderId },
          data: { status: isFulfilled ? POStatus.FULFILLED : POStatus.PARTIALLY_RECEIVED }
        });
      }

      // 6. Audit Logging
      const log = await createAuditLog(tx, {
        organizationId: user.organizationId,
        branchId,
        actorId: user.id,
        actorRole: user.role as Role,
        action: "CREATE_GRN",
        resourceId: grn.id,
        description: `Created GRN ${grn.grnNumber}`,
        requestId,
      });

      // 7. Push Notifications
      await notifyManagement(
        tx,
        user.organizationId,
        branchId,
        "Inventory Received",
        `GRN ${grnNumber} generated. Stock levels for ${items.length} items updated.`,
        log.id
      );

      return grn;
    });

    return NextResponse.json({ success: true, id: result.id, grnNumber: result.grnNumber }, { status: 201 });
  } catch (error: any) {
    console.error("[GRN_POST_ERROR]", error.message);
    return NextResponse.json({ error: error.message || "Process failed" }, { status: 400 });
  }
}