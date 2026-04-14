// app/api/inventory/fortress/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { PermissionAction } from "@prisma/client";
import { authorize, RESOURCES } from "@/core/lib/permission";

type UiBranchProduct = {
  id: string;
  stock: number;
  stockVersion: number;
  reorderLevel: number | null;
  safetyStock: number;
  sellingPrice: number;
  costPrice: number;
  vendor: { id: string; name: string } | null;
  product: {
    id: string;
    name: string;
    sku: string;
    barcode?: string | null;
    category?: { id: string; name: string } | null;
    uom?: { id: string; name: string; abbreviation: string } | null;
  };
  lastSoldAt?: string | null;
  lastRestockedAt?: string | null;
};

const EXPORT_LIMIT = 10000;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 1000; // hard cap for normal queries

async function validateReadAccess(requireExportPermission = false) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    throw { status: 401, message: "Unauthorized: Missing organization context" };
  }
  const { allowed, reason } = authorize({
    role: session.user.role,
    isOrgOwner: session.user.isOrgOwner,
    action: PermissionAction.READ,
    resource: RESOURCES.INVENTORY || "INVENTORY",
  });
  if (!allowed) throw { status: 403, message: reason || "Forbidden: Insufficient Permissions" };

  if (requireExportPermission) {
    const { allowed: exportAllowed, reason: exportReason } = authorize({
      role: session.user.role,
      isOrgOwner: session.user.isOrgOwner,
      action: PermissionAction.EXPORT,
      resource: RESOURCES.INVENTORY || "INVENTORY",
    });
    if (!exportAllowed) throw { status: 403, message: exportReason || "Forbidden: Export not allowed" };
  }

  return session.user;
}

const parseDate = (value: string | null) => {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
};

const sanitizePageLimit = (rawPage: number, rawLimit: number, exportAll = false) => {
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  let limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : DEFAULT_LIMIT;
  if (exportAll) limit = Math.min(EXPORT_LIMIT, limit || EXPORT_LIMIT);
  limit = Math.min(limit, MAX_LIMIT);
  return { page, limit };
};

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const branchId = params.get("branchId");
    if (!branchId) return NextResponse.json({ error: "branchId is required" }, { status: 400 });

    const exportAll = (params.get("export") || "false").toLowerCase() === "true";
    // If exporting all, require EXPORT permission
    const user = await validateReadAccess(exportAll);

    const meta = params.get("meta"); // vendors | categories
    const type = (params.get("type") || "inventory").toLowerCase();

    // Meta endpoints
    if (meta === "vendors") {
      const vendors = await prisma.vendor.findMany({
        where: { organizationId: user.organizationId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ items: vendors });
    }
    if (meta === "categories") {
      const categories = await prisma.category.findMany({
        where: { organizationId: user.organizationId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ items: categories });
    }

    // Pagination
    const rawPage = Number(params.get("page") ?? 1);
    const rawLimit = Number(params.get("limit") ?? DEFAULT_LIMIT);
    const { page, limit } = sanitizePageLimit(rawPage, rawLimit, exportAll);

    // Filters
    const search = params.get("search")?.trim() ?? "";
    const vendorId = params.get("vendorId") || undefined;
    const categoryId = params.get("categoryId") || undefined;
    const status = (params.get("status") || "all").toLowerCase();
    const sort = (params.get("sort") || "name").toLowerCase();
    const from = parseDate(params.get("from"));
    const to = parseDate(params.get("to"));

    // Ledger feed (forensic)
    if (type === "ledger") {
      const where: any = {
        organizationId: user.organizationId,
        branchId,
      };
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = from;
        if (to) where.createdAt.lte = to;
      }
      if (search) {
        where.OR = [
          { action: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ];
      }

      const total = await prisma.activityLog.count({ where });
      const logs = await prisma.activityLog.findMany({
        where,
        include: { personnel: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: exportAll ? Math.min(EXPORT_LIMIT, 2000) : limit,
        skip: exportAll ? 0 : (page - 1) * limit,
      });

      const items = logs.map((l) => ({
        id: l.id,
        action: l.action,
        description: l.description ?? "System action executed.",
        severity: l.severity,
        createdAt: l.createdAt.toISOString(),
        actorId: l.actorId,
        actorType: l.actorType,
        personnelName: l.personnel?.name ?? "System",
        personnelRole: l.actorRole ?? null,
        metadata: l.metadata ?? {},
        requestId: l.requestId ?? null,
      }));

      return NextResponse.json({ items, total, page, limit });
    }

    // Inventory feed
    // Build base where clause
    const where: any = {
      organizationId: user.organizationId,
      branchId,
      deletedAt: null,
    };

    if (vendorId) where.vendorId = vendorId;
    if (categoryId) {
      // Prisma cannot filter nested relation by scalar directly in the same where without relation path
      where.product = { categoryId };
    }
    if (search) {
      where.AND = [
        {
          OR: [
            { product: { sku: { contains: search, mode: "insensitive" } } },
            { product: { name: { contains: search, mode: "insensitive" } } },
          ],
        },
      ];
    }

    // Server-side status filtering: replicate UI logic where possible
    // Because Prisma doesn't support column-to-column comparisons easily, we fetch candidate rows and apply precise status filtering in JS when necessary.
    // For performance, apply coarse DB filters for obvious cases (e.g., stock <= 0 for critical).
    if (status === "critical") {
      // coarse filter: stock <= 0 (still return items with safetyStock <= stock on client)
      where.AND = [...(where.AND || []), { stock: { lte: 0 } }];
    } else if (status === "reorder") {
      // best-effort: stock <= reorderLevel is not expressible as column-to-column in Prisma; skip DB filter and apply client-side
      // leave where unchanged
    } else if (status === "optimal") {
      // leave to client-side
    }

    // Sorting
    let orderBy: any = { product: { name: "asc" } };
    if (sort === "name") orderBy = { product: { name: "asc" } };
    else if (sort === "stock_asc") orderBy = { stock: "asc" };
    else if (sort === "stock_desc") orderBy = { stock: "desc" };
    else if (sort === "valuation_desc") orderBy = { costPrice: "desc" };
    else if (sort === "last_sold") orderBy = { lastSoldAt: "desc" };

    // Count total
    const total = await prisma.branchProduct.count({ where });

    // Fetch items
    const itemsRaw = await prisma.branchProduct.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            category: { select: { id: true, name: true } },
            uom: { select: { id: true, name: true, abbreviation: true } },
          },
        },
        vendor: { select: { id: true, name: true } },
      },
      orderBy,
      take: exportAll ? Math.min(EXPORT_LIMIT, EXPORT_LIMIT) : limit,
      skip: exportAll ? 0 : (page - 1) * limit,
    });

    // Map and apply precise status filtering client-side if requested
    let mapped: UiBranchProduct[] = itemsRaw.map((bp) => ({
      id: bp.id,
      stock: bp.stock,
      stockVersion: bp.stockVersion,
      reorderLevel: bp.reorderLevel ?? 0,
      safetyStock: bp.safetyStock ?? 0,
      sellingPrice: bp.sellingPrice ? Number(bp.sellingPrice) : 0,
      costPrice: bp.costPrice ? Number(bp.costPrice) : 0,
      vendor: bp.vendor ? { id: bp.vendor.id, name: bp.vendor.name } : null,
      product: {
        id: bp.product.id,
        name: bp.product.name,
        sku: bp.product.sku,
        barcode: bp.product.barcode,
        category: bp.product.category ? { id: bp.product.category.id, name: bp.product.category.name } : null,
        uom: bp.product.uom ? { id: bp.product.uom.id, name: bp.product.uom.name, abbreviation: bp.product.uom.abbreviation } : null,
      },
      lastSoldAt: bp.lastSoldAt ? bp.lastSoldAt.toISOString() : null,
      lastRestockedAt: bp.lastRestockedAt ? bp.lastRestockedAt.toISOString() : null,
    }));

    // Precise status filtering (replicate client logic)
    if (status === "critical") {
      mapped = mapped.filter((i) => i.stock <= (i.safetyStock ?? 0));
    } else if (status === "reorder") {
      mapped = mapped.filter((i) => i.stock > (i.safetyStock ?? 0) && i.stock <= (i.reorderLevel ?? 0));
    } else if (status === "optimal") {
      mapped = mapped.filter((i) => i.stock > (i.reorderLevel ?? 0));
    }

    return NextResponse.json({
      items: mapped,
      total,
      page,
      limit,
    });
  } catch (err: any) {
    console.error("[FORTRESS_ROUTE_ERR]", { err });
    const status = err?.status || 500;
    const message = err?.message || "Failed to load fortress data";
    return NextResponse.json({ error: message }, { status });
  }
}
