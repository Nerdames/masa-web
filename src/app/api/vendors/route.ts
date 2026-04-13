// File: app/api/vendors/route.ts
// Production-ready vendors API aligned to MASA schema and RBAC/forensic requirements.
// Fixed: activityLog.create usage (schema expects targetId/targetType, not resource/resourceId)

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import {
  SaleStatus,
  Prisma,
  PermissionAction,
  Severity,
  ActorType,
  Role,
  NotificationType,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import dayjs from "dayjs";
import { authorize, RESOURCES } from "@/core/lib/permission";
import crypto from "crypto";

/* -------------------- Helpers -------------------- */

const toNumber = (value: number | Decimal | null | undefined): number =>
  value instanceof Decimal ? value.toNumber() : Number(value ?? 0);

const parseDate = (value: string | null): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
};

const sanitizePageLimit = (page: number, limit: number) => {
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 10;
  return { safePage, safeLimit };
};

/**
 * Validates session and RBAC permissions
 */
async function validateAccess(action: PermissionAction) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.organizationId) {
    throw { status: 401, message: "Unauthorized: Missing organization context" };
  }

  const { allowed, reason } = authorize({
    role: session.user.role,
    isOrgOwner: session.user.isOrgOwner,
    action,
    resource: RESOURCES.VENDOR,
  });

  if (!allowed) throw { status: 403, message: reason || "Forbidden: Insufficient Permissions" };
  return session.user;
}

/**
 * Create cryptographic chained audit log inside provided transaction.
 * NOTE: Prisma activityLog model uses targetId/targetType (not resource/resourceId).
 */
async function createAuditLog(
  tx: Prisma.TransactionClient,
  data: {
    organizationId: string;
    branchId: string | null;
    actorId: string;
    action: string;
    resourceId: string | null; // will map to targetId
    severity: Severity;
    description: string;
    metadata?: Prisma.JsonValue;
  }
) {
  // Read last log for this organization to chain hashes
  const lastLog = await tx.activityLog.findFirst({
    where: { organizationId: data.organizationId },
    orderBy: { createdAt: "desc" },
    select: { hash: true, requestId: true },
  });

  const previousHash = lastLog?.hash ?? "0".repeat(64);
  const requestId = crypto.randomUUID();

  // Build canonical payload for hashing (stringified deterministic)
  const hashPayload = JSON.stringify({
    previousHash,
    requestId,
    actorId: data.actorId,
    action: data.action,
    targetId: data.resourceId ?? null,
    timestamp: Date.now(),
  });

  const hash = crypto.createHash("sha256").update(hashPayload).digest("hex");

  // IMPORTANT: use targetId and targetType fields (schema-aligned)
  const created = await tx.activityLog.create({
    data: {
      organizationId: data.organizationId,
      branchId: data.branchId ?? undefined,
      actorId: data.actorId,
      actorType: ActorType.USER,
      action: data.action,
      // map resource -> targetType, resourceId -> targetId
      targetType: RESOURCES.VENDOR,
      targetId: data.resourceId ?? undefined,
      severity: data.severity,
      description: data.description,
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
      OR: [{ role: Role.ADMIN }, { role: Role.MANAGER }, { isOrgOwner: true }],
    },
    select: { id: true },
  });

  if (targets.length === 0) return;

  await tx.notification.create({
    data: {
      organizationId,
      branchId: branchId ?? undefined,
      type: NotificationType.INFO,
      title,
      message,
      activityLogId,
      recipients: {
        create: targets.map((t) => ({ personnelId: t.id })),
      },
    },
  });
}

/**
 * Detach vendor reference from branchProducts (safe detach).
 * Returns number of updated branchProducts.
 */
async function detachVendorFromBranchProducts(tx: Prisma.TransactionClient, vendorId: string) {
  const updated = await tx.branchProduct.updateMany({
    where: { vendorId, deletedAt: null },
    data: { vendorId: null },
  });
  return updated.count;
}

/* -------------------- Handlers -------------------- */

/**
 * GET /api/vendors
 * - Supports pagination, search, sort, date filters (for sales metrics)
 * - Returns vendors with computed metrics and _count fields
 */
export async function GET(req: NextRequest) {
  try {
    const user = await validateAccess(PermissionAction.READ);
    const { organizationId, branchId, isOrgOwner } = user;

    const params = req.nextUrl.searchParams;
    const { safePage: page, safeLimit: limit } = sanitizePageLimit(
      Number(params.get("page")),
      Number(params.get("limit"))
    );

    const search = params.get("search")?.trim() ?? "";
    const sort = (params.get("sort") || "performance").toLowerCase();
    const fromDate = parseDate(params.get("from"));
    const toDate = parseDate(params.get("to"));

    const dateFilter: Prisma.SaleWhereInput = fromDate && toDate
      ? { createdAt: { gte: fromDate, lte: toDate } }
      : {};

    // Vendor base filter
    const vendorWhere: Prisma.VendorWhereInput = {
      organizationId,
      deletedAt: null,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    };

    // Count and fetch vendors with required includes
    const [totalVendors, vendorsRaw] = await Promise.all([
      prisma.vendor.count({ where: vendorWhere }),
      prisma.vendor.findMany({
        where: vendorWhere,
        include: {
          _count: { select: { purchaseOrders: true, grns: true } },
          branchProducts: {
            where: {
              deletedAt: null,
              ...(isOrgOwner ? {} : { branchId: branchId ?? undefined }),
            },
            include: {
              // Sales relation on BranchProduct (BranchProduct.sales)
              sales: {
                where: {
                  status: SaleStatus.COMPLETED,
                  deletedAt: null,
                  ...(isOrgOwner ? {} : { branchId: branchId ?? undefined }),
                  ...dateFilter,
                },
                select: { quantity: true, total: true, createdAt: true, branchId: true },
              },
            },
          },
        },
      }),
    ]);

    // Compute metrics per vendor
    const vendors = vendorsRaw.map((vendor) => {
      let totalRevenue = 0;
      let totalQuantitySold = 0;
      let totalStockValue = 0;
      const salesDates: number[] = [];

      vendor.branchProducts.forEach((bp) => {
        const sellingPrice = bp.sellingPrice ?? 0;
        totalStockValue += Number(bp.stock ?? 0) * toNumber(sellingPrice);
        bp.sales.forEach((sale) => {
          totalRevenue += toNumber(sale.total);
          totalQuantitySold += Number(sale.quantity);
          salesDates.push(new Date(sale.createdAt).getTime());
        });
      });

      let salesVelocity = 0;
      if (salesDates.length > 0) {
        const minDate = Math.min(...salesDates);
        const maxDate = Math.max(...salesDates);
        const daysActive = Math.max(dayjs(maxDate).diff(dayjs(minDate), "day") + 1, 1);
        salesVelocity = totalQuantitySold / daysActive;
      }

      return {
        ...vendor,
        productsSupplied: vendor.branchProducts.length,
        totalRevenue,
        totalQuantitySold,
        totalStockValue,
        salesVelocity,
        performanceScore: 0,
      };
    });

    // Normalize scoring
    const maxRevenue = Math.max(...vendors.map((v) => v.totalRevenue), 1);
    const maxVelocity = Math.max(...vendors.map((v) => v.salesVelocity), 1);
    const maxDiversity = Math.max(...vendors.map((v) => v.productsSupplied), 1);

    vendors.forEach((v) => {
      const revenueScore = (v.totalRevenue / maxRevenue) * 40;
      const velocityScore = (v.salesVelocity / maxVelocity) * 30;
      const diversityScore = (v.productsSupplied / maxDiversity) * 20;
      const stockScore = v.totalStockValue > 0 ? 10 : 0;
      v.performanceScore = Math.round(revenueScore + velocityScore + diversityScore + stockScore);
    });

    // Sorting
    const sortedVendors = [...vendors].sort((a, b) => {
      if (sort === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === "highest revenue") return b.totalRevenue - a.totalRevenue;
      return b.performanceScore - a.performanceScore;
    });

    return NextResponse.json({
      summary: {
        totalVendors,
        totalRevenue: vendors.reduce((sum, v) => sum + v.totalRevenue, 0),
      },
      leaders: {
        topVendor: vendors.length ? vendors.reduce((p, c) => (p.totalRevenue > c.totalRevenue ? p : c)) : null,
        fastestVendor: vendors.length ? vendors.reduce((p, c) => (p.salesVelocity > c.salesVelocity ? p : c)) : null,
        bestOverall: vendors.length ? vendors.reduce((p, c) => (p.performanceScore > c.performanceScore ? p : c)) : null,
      },
      vendors: sortedVendors.slice((page - 1) * limit, page * limit),
      pagination: { total: totalVendors, page, limit, totalPages: Math.ceil(totalVendors / limit) },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Load failed" }, { status: err.status || 500 });
  }
}

/**
 * POST /api/vendors
 * - Create vendor
 * - Audit log + notify management
 */
export async function POST(req: NextRequest) {
  try {
    const user = await validateAccess(PermissionAction.CREATE);
    const body = await req.json();

    if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const existing = await prisma.vendor.findFirst({
      where: { organizationId: user.organizationId, name: body.name.trim(), deletedAt: null },
    });
    if (existing) return NextResponse.json({ error: "Vendor already exists" }, { status: 409 });

    const result = await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.create({
        data: {
          organizationId: user.organizationId,
          name: body.name.trim(),
          email: body.email?.trim() || null,
          phone: body.phone?.trim() || null,
          address: body.address?.trim() || null,
          createdById: user.id,
          updatedById: user.id,
        },
      });

      const log = await createAuditLog(tx, {
        organizationId: user.organizationId,
        branchId: user.branchId ?? null,
        actorId: user.id,
        action: "CREATE_VENDOR",
        resourceId: vendor.id,
        severity: Severity.MEDIUM,
        description: `Registered new vendor node: ${vendor.name}`,
        metadata: { vendorName: vendor.name },
      });

      await notifyManagement(
        tx,
        user.organizationId,
        "New Vendor Registered",
        `Vendor ${vendor.name} added by ${user.name || user.id}.`,
        log.id,
        user.branchId ?? null
      );

      return vendor;
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

/**
 * PATCH /api/vendors
 * - Update vendor profile
 * - Audit log + notify management
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await validateAccess(PermissionAction.UPDATE);
    const body = await req.json();

    if (!body.id) return NextResponse.json({ error: "Vendor ID is required" }, { status: 400 });

    const vendor = await prisma.vendor.findFirst({
      where: { id: body.id, organizationId: user.organizationId, deletedAt: null },
    });

    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.vendor.update({
        where: { id: body.id },
        data: {
          name: body.name?.trim() ?? vendor.name,
          email: body.email?.trim() ?? vendor.email,
          phone: body.phone?.trim() ?? vendor.phone,
          address: body.address?.trim() ?? vendor.address,
          updatedById: user.id,
        },
      });

      const log = await createAuditLog(tx, {
        organizationId: user.organizationId,
        branchId: user.branchId ?? null,
        actorId: user.id,
        action: "UPDATE_VENDOR",
        resourceId: updated.id,
        severity: Severity.LOW,
        description: `Updated profile details for vendor: ${updated.name}`,
        metadata: { changes: { name: body.name, email: body.email, phone: body.phone } },
      });

      await notifyManagement(
        tx,
        user.organizationId,
        "Vendor Profile Updated",
        `Vendor ${updated.name} modified.`,
        log.id,
        user.branchId ?? null
      );

      return updated;
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

/**
 * DELETE /api/vendors?id=...&force=true
 *
 * Behavior:
 * - Default: Prevent archive if vendor has active branchProducts (safe guard).
 * - If query param force=true and user has DELETE permission, the API will:
 * 1) Detach vendorId from active branchProducts (set vendorId = null) inside same transaction,
 * 2) Soft-delete (deletedAt) the vendor,
 * 3) Create audit log and notify management.
 *
 * Rationale:
 * - Schema links branchProducts -> vendor (nullable). Detaching is safer than cascading deletes.
 * - This preserves inventory records while allowing archival of vendor nodes when required.
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await validateAccess(PermissionAction.DELETE);
    const id = req.nextUrl.searchParams.get("id");
    const force = (req.nextUrl.searchParams.get("force") || "false").toLowerCase() === "true";

    if (!id) return NextResponse.json({ error: "Vendor ID required" }, { status: 400 });

    const vendor = await prisma.vendor.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      include: { branchProducts: { where: { deletedAt: null } } },
    });

    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    // If there are active branchProducts and force is not provided, block with clear guidance.
    if (vendor.branchProducts.length > 0 && !force) {
      return NextResponse.json(
        {
          error:
            "Cannot archive vendor with active products. Use ?force=true to detach vendor from products and archive (this will set vendorId=null on related branchProducts).",
        },
        { status: 400 }
      );
    }

    // Proceed with transaction: optionally detach branchProducts, then archive vendor, create log, notify.
    await prisma.$transaction(async (tx) => {
      let detachedCount = 0;
      if (vendor.branchProducts.length > 0 && force) {
        detachedCount = await detachVendorFromBranchProducts(tx, id);
      }

      await tx.vendor.update({
        where: { id },
        data: { deletedAt: new Date(), updatedById: user.id },
      });

      const log = await createAuditLog(tx, {
        organizationId: user.organizationId,
        branchId: user.branchId ?? null,
        actorId: user.id,
        action: "ARCHIVE_VENDOR",
        resourceId: id,
        severity: Severity.HIGH,
        description: `Archived vendor node: ${vendor.name}${detachedCount ? ` (detached ${detachedCount} products)` : ""}`,
        metadata: { archivedBy: user.id, detachedProducts: detachedCount },
      });

      await notifyManagement(
        tx,
        user.organizationId,
        "Vendor Archived",
        `Vendor ${vendor.name} archived.${detachedCount ? ` ${detachedCount} product links detached.` : ""}`,
        log.id,
        user.branchId ?? null
      );
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
