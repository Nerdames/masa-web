/**
 * app/api/vendors/route.ts
 * PRODUCTION-GRADE VENDORS API
 * Aligned with MASA Schema, strict RBAC permissions, and Forensic Audit V2.6.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { createAuditLog } from "@/core/lib/audit";
import { authorize } from "@/core/lib/permission";
import {
  SaleStatus,
  Prisma,
  PermissionAction,
  Severity,
  Role,
  NotificationType,
  Resource,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import dayjs from "dayjs";

/* -------------------------------------------------------------------------- */
/* REQUEST HELPERS                                                            */
/* -------------------------------------------------------------------------- */

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

const extractClientInfo = (req: NextRequest) => {
  const forwardedFor = req.headers.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1",
    deviceInfo: req.headers.get("user-agent") || "system",
  };
};

/**
 * Validates session, extracts explicit JWT permissions, and delegates to the RBAC engine.
 */
async function validateAccess(action: PermissionAction) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.organizationId) {
    throw { status: 401, message: "Unauthorized: Missing organization context." };
  }

  const { allowed, reason } = authorize({
    role: session.user.role,
    isOrgOwner: session.user.isOrgOwner,
    action,
    resources: Resource.VENDOR,
    userPermissions: session.user.permissions || [],
  });

  if (!allowed) {
    throw { status: 403, message: reason || "Forbidden: Insufficient Permissions." };
  }
  return session.user;
}

/**
 * Notify management targets inside the same database transaction.
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
 * Detach vendor reference from active branchProducts (safe guard utility).
 */
async function detachVendorFromBranchProducts(tx: Prisma.TransactionClient, vendorId: string) {
  const updated = await tx.branchProduct.updateMany({
    where: { vendorId, deletedAt: null },
    data: { vendorId: null },
  });
  return updated.count;
}

/* -------------------------------------------------------------------------- */
/* API ROUTE HANDLERS                                                         */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/vendors
 * Retrieves paginated vendors with computed performance metrics and order history.
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

    const vendorWhere: Prisma.VendorWhereInput = {
      organizationId,
      deletedAt: null,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    };

    const [totalVendors, vendorsRaw] = await Promise.all([
      prisma.vendor.count({ where: vendorWhere }),
      prisma.vendor.findMany({
        where: vendorWhere,
        include: {
          _count: { select: { purchaseOrders: true, grns: true } },
          purchaseOrders: {
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
              id: true,
              poNumber: true,
              status: true,
              totalAmount: true,
              createdAt: true,
            },
          },
          branchProducts: {
            where: {
              deletedAt: null,
              ...(isOrgOwner ? {} : { branchId: branchId ?? undefined }),
            },
            include: {
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
 * Create a new vendor and log securely to the Forensic Audit Engine.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await validateAccess(PermissionAction.CREATE);
    const body = await req.json();
    const { ipAddress, deviceInfo } = extractClientInfo(req);

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const existing = await prisma.vendor.findFirst({
      where: { organizationId: user.organizationId, name: body.name.trim(), deletedAt: null },
    });

    if (existing) {
      return NextResponse.json({ error: "Vendor already exists" }, { status: 409 });
    }

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
        action: "CREATE_VENDOR",
        resource: Resource.VENDOR,
        resourceId: vendor.id,
        organizationId: user.organizationId,
        branchId: user.branchId ?? null,
        actorId: user.id,
        actorRole: user.role,
        severity: Severity.MEDIUM,
        description: `Registered new vendor node: ${vendor.name}`,
        changes: { to: vendor },
        ipAddress,
        deviceInfo,
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
 * Update vendor details, compute differences, and log to the Forensic Audit Engine.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await validateAccess(PermissionAction.UPDATE);
    const body = await req.json();
    const { ipAddress, deviceInfo } = extractClientInfo(req);

    if (!body.id) {
      return NextResponse.json({ error: "Vendor ID is required" }, { status: 400 });
    }

    const vendorBefore = await prisma.vendor.findFirst({
      where: { id: body.id, organizationId: user.organizationId, deletedAt: null },
    });

    if (!vendorBefore) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const vendorAfter = await tx.vendor.update({
        where: { id: body.id },
        data: {
          name: body.name?.trim() ?? vendorBefore.name,
          email: body.email?.trim() ?? vendorBefore.email,
          phone: body.phone?.trim() ?? vendorBefore.phone,
          address: body.address?.trim() ?? vendorBefore.address,
          updatedById: user.id,
        },
      });

      const log = await createAuditLog(tx, {
        action: "UPDATE_VENDOR",
        resource: Resource.VENDOR,
        resourceId: vendorAfter.id,
        organizationId: user.organizationId,
        branchId: user.branchId ?? null,
        actorId: user.id,
        actorRole: user.role,
        severity: Severity.LOW,
        description: `Updated profile details for vendor: ${vendorAfter.name}`,
        changes: { from: vendorBefore, to: vendorAfter },
        ipAddress,
        deviceInfo,
      });

      await notifyManagement(
        tx,
        user.organizationId,
        "Vendor Profile Updated",
        `Vendor ${vendorAfter.name} modified.`,
        log.id,
        user.branchId ?? null
      );

      return vendorAfter;
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

/**
 * DELETE /api/vendors?id=...&force=true
 *
 * Soft-delete process:
 * 1) Blocks archive if vendor has active mapped products, unless 'force=true'.
 * 2) Detaches branchProducts references if forced.
 * 3) Marks the vendor as deleted and captures the final state in the audit log.
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await validateAccess(PermissionAction.DELETE);
    const id = req.nextUrl.searchParams.get("id");
    const force = (req.nextUrl.searchParams.get("force") || "false").toLowerCase() === "true";
    const { ipAddress, deviceInfo } = extractClientInfo(req);

    if (!id) {
      return NextResponse.json({ error: "Vendor ID required" }, { status: 400 });
    }

    const vendor = await prisma.vendor.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      include: { branchProducts: { where: { deletedAt: null } } },
    });

    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    if (vendor.branchProducts.length > 0 && !force) {
      return NextResponse.json(
        {
          error:
            "Cannot archive vendor with active products. Use ?force=true to detach vendor from products and archive (this will set vendorId=null on related branchProducts).",
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      let detachedCount = 0;
      if (vendor.branchProducts.length > 0 && force) {
        detachedCount = await detachVendorFromBranchProducts(tx, id);
      }

      const archivedVendor = await tx.vendor.update({
        where: { id },
        data: { deletedAt: new Date(), updatedById: user.id },
      });

      const log = await createAuditLog(tx, {
        action: "ARCHIVE_VENDOR",
        resource: Resource.VENDOR,
        resourceId: id,
        organizationId: user.organizationId,
        branchId: user.branchId ?? null,
        actorId: user.id,
        actorRole: user.role,
        severity: Severity.HIGH, // Implicitly escalates due to soft-delete
        description: `Archived vendor node: ${vendor.name}${
          detachedCount ? ` (detached ${detachedCount} products)` : ""
        }`,
        changes: { from: vendor, to: archivedVendor },
        ipAddress,
        deviceInfo,
        metadata: { detachedProducts: detachedCount },
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