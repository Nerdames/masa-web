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
  NotificationType,
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

/**
 * Standardizes user object from session for internal use
 */
interface AuthenticatedUser {
  id: string;
  organizationId: string;
  branchId: string | null;
  role: Role;
  isOrgOwner: boolean;
}

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
    metadata?: any;
    before?: any;
    after?: any;
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
      metadata: data.metadata ? (data.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      before: data.before ? (data.before as Prisma.InputJsonValue) : Prisma.JsonNull,
      after: data.after ? (data.after as Prisma.InputJsonValue) : Prisma.JsonNull,
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

async function canExport(user: AuthenticatedUser): Promise<boolean> {
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
  GET /api/inventory/procurement
------------------------- */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as AuthenticatedUser;

    const { searchParams } = new URL(req.url);
    const meta = searchParams.get("meta");
    const orgId = user.organizationId;
    
    const isGlobalViewer = [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role) || user.isOrgOwner;
    const branchIdParam = searchParams.get("branchId");
    const branchId = isGlobalViewer ? branchIdParam : (user.branchId || branchIdParam);

    // --- META DROPDOWNS (Optimized for performance) ---
    if (meta) {
      if (meta === "vendors") {
        const vendors = await prisma.vendor.findMany({
          where: { organizationId: orgId, deletedAt: null },
          select: { id: true, name: true, email: true, phone: true },
          orderBy: { name: "asc" },
        });
        return NextResponse.json({ items: vendors });
      }

      if (meta === "products") {
        const q = searchParams.get("q") || "";
        const products = await prisma.product.findMany({
          where: { 
            organizationId: orgId, 
            deletedAt: null,
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
              { barcode: { contains: q, mode: "insensitive" } }
            ]
          },
          select: { 
            id: true, 
            name: true, 
            sku: true, 
            barcode: true,
            baseCostPrice: true,
            uom: { select: { id: true, name: true, abbreviation: true } }
          },
          orderBy: { name: "asc" },
          take: 100, // Safety limit for dropdowns
        });

        return NextResponse.json({ 
          items: products.map(p => ({
            ...p,
            productId: p.id,
            costPrice: p.baseCostPrice,
            uomName: p.uom?.name,
            uomAbbreviation: p.uom?.abbreviation
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
      return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });
    }

    const take = exportAll ? EXPORT_LIMIT : limit;
    const skip = (page - 1) * take;

    /* --- LEDGER VIEW --- */
    if (type === "ledger") {
      const auth = authorize({
        role: user.role,
        isOrgOwner: user.isOrgOwner,
        action: PermissionAction.READ,
        resource: RESOURCES.AUDIT,
      });
      if (!auth.allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

      const where: Prisma.ActivityLogWhereInput = { 
        organizationId: orgId, 
        targetType: "PURCHASE_ORDER" 
      };
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

    const where: Prisma.PurchaseOrderWhereInput = { 
      organizationId: orgId,
      deletedAt: null 
    };
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
          vendor: { select: { id: true, name: true, email: true, phone: true } },
          items: {
            include: {
              product: { 
                select: { 
                  name: true, 
                  sku: true,
                  uom: { select: { abbreviation: true } }
                } 
              },
            },
          },
          createdBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    if (exportAll) {
      const header = ["PO Number", "Date", "Vendor", "Status", "Total", "Currency", "Created By"];
      const rows = items.map((it) => [
        it.poNumber,
        it.createdAt.toISOString(),
        it.vendor?.name || "",
        it.status,
        it.totalAmount.toString(),
        it.currency,
        it.createdBy?.name || "System"
      ]);
      const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="procurement_${Date.now()}.csv"`,
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
    const user = session.user as AuthenticatedUser;
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
    if (!auth.allowed) return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });

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

    if (!vendorId) return NextResponse.json({ error: "Vendor is required." }, { status: 400 });
    if (!Array.isArray(rawItems) || rawItems.length === 0) return NextResponse.json({ error: "Line items required." }, { status: 400 });

    const isGlobalCreator = [Role.ADMIN, Role.MANAGER, Role.DEV].includes(user.role) || user.isOrgOwner;
    const branchId = isGlobalCreator ? (bodyBranchId ?? user.branchId) : user.branchId;
    if (!branchId) return NextResponse.json({ error: "Branch resolution failed." }, { status: 400 });

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, organizationId: orgId, deletedAt: null } });
    if (!vendor) return NextResponse.json({ error: "Vendor not active." }, { status: 404 });

    // Bulk fetch products for performance and fallback evaluation
    const productIds = rawItems.map((it: any) => it.productId || it.id).filter(Boolean);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, organizationId: orgId, deletedAt: null },
      select: { id: true, name: true, baseCostPrice: true }
    });
    const productMap = new Map(products.map(p => [p.id, p]));

    const itemsValidated = [];
    for (const [idx, it] of rawItems.entries()) {
      const productId = it.productId || it.id;
      const qty = Number(it.quantityOrdered ?? 0);

      if (!productId || qty <= 0) {
        return NextResponse.json({ error: `Invalid item data on line ${idx + 1}` }, { status: 400 });
      }

      const product = productMap.get(productId);
      if (!product) return NextResponse.json({ error: `Product not found: ${productId}` }, { status: 404 });

      // Cost Fallback Logic: If missing, empty, or 0, fallback to baseCostPrice
      let unitCostRaw = Number(it.unitCost);
      if (!it.unitCost || isNaN(unitCostRaw) || unitCostRaw <= 0) {
        unitCostRaw = Number(product.baseCostPrice ?? 0);
      }

      // Security measure: Prevent 0 cost POs from entering sales/reports if no base cost exists
      if (unitCostRaw <= 0) {
        return NextResponse.json({ 
          error: `Cost cannot be zero for '${product.name}' (line ${idx + 1}). Please provide a valid unit cost as no base cost was found.` 
        }, { status: 400 });
      }

      const unitCost = new Decimal(unitCostRaw);
      itemsValidated.push({ 
        productId, 
        quantityOrdered: qty, 
        unitCost, 
        totalCost: unitCost.mul(qty) 
      });
    }

    const totalAmount = itemsValidated.reduce((sum, it) => sum.add(it.totalCost), new Decimal(0));

    const created = await prisma.$transaction(async (tx) => {
      // Uniqueness check for PO Number
      const poNumber = providedPoNumber?.trim() || generatePONumber(branchId);
      const existing = await tx.purchaseOrder.findFirst({ where: { organizationId: orgId, poNumber } });
      const finalPoNumber = existing ? `${poNumber}-DUP` : poNumber;

      const po = await tx.purchaseOrder.create({
        data: {
          organizationId: orgId,
          branchId,
          vendorId,
          poNumber: finalPoNumber,
          status: POStatus.ISSUED, 
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
          vendor: { select: { name: true } },
          items: { include: { product: { select: { name: true, sku: true } } } },
        },
      });

      const log = await createAuditLog(tx, {
        organizationId: orgId,
        branchId,
        actorId: user.id,
        actorRole: user.role,
        action: "CREATE_PURCHASE_ORDER",
        resourceId: po.id,
        severity: Severity.MEDIUM,
        description: `Issued PO ${po.poNumber} to ${po.vendor?.name}`,
        requestId,
        ipAddress,
        deviceInfo,
        after: { poId: po.id, total: totalAmount.toString(), vendor: po.vendor?.name },
      });

      await notifyManagement(
        tx,
        orgId,
        branchId,
        "Procurement Issued",
        `PO ${po.poNumber} created for ${po.vendor?.name}. Total: ${currency} ${totalAmount.toFixed(2)}`,
        log.id
      );

      return po;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 15000 
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    console.error("[PO_POST_ERROR]", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

/* -------------------------
  PATCH /api/inventory/procurement
  (Security Logic for Rejecting/Approving POs)
------------------------- */

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as AuthenticatedUser;
    const orgId = user.organizationId;

    const requestId = crypto.randomUUID();
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.UPDATE,
      resource: RESOURCES.PROCUREMENT,
    });
    if (!auth.allowed) return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const { poId, status, notes } = body;
    if (!poId || !status) return NextResponse.json({ error: "PO ID and Status are required." }, { status: 400 });

    const validStatuses = Object.values(POStatus);
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status provided." }, { status: 400 });
    }

    const existingPo = await prisma.purchaseOrder.findFirst({
      where: { id: poId, organizationId: orgId, deletedAt: null },
      include: { vendor: { select: { name: true } } }
    });

    if (!existingPo) return NextResponse.json({ error: "Purchase order not found." }, { status: 404 });

    // Prevent altering terminal states without elevated privileges
    if ((existingPo.status === POStatus.REJECTED || existingPo.status === POStatus.FULFILLED) && 
        ![Role.ADMIN, Role.MANAGER].includes(user.role) && !user.isOrgOwner) {
      return NextResponse.json({ error: "Insufficient permissions to modify a closed purchase order." }, { status: 403 });
    }

    const updatedPo = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: status as POStatus,
          notes: notes ? `${existingPo.notes || ''}\n[Status Update]: ${notes}`.trim() : existingPo.notes,
        },
      });

      // Security logic for REJECTED status
      const isRejected = status === POStatus.REJECTED;
      const severityLevel = isRejected ? Severity.HIGH : Severity.MEDIUM;

      const log = await createAuditLog(tx, {
        organizationId: orgId,
        branchId: po.branchId,
        actorId: user.id,
        actorRole: user.role,
        action: `UPDATE_PO_${status}`,
        resourceId: po.id,
        severity: severityLevel,
        description: `Marked PO ${po.poNumber} as ${status}${notes ? ` - Reason: ${notes}` : ''}`,
        requestId,
        ipAddress,
        deviceInfo,
        before: { status: existingPo.status },
        after: { status: po.status },
      });

      if (isRejected || status === POStatus.APPROVED) {
        await notifyManagement(
          tx,
          orgId,
          po.branchId,
          `Procurement ${isRejected ? 'Rejected 🚨' : 'Updated'}`,
          `PO ${po.poNumber} for ${existingPo.vendor?.name} was marked as ${status} by ${user.role}.`,
          log.id
        );
      }

      return po;
    });

    return NextResponse.json(updatedPo, { status: 200 });
  } catch (err: any) {
    console.error("[PO_PATCH_ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}