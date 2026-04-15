// app/api/inventory/grn/route.ts
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
} from "@prisma/client";
import crypto from "crypto";
import { z } from "zod";
import { authorize, RESOURCES } from "@/core/lib/permission";

/* -------------------------
  Helpers & Config
------------------------- */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const EXPORT_LIMIT = 10000;

function parseIntSafe(v: string | null, fallback: number) {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseDateSafe(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function csvEscape(value: any) {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    const res = NextResponse.json(
      { error: "SESSION_REQUIRED: Authentication required" },
      { status: 401 }
    );
    throw res;
  }
  return session.user;
}

/**
 * Creates a cryptographically chained audit log inside a transaction.
 */
async function createAuditLog(
  tx: Prisma.TransactionClient,
  data: {
    organizationId: string;
    branchId?: string | null;
    actorId: string;
    action: string;
    resourceId?: string | null;
    severity?: Severity;
    description?: string;
    metadata?: Prisma.JsonValue;
  }
) {
  const lastLog = await tx.activityLog.findFirst({
    where: { organizationId: data.organizationId },
    orderBy: { createdAt: "desc" },
    select: { hash: true },
  });

  const previousHash = lastLog?.hash ?? "0".repeat(64);
  const requestId = crypto.randomUUID();

  const hashPayload = JSON.stringify({
    previousHash,
    requestId,
    actorId: data.actorId,
    action: data.action,
    targetId: data.resourceId ?? null,
    timestamp: Date.now(),
  });

  const hash = crypto.createHash("sha256").update(hashPayload).digest("hex");

  return tx.activityLog.create({
    data: {
      organizationId: data.organizationId,
      branchId: data.branchId ?? undefined,
      actorId: data.actorId,
      actorType: ActorType.USER,
      action: data.action,
      targetType: RESOURCES.PROCUREMENT,
      targetId: data.resourceId ?? undefined,
      severity: data.severity ?? Severity.LOW,
      description: data.description ?? null,
      metadata: data.metadata ?? Prisma.JsonNull,
      requestId,
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
      role: { in: ["ADMIN", "MANAGER", "AUDITOR"] },
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
  branchId: z.string().optional(),
  vendorId: z.string().min(1, "Vendor is required"),
  purchaseOrderId: z.string().optional().nullable(),
  receivedAt: z.string().optional().nullable().transform(v => v ? new Date(v) : new Date()),
  notes: z.string().optional().nullable(),
  items: z.array(z.object({
    poItemId: z.string().optional().nullable(),
    productId: z.string(),
    quantityAccepted: z.number().min(0),
    quantityRejected: z.number().min(0).default(0),
    unitCost: z.any().optional(), 
    batchNumber: z.string().optional(),
    expiryDate: z.string().optional().nullable().pipe(z.coerce.date().optional()),
  })).min(1, "At least one item is required"),
});

/* -------------------------
  GET Handler
------------------------- */

export async function GET(req: NextRequest) {
  try {
    const user = await requireSession();
    const url = new URL(req.url);
    const params = url.searchParams;

    // Meta handling (Vendors/Products for GRN form)
    const meta = params.get("meta");
    const branchIdParam = params.get("branchId") || undefined;

    if (meta) {
      if (meta === "vendors") {
        const vendors = await prisma.vendor.findMany({
          where: { organizationId: user.organizationId, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        });
        return NextResponse.json({ items: vendors });
      }

      if (meta === "products" && branchIdParam) {
        const branchProducts = await prisma.branchProduct.findMany({
          where: { organizationId: user.organizationId, branchId: branchIdParam, deletedAt: null },
          select: {
            product: { select: { id: true, name: true, sku: true, costPrice: true } },
            costPrice: true,
          },
          orderBy: { product: { name: "asc" } },
        });
        const items = branchProducts.map((bp) => ({
          id: bp.product.id,
          name: bp.product.name,
          sku: bp.product.sku,
          costPrice: bp.costPrice ?? bp.product.costPrice ?? 0,
        }));
        return NextResponse.json({ items });
      }
      return NextResponse.json({ error: "Invalid meta request" }, { status: 400 });
    }

    // Normal List Parsing
    const type = (params.get("type") || "grn") as "grn" | "ledger";
    const page = parseIntSafe(params.get("page"), 1);
    const limit = Math.min(parseIntSafe(params.get("limit"), DEFAULT_LIMIT), MAX_LIMIT);
    const search = params.get("search")?.trim() || null;
    const status = params.get("status") || null;
    const from = parseDateSafe(params.get("from"));
    const to = parseDateSafe(params.get("to"));
    const exportAll = params.get("export") === "true";

    const take = exportAll ? EXPORT_LIMIT : limit;
    const skip = exportAll ? 0 : (page - 1) * take;

    const where: any = { organizationId: user.organizationId };
    if (branchIdParam) where.branchId = branchIdParam;

    /* Ledger Logic */
    if (type === "ledger") {
      const authAudit = authorize({
        role: user.role,
        isOrgOwner: user.isOrgOwner,
        action: PermissionAction.READ,
        resource: RESOURCES.AUDIT,
      });
      if (!authAudit.allowed) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

      where.action = { contains: "GRN" };
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

      if (exportAll) {
        const header = ["Date", "Action", "Actor", "Role", "Description", "Severity", "RequestID"];
        const rows = items.map(it => [
          it.createdAt.toISOString(),
          it.action,
          it.personnel?.name || "System",
          it.personnel?.role || "SYSTEM",
          it.description || "",
          it.severity,
          it.requestId || ""
        ]);
        const csv = [header, ...rows].map(r => r.map(csvEscape).join(",")).join("\n");
        return new NextResponse(csv, { headers: { "Content-Type": "text/csv" } });
      }

      return NextResponse.json({ items, total, page });
    }

    /* GRN List Logic */
    const authGRN = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.READ,
      resource: RESOURCES.PROCUREMENT,
    });
    if (!authGRN.allowed) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    if (search) {
      where.OR = [
        { grnNumber: { contains: search, mode: "insensitive" } },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
      ];
    }
    if (status && status !== "all") where.status = status;
    if (from || to) {
      where.receivedAt = {};
      if (from) where.receivedAt.gte = from;
      if (to) where.receivedAt.lte = to;
    }

    const [items, total] = await Promise.all([
      prisma.goodsReceiptNote.findMany({
        where,
        include: {
          vendor: { select: { name: true } },
          purchaseOrder: { select: { poNumber: true } },
          receivedBy: { select: { name: true } },
          items: true,
        },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.goodsReceiptNote.count({ where }),
    ]);

    if (exportAll) {
      const header = ["GRN Number", "Date", "Vendor", "PO Ref", "Status", "Total Items"];
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

    return NextResponse.json({ items, total, page });
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error("GRN_GET_ERROR", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/* -------------------------
  POST Handler
------------------------- */

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.CREATE,
      resource: RESOURCES.PROCUREMENT,
    });
    if (!auth.allowed) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const body = await req.json();
    const result = createGRNSchema.safeParse(body);
    if (!result.success) return NextResponse.json({ error: result.error.format() }, { status: 400 });

    const { items, ...data } = result.data;
    const orgId = user.organizationId;
    const validItems = items.filter(i => i.quantityAccepted > 0);

    if (validItems.length === 0) {
      return NextResponse.json({ error: "At least one item with quantity > 0 is required." }, { status: 400 });
    }

    const newGRN = await prisma.$transaction(async (tx) => {
      let activeBranchId = data.branchId || user.branchId;
      let totalValueReceived = 0;

      // 1. Validate PO if applicable
      let po = null;
      if (data.purchaseOrderId) {
        po = await tx.purchaseOrder.findUnique({
          where: { id: data.purchaseOrderId, organizationId: orgId },
          include: { items: true }
        });
        if (!po) throw new Error("Referenced Purchase Order not found.");
        if (po.status === POStatus.CANCELLED || po.status === POStatus.FULFILLED) {
          throw new Error(`Cannot receive against PO in ${po.status} state.`);
        }
        activeBranchId = po.branchId; 
      }

      if (!activeBranchId) throw new Error("Branch context missing.");

      // 2. Map Branch Products
      const productIds = validItems.map(i => i.productId);
      const branchProducts = await tx.branchProduct.findMany({
        where: { branchId: activeBranchId, productId: { in: productIds } },
        select: { id: true, productId: true, costPrice: true }
      });
      const bpMap = new Map(branchProducts.map(bp => [bp.productId, bp]));

      // 3. Prepare Items & Calculate Overage
      const grnItemsData = validItems.map(item => {
        const bp = bpMap.get(item.productId);
        if (!bp) throw new Error(`Product ${item.productId} not found in target branch.`);
        
        let unitCost = item.unitCost ? Number(item.unitCost) : Number(bp.costPrice || 0);

        if (po && item.poItemId) {
          const poItem = po.items.find(pi => pi.id === item.poItemId);
          if (poItem) {
            if ((poItem.quantityReceived + item.quantityAccepted) > poItem.quantityOrdered) {
              throw new Error(`Overage detected for product ID ${item.productId}.`);
            }
            unitCost = Number(poItem.unitCost);
          }
        }

        totalValueReceived += (item.quantityAccepted * unitCost);

        return {
          productId: item.productId,
          branchProductId: bp.id,
          poItemId: item.poItemId || undefined,
          quantityAccepted: item.quantityAccepted,
          quantityRejected: item.quantityRejected,
          unitCost: new Prisma.Decimal(unitCost),
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
        };
      });

      // 4. Create GRN
      const grnNumber = `GRN-${Date.now().toString().slice(-8)}`;
      const grn = await tx.goodsReceiptNote.create({
        data: {
          organizationId: orgId,
          branchId: activeBranchId,
          vendorId: data.vendorId,
          purchaseOrderId: data.purchaseOrderId,
          grnNumber,
          status: GRNStatus.PENDING, 
          receivedAt: data.receivedAt,
          receivedById: user.id,
          notes: data.notes,
          items: { create: grnItemsData }
        }
      });

      // 5. Update PO Item Tracking
      if (po) {
        for (const item of validItems) {
          if (item.poItemId) {
            await tx.purchaseOrderItem.update({
              where: { id: item.poItemId },
              data: { quantityReceived: { increment: item.quantityAccepted } }
            });
          }
        }

        const updatedPoItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
        const isFullyReceived = updatedPoItems.every(i => i.quantityReceived >= i.quantityOrdered);
        const newPoStatus = isFullyReceived ? POStatus.FULFILLED : POStatus.PARTIALLY_RECEIVED;
        
        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: { status: newPoStatus }
        });
      }

      // 6. Audit Logging
      const log = await createAuditLog(tx, {
        organizationId: orgId,
        branchId: activeBranchId,
        actorId: user.id,
        action: "CREATE_GRN",
        resourceId: grn.id,
        severity: Severity.MEDIUM,
        description: `Logged Goods Receipt ${grnNumber}. Total Value: ₦${totalValueReceived.toLocaleString()}`,
        metadata: { poId: data.purchaseOrderId, totalValue: totalValueReceived }
      });

      // 7. Notification
      await notifyManagement(
        tx,
        orgId,
        activeBranchId,
        "Goods Receipt Recorded",
        `GRN ${grnNumber} created by ${user.name || 'Staff'}. Awaiting stock verification.`,
        log.id
      );

      return grn;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 15000,
    });

    return NextResponse.json({ success: true, id: newGRN.id, grnNumber: newGRN.grnNumber }, { status: 201 });
  } catch (error: any) {
    console.error("GRN_POST_ERROR", error);
    return NextResponse.json({ error: error.message || "Failed to process GRN" }, { status: 400 });
  }
}