// app/api/inventory/purchase-orders/route.ts
// Combined GET + POST production-ready route aligned to MASA schema, RBAC, pagination, CSV export,
// cryptographic audit logging and management notifications.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import {
  PermissionAction,
  ActorType,
  Severity,
  Prisma,
} from "@prisma/client";
import crypto from "crypto";
import { authorize, RESOURCES } from "@/core/lib/permission";

/* -------------------------
  Helpers
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
  return session.user as any;
}

/* -------------------------
  Audit log + notify helpers
------------------------- */

/**
 * Create cryptographic chained audit log inside provided transaction.
 * Maps resourceId -> targetId and resource -> targetType.
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
    select: { hash: true, requestId: true },
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

  const created = await tx.activityLog.create({
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
    },
  });

  return created;
}

/**
 * Notify management recipients inside same transaction.
 */
async function notifyManagement(
  tx: Prisma.TransactionClient,
  organizationId: string,
  title: string,
  message: string,
  activityLogId: string,
  branchId?: string | null
) {
  const targets = await tx.authorizedPersonnel.findMany({
    where: {
      organizationId,
      deletedAt: null,
      disabled: false,
      OR: [{ role: "ADMIN" }, { role: "MANAGER" }, { isOrgOwner: true }],
    },
    select: { id: true },
  });

  if (targets.length === 0) return;

  await tx.notification.create({
    data: {
      organizationId,
      branchId: branchId ?? undefined,
      type: "INFO",
      title,
      message,
      activityLogId,
      recipients: {
        create: targets.map((t) => ({ personnelId: t.id })),
      },
    },
  });
}

/* -------------------------
  Permission helper for export
------------------------- */

async function canExport(user: any) {
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
  } catch (e) {
    console.warn("Permission lookup failed, falling back to role allowlist", e);
  }

  const allowedRoles = ["ADMIN", "MANAGER", "AUDITOR", "DEV"];
  return allowedRoles.includes(user.role);
}

/* -------------------------
  Utility: generate PO number
------------------------- */
function generatePONumber(branchId?: string | null) {
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  const branchPart = branchId ? branchId.slice(0, 4).toUpperCase() : "ORG";
  return `PO-${branchPart}-${suffix}`;
}

/* -------------------------
  GET handler
------------------------- */

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const params = url.searchParams;

    // Meta endpoints (vendors, products)
    const meta = params.get("meta");
    const branchIdParam = params.get("branchId") || undefined;

    if (meta) {
      const user = await requireSession();
      const orgId = user.organizationId;
      if (!orgId) return NextResponse.json({ error: "Missing organization context" }, { status: 400 });

      if (meta === "vendors") {
        // Return vendors for organization (branch not required)
        const vendors = await prisma.vendor.findMany({
          where: { organizationId: orgId, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        });
        return NextResponse.json({ items: vendors });
      }

      if (meta === "products") {
        // If branchId provided, prefer branch-specific pricing/cost (BranchProduct),
        // otherwise return master product list.
        if (branchIdParam) {
          const branchProducts = await prisma.branchProduct.findMany({
            where: { organizationId: orgId, branchId: branchIdParam, deletedAt: null },
            select: {
              product: { select: { id: true, name: true, sku: true, costPrice: true } },
              costPrice: true,
            },
            orderBy: { product: { name: "asc" } as any },
          });

          const items = branchProducts.map((bp) => ({
            id: bp.product.id,
            name: bp.product.name,
            sku: bp.product.sku,
            costPrice: bp.costPrice ?? bp.product.costPrice ?? null,
          }));

          return NextResponse.json({ items });
        }

        const products = await prisma.product.findMany({
          where: { organizationId: orgId, deletedAt: null },
          select: { id: true, name: true, sku: true, costPrice: true },
          orderBy: { name: "asc" },
        });
        return NextResponse.json({ items: products });
      }

      return NextResponse.json({ error: "Unknown meta type" }, { status: 400 });
    }

    const user = await requireSession();
    const orgId = user.organizationId;
    if (!orgId) return NextResponse.json({ error: "Missing organization context" }, { status: 400 });

    // Parse query params
    const type = (params.get("type") || "po") as "po" | "ledger";
    const page = parseIntSafe(params.get("page"), 1);
    const limitRaw = parseIntSafe(params.get("limit"), DEFAULT_LIMIT);
    const limit = Math.min(limitRaw, MAX_LIMIT);
    const search = params.get("search")?.trim() || null;
    const status = params.get("status") || null;
    const from = parseDateSafe(params.get("from"));
    const to = parseDateSafe(params.get("to"));
    const exportAll = params.get("export") === "true";
    const take = exportAll ? Math.min(EXPORT_LIMIT, EXPORT_LIMIT) : limit;
    const skip = exportAll ? 0 : (page - 1) * take;

    if (exportAll) {
      const allowed = await canExport(user);
      if (!allowed) return NextResponse.json({ error: "ACCESS_DENIED: You are not authorized to export data." }, { status: 403 });
    }

    const branchId = branchIdParam ?? undefined;

    /* Ledger branch (activity logs) */
    if (type === "ledger") {
      const auth = authorize({
        role: user.role,
        isOrgOwner: user.isOrgOwner,
        action: PermissionAction.READ,
        resource: RESOURCES.AUDIT,
      });
      if (!auth.allowed) return NextResponse.json({ error: "ACCESS_DENIED: You are not authorized to view ledger." }, { status: 403 });

      const where: any = { organizationId: orgId };
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
          include: { actor: { select: { id: true, name: true, role: true } } as any },
        }),
        prisma.activityLog.count({ where }),
      ]);

      if (params.get("export") === "true") {
        // CSV header aligned with frontend expectations (actorRole)
        const header = ["id", "action", "description", "severity", "actorRole", "createdAt", "requestId"];
        const rows = items.map((it) => [
          it.id,
          it.action,
          it.description || "",
          it.severity || "",
          (it as any).actor?.role || "",
          it.createdAt?.toISOString?.() || "",
          it.requestId || "",
        ]);
        const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
        return new NextResponse(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="po_ledger_${new Date().toISOString()}.csv"`,
          },
        });
      }

      // Map actor info for frontend (use actorRole field expected by client)
      const mapped = items.map((it) => ({
        id: it.id,
        action: it.action,
        description: it.description,
        severity: it.severity,
        createdAt: it.createdAt,
        requestId: it.requestId,
        actorRole: (it as any).actor?.role ?? null,
        actorName: (it as any).actor?.name ?? null,
      }));

      return NextResponse.json({ items: mapped, total, page, limit: take });
    }

    /* Purchase Orders branch */
    const authPO = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.READ,
      resource: RESOURCES.PROCUREMENT,
    });
    if (!authPO.allowed) return NextResponse.json({ error: "ACCESS_DENIED: You are not authorized to view purchase orders." }, { status: 403 });

    const where: any = { organizationId: orgId };
    if (branchId) where.branchId = branchId;
    if (search) {
      where.OR = [
        { poNumber: { contains: search, mode: "insensitive" } },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
      ];
    }
    if (status && status !== "all") where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    const [items, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          vendor: { select: { id: true, name: true, email: true } },
          items: {
            select: {
              id: true,
              product: { select: { id: true, name: true, sku: true } },
              quantityOrdered: true,
              unitCost: true,
              totalCost: true,
            },
          },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    if (params.get("export") === "true") {
      const header = ["id", "poNumber", "vendor", "status", "totalAmount", "expectedDate", "createdAt", "createdBy", "itemsCount"];
      const rows = items.map((it) => [
        it.id,
        it.poNumber,
        it.vendor?.name || "",
        it.status,
        String(it.totalAmount ?? ""),
        it.expectedDate ? new Date(it.expectedDate).toISOString() : "",
        it.createdAt?.toISOString?.() || "",
        it.createdBy?.name || "",
        String((it.items || []).length),
      ]);
      const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="purchase_orders_${new Date().toISOString()}.csv"`,
        },
      });
    }

    return NextResponse.json({ items, total, page, limit: take });
  } catch (err: any) {
    if (err instanceof NextResponse) throw err;
    console.error("Purchase Orders API Error:", err);
    const message = err?.message || "Internal server error";
    return NextResponse.json({ error: message }, { status: err?.status || 500 });
  }
}

/* -------------------------
  POST handler: create Purchase Order
------------------------- */

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    const orgId = user.organizationId;
    if (!orgId) return NextResponse.json({ error: "Missing organization context" }, { status: 400 });

    // RBAC: require CREATE on procurement
    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.CREATE,
      resource: RESOURCES.PROCUREMENT,
    });
    if (!auth.allowed) return NextResponse.json({ error: "ACCESS_DENIED: You are not authorized to create purchase orders." }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const {
      vendorId,
      branchId: bodyBranchId,
      expectedDate,
      notes,
      items: rawItems,
      poNumber: providedPoNumber,
      currency = "NGN",
    } = body;

    if (!vendorId) return NextResponse.json({ error: "vendorId is required" }, { status: 400 });
    if (!Array.isArray(rawItems) || rawItems.length === 0) return NextResponse.json({ error: "At least one line item is required" }, { status: 400 });

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, organizationId: orgId, deletedAt: null } });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const itemsValidated: {
      productId: string;
      quantityOrdered: number;
      unitCost: number;
      totalCost: number;
    }[] = [];

    for (const [idx, it] of rawItems.entries()) {
      const productId = it.productId;
      const qty = Number(it.quantityOrdered ?? it.quantity ?? 0);
      const unitCost = Number(it.unitCost ?? it.unit_price ?? 0);

      if (!productId) return NextResponse.json({ error: `productId is required for line ${idx + 1}` }, { status: 400 });
      if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: `Invalid quantity for line ${idx + 1}` }, { status: 400 });
      if (!Number.isFinite(unitCost) || unitCost < 0) return NextResponse.json({ error: `Invalid unitCost for line ${idx + 1}` }, { status: 400 });

      const product = await prisma.product.findFirst({ where: { id: productId, organizationId: orgId, deletedAt: null } });
      if (!product) return NextResponse.json({ error: `Product not found for line ${idx + 1}` }, { status: 404 });

      const totalCost = Number((qty * unitCost).toFixed(2));
      itemsValidated.push({ productId, quantityOrdered: qty, unitCost, totalCost });
    }

    const totalAmount = itemsValidated.reduce((s, it) => s + it.totalCost, 0);

    const branchId = bodyBranchId ?? user.branchId ?? null;
    if (!branchId) {
      return NextResponse.json({ error: "branchId is required (either in request or your session)" }, { status: 400 });
    }

    const poNumber = providedPoNumber?.trim() || generatePONumber(branchId);

    const created = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          organizationId: orgId,
          branchId,
          vendorId,
          poNumber,
          status: "ISSUED",
          totalAmount: new Prisma.Decimal(totalAmount),
          currency,
          expectedDate: expectedDate ? new Date(expectedDate) : null,
          notes: notes ?? null,
          createdById: user.id,
          updatedById: user.id,
          items: {
            create: itemsValidated.map((it) => ({
              productId: it.productId,
              quantityOrdered: it.quantityOrdered,
              unitCost: new Prisma.Decimal(it.unitCost),
              totalCost: new Prisma.Decimal(it.totalCost),
            })),
          },
        },
        include: {
          vendor: { select: { id: true, name: true, email: true } },
          items: {
            include: { product: { select: { id: true, name: true, sku: true } } },
          },
          createdBy: { select: { id: true, name: true } },
        },
      });

      const log = await createAuditLog(tx, {
        organizationId: orgId,
        branchId,
        actorId: user.id,
        action: "CREATE_PO",
        resourceId: po.id,
        severity: Severity.MEDIUM,
        description: `Created Purchase Order ${po.poNumber} for vendor ${po.vendor?.name || vendor.name}`,
        metadata: {
          poNumber: po.poNumber,
          vendorId,
          totalAmount,
          itemsCount: po.items.length,
        } as Prisma.JsonValue,
      });

      await notifyManagement(
        tx,
        orgId,
        "New Purchase Order Created",
        `PO ${po.poNumber} created for vendor ${po.vendor?.name || vendor.name} by ${user.name || user.id}.`,
        log.id,
        branchId
      );

      return po;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    if (err instanceof NextResponse) throw err;
    console.error("Create PO Error:", err);
    const status = err?.status || 500;
    const message = err?.message || "Failed to create purchase order";
    return NextResponse.json({ error: message }, { status });
  }
}
