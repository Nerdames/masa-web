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
import { authorize, RESOURCES } from "@/core/lib/permission";

/* -------------------------
  Helpers & Config
------------------------- */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const EXPORT_LIMIT = 10000;

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

function generateGRNNumber(branchId?: string | null): string {
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  const branchPart = branchId ? branchId.slice(0, 4).toUpperCase() : "ORG";
  return `GRN-${branchPart}-${suffix}`;
}

/* -------------------------
  Forensic Audit & Notification Engines
------------------------- */

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
    metadata?: Prisma.JsonValue;
    before?: Prisma.JsonValue;
    after?: Prisma.JsonValue;
  }
) {
  const lastLog = await tx.activityLog.findFirst({
    where: { organizationId: data.organizationId },
    orderBy: { createdAt: "desc" },
    select: { hash: true },
  });

  const previousHash = lastLog?.hash ?? "0".repeat(64);
  const timestamp = Date.now();

  const hashPayload = JSON.stringify({
    previousHash,
    requestId: data.requestId,
    actorId: data.actorId,
    action: data.action,
    targetId: data.resourceId,
    timestamp,
  });

  const hash = crypto.createHash("sha256").update(hashPayload).digest("hex");

  return await tx.activityLog.create({
    data: {
      organizationId: data.organizationId,
      branchId: data.branchId ?? undefined,
      actorId: data.actorId,
      actorType: ActorType.USER,
      actorRole: data.actorRole,
      action: data.action,
      targetType: "GRN",
      targetId: data.resourceId,
      severity: data.severity ?? Severity.HIGH,
      description: data.description,
      metadata: data.metadata ?? Prisma.JsonNull,
      before: data.before ?? Prisma.JsonNull,
      after: data.after ?? Prisma.JsonNull,
      requestId: data.requestId,
      ipAddress: data.ipAddress,
      deviceInfo: data.deviceInfo,
      previousHash,
      hash,
      critical: true,
    },
  });
}

async function notifyManagement(
  tx: Prisma.TransactionClient,
  organizationId: string,
  branchId: string | null | undefined,
  title: string,
  message: string,
  activityLogId: string
) {
  const targets = await tx.authorizedPersonnel.findMany({
    where: {
      organizationId,
      deletedAt: null,
      disabled: false,
      OR: [{ role: Role.ADMIN }, { role: Role.MANAGER }, { role: Role.AUDITOR }, { isOrgOwner: true }],
    },
    select: { id: true },
  });

  if (targets.length === 0) return;

  await tx.notification.create({
    data: {
      organizationId,
      branchId: branchId ?? undefined,
      type: NotificationType.INVENTORY,
      title,
      message,
      activityLogId,
      recipients: {
        create: targets.map((t) => ({ personnelId: t.id })),
      },
    },
  });
}

async function canExport(user: any): Promise<boolean> {
  if (user.isOrgOwner) return true;
  try {
    const perm = await prisma.permission.findUnique({
      where: {
        organizationId_role_action_resource: {
          organizationId: user.organizationId,
          role: user.role,
          action: PermissionAction.EXPORT,
          resource: RESOURCES.PROCUREMENT,
        },
      },
    });
    if (perm) return true;
  } catch (e) {}
  return [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role);
}

/* -------------------------
  GET /api/inventory/grns
------------------------- */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;

    const { searchParams } = new URL(req.url);
    const meta = searchParams.get("meta");
    const orgId = user.organizationId;
    
    const isGlobalViewer = [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role) || user.isOrgOwner;
    const branchIdParam = searchParams.get("branchId");
    const branchId = isGlobalViewer ? branchIdParam : (user.branchId || branchIdParam);

    // --- META DROPDOWNS ---
    if (meta) {
      if (meta === "vendors") {
        const items = await prisma.vendor.findMany({
          where: { organizationId: orgId, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        });
        return NextResponse.json({ items });
      }

      if (meta === "purchase-orders") {
        const items = await prisma.purchaseOrder.findMany({
          where: { 
            organizationId: orgId, 
            status: { in: [POStatus.ISSUED, POStatus.PARTIALLY_RECEIVED] } 
          },
          select: { id: true, poNumber: true, vendorId: true, branchId: true },
          orderBy: { createdAt: "desc" },
        });
        return NextResponse.json({ items });
      }
      return NextResponse.json({ error: "Unknown meta type" }, { status: 400 });
    }

    // --- MAIN QUERY ---
    const type = searchParams.get("type") || "grn";
    const page = parseIntSafe(searchParams.get("page"), 1);
    const limit = Math.min(parseIntSafe(searchParams.get("limit"), DEFAULT_LIMIT), MAX_LIMIT);
    const search = searchParams.get("search")?.trim() || null;
    const status = searchParams.get("status") || null;
    const from = parseDateSafe(searchParams.get("from"));
    const to = parseDateSafe(searchParams.get("to"));
    
    const exportAll = searchParams.get("export") === "true";
    if (exportAll && !(await canExport(user))) {
      return NextResponse.json({ error: "ACCESS_DENIED: Export authorization failed." }, { status: 403 });
    }

    const take = exportAll ? EXPORT_LIMIT : limit;
    const skip = exportAll ? 0 : (page - 1) * take;

    /* --- LEDGER VIEW --- */
    if (type === "ledger") {
      const auth = authorize({
        role: user.role,
        isOrgOwner: user.isOrgOwner,
        action: PermissionAction.READ,
        resource: RESOURCES.AUDIT,
      });
      if (!auth.allowed) return NextResponse.json({ error: "Unauthorized for Ledger" }, { status: 403 });

      const where: Prisma.ActivityLogWhereInput = { organizationId: orgId, targetType: "GRN" };
      if (branchId) where.branchId = branchId;
      if (search) {
        where.OR = [
          { action: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ];
      }
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = from;
        if (to) where.createdAt.lte = to;
      }

      const [items, total] = await Promise.all([
        prisma.activityLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take,
          skip,
          include: { personnel: { select: { name: true, role: true } } },
        }),
        prisma.activityLog.count({ where }),
      ]);

      return NextResponse.json({
        items: items.map(it => ({
          ...it,
          actorRole: it.personnel?.role ?? it.actorRole,
          actorName: it.personnel?.name ?? "System",
        })),
        total, page, limit: take 
      });
    }

    /* --- GRN LIST VIEW --- */
    const where: Prisma.GoodsReceiptNoteWhereInput = { organizationId: orgId };
    if (branchId) where.branchId = branchId;
    if (search) {
      where.OR = [
        { grnNumber: { contains: search, mode: "insensitive" } },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
        { purchaseOrder: { poNumber: { contains: search, mode: "insensitive" } } }
      ];
    }
    if (status && status !== "all") where.status = status as GRNStatus;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    const [items, total] = await Promise.all([
      prisma.goodsReceiptNote.findMany({
        where,
        include: {
          vendor: { select: { name: true } },
          purchaseOrder: { select: { poNumber: true } },
          receivedBy: { select: { name: true } },
          items: { include: { product: { select: { name: true, sku: true, uom: true } } } }
        },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.goodsReceiptNote.count({ where }),
    ]);

    if (exportAll) {
      const header = ["GRN Number", "Date", "Vendor", "PO Ref", "Status", "Items Count", "Received By"];
      const rows = items.map((it) => [
        it.grnNumber,
        it.receivedAt.toISOString(),
        it.vendor?.name || "N/A",
        it.purchaseOrder?.poNumber || "Direct",
        it.status,
        String(it.items.length),
        it.receivedBy?.name || "System"
      ]);
      const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="grns_${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({ items, total, page, limit: take });
  } catch (err: any) {
    console.error("[GRN_GET_ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------------
  POST /api/inventory/grns
------------------------- */

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;
    const orgId = user.organizationId;
    
    const requestId = crypto.randomUUID();
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.CREATE,
      resource: RESOURCES.PROCUREMENT,
    });
    if (!auth.allowed) return NextResponse.json({ error: "ACCESS_DENIED: Insufficient permissions." }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const { 
      branchId: bodyBranchId, 
      vendorId: bodyVendorId, 
      purchaseOrderId, 
      receivedAt, 
      notes, 
      items: rawItems 
    } = body;

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json({ error: "GRN must contain at least one item." }, { status: 400 });
    }

    // Serializable isolation ensures stock counts remain accurate under concurrency
    const result = await prisma.$transaction(async (tx) => {
      let branchId = bodyBranchId || user.branchId;
      let vendorId = bodyVendorId;

      // 1. Context Resolution from PO
      if (purchaseOrderId) {
        const po = await tx.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
        if (!po) throw new Error("Linked Purchase Order not found.");
        if (po.status === POStatus.CANCELLED) throw new Error("Cannot receive items for a cancelled PO.");
        branchId = po.branchId;
        vendorId = po.vendorId;
      }

      if (!branchId) throw new Error("Target branch is required.");
      if (!vendorId) throw new Error("Vendor is required.");

      // PRE-FETCH: Get all base products to inherit UoM
      const productIds = rawItems.map((it: any) => it.productId);
      const baseProducts = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, uomId: true }
      });
      const productMap = new Map(baseProducts.map(p => [p.id, p]));

      // 2. Create Header
      const grnNumber = generateGRNNumber(branchId);
      const grn = await tx.goodsReceiptNote.create({
        data: {
          organizationId: orgId,
          branchId,
          vendorId,
          purchaseOrderId: purchaseOrderId || null,
          grnNumber,
          status: GRNStatus.RECEIVED,
          receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
          receivedById: user.id,
          notes: notes || null,
        },
        include: { vendor: { select: { name: true } } }
      });

      // 3. Process Items & Inventory
      for (const it of rawItems) {
        const itemCost = new Decimal(it.unitCost || 0);
        const qtyAccepted = Number(it.quantityAccepted || 0);
        const baseProduct = productMap.get(it.productId);

        if (!baseProduct) throw new Error(`Product ${it.productId} not found in registry.`);

        // Bridge to Local Inventory (BranchProduct) - Now mapping inherited UoM
        const branchProduct = await tx.branchProduct.upsert({
          where: { branchId_productId: { branchId, productId: it.productId } },
          update: { 
            stock: { increment: qtyAccepted },
            costPrice: itemCost,
            vendorId: vendorId
          },
          create: {
            organizationId: orgId,
            branchId,
            productId: it.productId,
            vendorId,
            stock: qtyAccepted,
            costPrice: itemCost,
            reorderLevel: 0,
            safetyStock: 0,
            uomId: baseProduct.uomId // <-- ALIGNED: Branch product inherits UoM from base product
          }
        });

        // Link Physical Receipt
        await tx.goodsReceiptItem.create({
          data: {
            grnId: grn.id,
            productId: it.productId,
            branchProductId: branchProduct.id,
            poItemId: it.poItemId || null,
            quantityAccepted: qtyAccepted,
            quantityRejected: Number(it.quantityRejected || 0),
            unitCost: itemCost
          }
        });

        // Double-Entry Ledger
        await tx.stockMovement.create({
          data: {
            organizationId: orgId,
            branchId,
            branchProductId: branchProduct.id,
            productId: it.productId,
            type: StockMovementType.IN,
            quantity: qtyAccepted,
            unitCost: itemCost,
            totalCost: itemCost.mul(qtyAccepted),
            reason: `Physical Restock: ${grn.grnNumber}`,
            runningBalance: branchProduct.stock,
            handledById: user.id,
            grnId: grn.id
          }
        });

        // PO Fulfillment Sync
        if (it.poItemId) {
          await tx.purchaseOrderItem.update({
            where: { id: it.poItemId },
            data: { quantityReceived: { increment: qtyAccepted } }
          });
        }
      }

      // 4. Update PO State Machine
      if (purchaseOrderId) {
        const allItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId } });
        const isFulfilled = allItems.every(i => 
          new Decimal(i.quantityReceived).gte(new Decimal(i.quantityOrdered))
        );
        await tx.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: { status: isFulfilled ? POStatus.FULFILLED : POStatus.PARTIALLY_RECEIVED }
        });
      }

      // 5. Forensic Logging
      const log = await createAuditLog(tx, {
        organizationId: orgId,
        branchId,
        actorId: user.id,
        actorRole: user.role as Role,
        action: "CREATE_GRN",
        resourceId: grn.id,
        description: `Goods Receipt Logged: ${grn.grnNumber} (Vendor: ${grn.vendor?.name})`,
        requestId,
        ipAddress,
        deviceInfo,
        after: grn as any
      });

      // 6. Notification
      await notifyManagement(
        tx,
        orgId,
        branchId,
        "Stock Received",
        `GRN ${grnNumber} generated. Stock levels updated for ${rawItems.length} items.`,
        log.id
      );

      return grn;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 15000
    });

    return NextResponse.json({ success: true, id: result.id, grnNumber: result.grnNumber }, { status: 201 });
  } catch (err: any) {
    console.error("[GRN_POST_ERROR]", err);
    return NextResponse.json({ error: err.message || "Failed to process receipt." }, { status: 400 });
  }
}