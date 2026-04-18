
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { PermissionAction, Prisma, Severity } from "@prisma/client";
import { authorize, RESOURCES } from "@/core/lib/permission";

/* -------------------------------------------------------------------------- */
/* CONFIG & TYPES                                                             */
/* -------------------------------------------------------------------------- */

const EXPORT_LIMIT = 5000;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 1000;

type UiBranchProduct = {
  id: string;
  stock: number;
  stockVersion: number;
  reorderLevel: number;
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

/* -------------------------------------------------------------------------- */
/* UTILS & SECURITY                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Validates session and resource-level permissions.
 */
async function validateAccess(action: PermissionAction, requireExport = false) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw { status: 401, message: "Unauthorized: No session found" };
  }

  const user = session.user as any;

  // Check base READ/action permission
  const auth = authorize({
    role: user.role,
    isOrgOwner: user.isOrgOwner,
    action: action,
    resource: RESOURCES.INVENTORY,
  });

  if (!auth.allowed) {
    throw { status: 403, message: auth.reason || "Forbidden: Insufficient Permissions" };
  }

  // Check EXPORT permission if requested
  if (requireExport) {
    const exportAuth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.EXPORT,
      resource: RESOURCES.INVENTORY,
    });
    if (!exportAuth.allowed) {
      throw { status: 403, message: "Forbidden: Export permission required for bulk fetch" };
    }
  }

  return user;
}

const parseDate = (value: string | null) => {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
};

/* -------------------------------------------------------------------------- */
/* GET HANDLER                                                               */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId");

    if (!branchId) {
      return NextResponse.json({ error: "branchId is required" }, { status: 400 });
    }

    const isExport = searchParams.get("export") === "true";
    const user = await validateAccess(PermissionAction.READ, isExport);

    const type = (searchParams.get("type") || "inventory").toLowerCase();
    const meta = searchParams.get("meta");

    /* --- 1. META ENDPOINTS (Optimization for UI Selects) --- */
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

    /* --- 2. PAGINATION & SHARED FILTERS --- */
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limitInput = parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10);
    const limit = isExport ? EXPORT_LIMIT : Math.min(limitInput, MAX_LIMIT);
    
    const search = searchParams.get("search")?.trim() || "";
    const from = parseDate(searchParams.get("from"));
    const to = parseDate(searchParams.get("to"));

    /* --- 3. LEDGER FEED (Forensic Activity Logs) --- */
    if (type === "ledger") {
      const where: Prisma.ActivityLogWhereInput = {
        organizationId: user.organizationId,
        branchId: branchId,
      };

      if (from || to) {
        where.createdAt = { gte: from, lte: to };
      }

      if (search) {
        where.OR = [
          { action: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { requestId: { contains: search, mode: "insensitive" } },
        ];
      }

      const [logs, total] = await Promise.all([
        prisma.activityLog.findMany({
          where,
          include: { personnel: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: isExport ? 0 : (page - 1) * limit,
        }),
        prisma.activityLog.count({ where }),
      ]);

      const items = logs.map((l) => ({
        id: l.id,
        action: l.action,
        description: l.description,
        severity: l.severity,
        createdAt: l.createdAt.toISOString(),
        actorName: l.personnel?.name || "System",
        actorRole: l.actorRole,
        requestId: l.requestId,
        hash: l.hash, // Forensic hash
        previousHash: l.previousHash, // Cryptographic chain link
        critical: l.critical,
        metadata: l.metadata,
      }));

      return NextResponse.json({ items, total, page, limit });
    }

    /* --- 4. INVENTORY FEED (Branch Products) --- */
    const vendorId = searchParams.get("vendorId") || undefined;
    const categoryId = searchParams.get("categoryId") || undefined;
    const status = (searchParams.get("status") || "all").toLowerCase();
    const sort = (searchParams.get("sort") || "name").toLowerCase();

    const where: Prisma.BranchProductWhereInput = {
      organizationId: user.organizationId,
      branchId: branchId,
      deletedAt: null,
      product: { deletedAt: null }, // Ensure parent product isn't deleted
    };

    if (vendorId) where.vendorId = vendorId;
    if (categoryId) where.product = { ...where.product, categoryId };
    
    if (search) {
      where.OR = [
        { product: { name: { contains: search, mode: "insensitive" } } },
        { product: { sku: { contains: search, mode: "insensitive" } } },
        { product: { barcode: { contains: search, mode: "insensitive" } } },
      ];
    }

    // Rough DB filtering for performance
    if (status === "critical") {
      where.stock = { lte: prisma.branchProduct.fields.safetyStock }; 
      // Note: Prisma 5.x allows field references, otherwise we use JS filtering below
    }

    // Sorting Logic
    let orderBy: Prisma.BranchProductOrderByWithRelationInput = { product: { name: "asc" } };
    if (sort === "stock_asc") orderBy = { stock: "asc" };
    if (sort === "stock_desc") orderBy = { stock: "desc" };
    if (sort === "valuation_desc") orderBy = { costPrice: "desc" };
    if (sort === "last_sold") orderBy = { lastSoldAt: { sort: "desc", nulls: "last" } };

    const [rawItems, total] = await Promise.all([
      prisma.branchProduct.findMany({
        where,
        include: {
          vendor: { select: { id: true, name: true } },
          product: {
            include: {
              category: { select: { id: true, name: true } },
              uom: { select: { id: true, name: true, abbreviation: true } },
            },
          },
        },
        orderBy,
        take: limit,
        skip: isExport ? 0 : (page - 1) * limit,
      }),
      prisma.branchProduct.count({ where }),
    ]);

    // Map and apply precise Business Logic status filtering
    let mapped: UiBranchProduct[] = rawItems.map((bp) => ({
      id: bp.id,
      stock: bp.stock,
      stockVersion: bp.stockVersion,
      reorderLevel: bp.reorderLevel ?? 0,
      safetyStock: bp.safetyStock ?? 0,
      sellingPrice: Number(bp.sellingPrice),
      costPrice: Number(bp.costPrice),
      vendor: bp.vendor,
      product: {
        id: bp.product.id,
        name: bp.product.name,
        sku: bp.product.sku,
        barcode: bp.product.barcode,
        category: bp.product.category,
        uom: bp.product.uom,
      },
      lastSoldAt: bp.lastSoldAt?.toISOString() || null,
      lastRestockedAt: bp.lastRestockedAt?.toISOString() || null,
    }));

    // Multi-layered status filtering (Business Logic)
    if (status === "critical") {
      mapped = mapped.filter((i) => i.stock <= i.safetyStock);
    } else if (status === "reorder") {
      mapped = mapped.filter((i) => i.stock > i.safetyStock && i.stock <= i.reorderLevel);
    } else if (status === "optimal") {
      mapped = mapped.filter((i) => i.stock > i.reorderLevel);
    }

    return NextResponse.json({
      items: mapped,
      total,
      page,
      limit,
    });
  } catch (error: any) {
    console.error("[FORTRESS_GET_ERROR]", error);
    const status = error.status || 500;
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status }
    );
  }
}