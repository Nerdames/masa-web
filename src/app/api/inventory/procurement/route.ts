import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import {
  PermissionAction,
  ActorType,
  Severity,
  Prisma,
  POStatus,
  Role,
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

function generatePONumber(branchId?: string | null): string {
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  const branchPart = branchId ? branchId.slice(0, 4).toUpperCase() : "ORG";
  return `PO-${branchPart}-${suffix}`;
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
      targetType: "PURCHASE_ORDER",
      targetId: data.resourceId,
      severity: data.severity ?? Severity.MEDIUM,
      description: data.description,
      metadata: data.metadata ?? Prisma.JsonNull,
      before: data.before ?? Prisma.JsonNull,
      after: data.after ?? Prisma.JsonNull,
      requestId: data.requestId,
      ipAddress: data.ipAddress,
      deviceInfo: data.deviceInfo,
      previousHash,
      hash,
      critical: data.severity === Severity.HIGH || data.severity === Severity.CRITICAL,
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
  } catch (e) {
    // Fallback to role evaluation
  }
  return [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role);
}

/* -------------------------
  GET /api/inventory/procurement
------------------------- */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;

    const { searchParams } = new URL(req.url);
    const meta = searchParams.get("meta");
    const orgId = user.organizationId;
    
    // Strict Branch Isolation Context
    const isGlobalViewer = [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role) || user.isOrgOwner;
    const branchIdParam = searchParams.get("branchId");
    const branchId = isGlobalViewer ? branchIdParam : (user.branchId || branchIdParam);

    // --- META DROPDOWNS ---
    if (meta) {
      if (meta === "vendors") {
        const vendors = await prisma.vendor.findMany({
          where: { organizationId: orgId, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        });
        return NextResponse.json({ items: vendors });
      }

      if (meta === "products") {
        // ALIGNED: Fetch from GLOBAL Catalog for Purchase Orders to allow cross-branch purchasing
        const products = await prisma.product.findMany({
          where: { organizationId: orgId, deletedAt: null },
          select: { id: true, name: true, sku: true, baseCostPrice: true },
          orderBy: { name: "asc" },
        });

        return NextResponse.json({ 
          items: products.map(p => ({
            ...p,
            productId: p.id, // Map for UI consistency
            costPrice: p.baseCostPrice 
          })) 
        });
      }
      return NextResponse.json({ error: "Unknown meta type" }, { status: 400 });
    }

    // --- MAIN QUERY ---
    const type = searchParams.get("type") || "po";
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

    /* --- LEDGER / AUDIT VIEW --- */
    if (type === "ledger") {
      const auth = authorize({
        role: user.role,
        isOrgOwner: user.isOrgOwner,
        action: PermissionAction.READ,
        resource: RESOURCES.AUDIT,
      });
      if (!auth.allowed) return NextResponse.json({ error: "Unauthorized for Ledger" }, { status: 403 });

      const where: Prisma.ActivityLogWhereInput = { organizationId: orgId, targetType: "PURCHASE_ORDER" };
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

    /* --- PO LIST VIEW --- */
    const authPO = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.READ,
      resource: RESOURCES.PROCUREMENT,
    });
    if (!authPO.allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const where: Prisma.PurchaseOrderWhereInput = { organizationId: orgId };
    if (branchId) where.branchId = branchId;
    if (search) {
      where.OR = [
        { poNumber: { contains: search, mode: "insensitive" } },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
      ];
    }
    if (status && status !== "all") where.status = status as POStatus;
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
              quantityReceived: true,
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

    if (exportAll) {
      const header = ["id", "poNumber", "vendor", "status", "totalAmount", "expectedDate", "createdAt", "createdBy", "itemsCount"];
      const rows = items.map((it) => [
        it.id, it.poNumber, it.vendor?.name || "", it.status,
        String(it.totalAmount),
        it.expectedDate ? it.expectedDate.toISOString() : "",
        it.createdAt.toISOString(),
        it.createdBy?.name || "",
        String(it.items.length),
      ]);
      const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="purchase_orders_${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({ items, total, page, limit: take });
  } catch (err: any) {
    console.error("[PO_GET_ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------------
  POST /api/inventory/procurement
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
      vendorId,
      branchId: bodyBranchId,
      expectedDate,
      notes,
      items: rawItems,
      poNumber: providedPoNumber,
      currency = "NGN",
    } = body;

    // Strict parameter checking
    if (!vendorId) return NextResponse.json({ error: "Vendor context is required." }, { status: 400 });
    if (!Array.isArray(rawItems) || rawItems.length === 0) return NextResponse.json({ error: "Purchase Order must contain line items." }, { status: 400 });

    // Validate Branch Context
    const isGlobalCreator = [Role.ADMIN, Role.MANAGER, Role.DEV].includes(user.role) || user.isOrgOwner;
    const branchId = isGlobalCreator ? (bodyBranchId ?? user.branchId) : user.branchId;
    if (!branchId) return NextResponse.json({ error: "Target branch resolution failed." }, { status: 400 });

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, organizationId: orgId, deletedAt: null } });
    if (!vendor) return NextResponse.json({ error: "Vendor not found or suspended." }, { status: 404 });

    const itemsValidated: {
      productId: string;
      quantityOrdered: number;
      unitCost: Decimal;
      totalCost: Decimal;
    }[] = [];

    // Payload Sanitization and Global Catalog Validation
    for (const [idx, it] of rawItems.entries()) {
      const productId = it.productId || it.id;
      const qty = Number(it.quantityOrdered ?? it.quantity ?? 0);
      const unitCostRaw = Number(it.unitCost ?? it.unit_price ?? 0);

      if (!productId) return NextResponse.json({ error: `Product reference missing on line ${idx + 1}` }, { status: 400 });
      if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: `Invalid quantity on line ${idx + 1}` }, { status: 400 });
      if (!Number.isFinite(unitCostRaw) || unitCostRaw < 0) return NextResponse.json({ error: `Invalid unit cost on line ${idx + 1}` }, { status: 400 });

      // Ensure product exists globally
      const product = await prisma.product.findFirst({ 
        where: { id: productId, organizationId: orgId, deletedAt: null } 
      });
      
      if (!product) return NextResponse.json({ error: `Product not found in Global Catalog (Line ${idx + 1})` }, { status: 404 });

      // Use Decimal for exact financial math
      const unitCost = new Decimal(unitCostRaw);
      const totalCost = unitCost.mul(qty);
      
      itemsValidated.push({ productId, quantityOrdered: qty, unitCost, totalCost });
    }

    const totalAmount = itemsValidated.reduce((sum, it) => sum.add(it.totalCost), new Decimal(0));
    const poNumber = providedPoNumber?.trim() || generatePONumber(branchId);

    // Atomic Execution with Serializable Isolation
    const created = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          organizationId: orgId,
          branchId,
          vendorId,
          poNumber,
          status: POStatus.ISSUED, // ALIGNED with strict Schema Enum
          totalAmount,
          currency,
          expectedDate: expectedDate ? new Date(expectedDate) : null,
          notes: notes ?? null,
          createdById: user.id,
          items: {
            create: itemsValidated.map((it) => ({
              productId: it.productId,
              quantityOrdered: it.quantityOrdered,
              unitCost: it.unitCost,
              totalCost: it.totalCost,
            })),
          },
        },
        include: {
          vendor: { select: { id: true, name: true } },
          items: true,
        },
      });

      const log = await createAuditLog(tx, {
        organizationId: orgId,
        branchId,
        actorId: user.id,
        actorRole: user.role as Role,
        action: "CREATE_PURCHASE_ORDER",
        resourceId: po.id,
        severity: Severity.MEDIUM,
        description: `Authorized Purchase Order ${po.poNumber} (Vendor: ${po.vendor?.name})`,
        requestId,
        ipAddress,
        deviceInfo,
        after: po as unknown as Prisma.JsonValue,
      });

      await notifyManagement(
        tx,
        orgId,
        branchId,
        "Procurement Issued",
        `Purchase Order ${po.poNumber} has been successfully generated for vendor ${po.vendor?.name}.`,
        log.id
      );

      return po;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000, 
      timeout: 10000 
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    console.error("[PO_POST_ERROR]", err);
    return NextResponse.json({ error: err?.message || "Failed to commit purchase order securely." }, { status: 500 });
  }
}