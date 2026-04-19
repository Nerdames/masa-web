import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { PermissionAction, Prisma, Severity, ActorType } from "@prisma/client";
import { authorize, RESOURCES } from "@/core/lib/permission";

/* -------------------------------------------------------------------------- */
/* CONFIGURATION & TYPE DEFINITIONS                                           */
/* -------------------------------------------------------------------------- */

const EXPORT_LIMIT = 10000;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 500;

export type UiBranchProduct = {
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
/* SECURITY & AUTHORIZATION MIDDLEWARE                                        */
/* -------------------------------------------------------------------------- */

async function validateAccess(action: PermissionAction, requireExport = false) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    throw { status: 401, message: "Forensic Auth: Valid session required for fortress access." };
  }

  const user = session.user as any;

  const auth = authorize({
    role: user.role,
    isOrgOwner: user.isOrgOwner,
    action,
    resource: RESOURCES.INVENTORY,
  });

  if (!auth.allowed) {
    throw { status: 403, message: auth.reason || "Forbidden: Your role restricts access to this module." };
  }

  if (requireExport) {
    const expAuth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.EXPORT,
      resource: RESOURCES.INVENTORY,
    });
    
    if (!expAuth.allowed) {
      throw { status: 403, message: "Export Restricted: Missing forensic audit permission." };
    }
  }

  return user;
}

/* -------------------------------------------------------------------------- */
/* [GET] DATA RETRIEVAL: INVENTORY GRID & METADATA                            */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId");
    const meta = searchParams.get("meta");

    if (!branchId) {
      return NextResponse.json({ error: "Missing required parameter: branchId" }, { status: 400 });
    }

    const isExport = searchParams.get("export") === "true";
    const user = await validateAccess(PermissionAction.READ, isExport);

    if (meta === "vendors") {
      const vendors = await prisma.vendor.findMany({
        where: { organizationId: user.organizationId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      });
      return NextResponse.json({ items: vendors });
    }

    if (meta === "categories") {
      const categories = await prisma.category.findMany({
        where: { organizationId: user.organizationId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      });
      return NextResponse.json({ items: categories });
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limitInput = parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10);
    const limit = isExport ? EXPORT_LIMIT : Math.min(limitInput, MAX_LIMIT);
    
    const search = searchParams.get("search")?.trim() || "";
    const vendorId = searchParams.get("vendorId");
    const categoryId = searchParams.get("categoryId");
    const status = (searchParams.get("status") || "all").toLowerCase();
    const sort = (searchParams.get("sort") || "name").toLowerCase();

    const where: Prisma.BranchProductWhereInput = {
      organizationId: user.organizationId,
      branchId,
      deletedAt: null,
      product: { deletedAt: null }
    };

    if (vendorId && vendorId !== "all") where.vendorId = vendorId;
    if (categoryId && categoryId !== "all") {
      where.product = { ...where.product, categoryId };
    }

    if (search) {
      where.OR = [
        { product: { name: { contains: search, mode: "insensitive" } } },
        { product: { sku: { contains: search, mode: "insensitive" } } },
        { product: { barcode: { contains: search, mode: "insensitive" } } }
      ];
    }

    if (status === "critical") {
      where.stock = { lte: prisma.branchProduct.fields.safetyStock };
    } else if (status === "reorder") {
      where.stock = {
        gt: prisma.branchProduct.fields.safetyStock,
        lte: prisma.branchProduct.fields.reorderLevel
      };
    } else if (status === "optimal") {
      where.stock = { gt: prisma.branchProduct.fields.reorderLevel };
    }

    let orderBy: Prisma.BranchProductOrderByWithRelationInput | Prisma.BranchProductOrderByWithRelationInput[] = { 
      product: { name: "asc" } 
    };

    if (sort === "stock_asc") orderBy = { stock: "asc" };
    if (sort === "stock_desc") orderBy = { stock: "desc" };
    if (sort === "valuation_desc") orderBy = [{ costPrice: "desc" }, { stock: "desc" }];
    if (sort === "last_sold") orderBy = { lastSoldAt: "desc" };

    const [rawItems, total] = await Promise.all([
      prisma.branchProduct.findMany({
        where,
        include: {
          vendor: { select: { id: true, name: true } },
          product: {
            include: {
              category: { select: { id: true, name: true } },
              uom: { select: { id: true, name: true, abbreviation: true } }
            }
          }
        },
        orderBy,
        take: limit,
        skip: isExport ? 0 : (page - 1) * limit
      }),
      prisma.branchProduct.count({ where })
    ]);

    const mapped: UiBranchProduct[] = rawItems.map(bp => ({
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
        uom: bp.product.uom
      },
      lastSoldAt: bp.lastSoldAt?.toISOString() || null,
      lastRestockedAt: bp.lastRestockedAt?.toISOString() || null
    }));

    return NextResponse.json({ 
      items: mapped, 
      total, 
      page, 
      limit,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error: any) {
    console.error("[FORTRESS_GET_ERROR]", error);
    return NextResponse.json(
      { error: error.message || "An unexpected system error occurred during retrieval." }, 
      { status: error.status || 500 }
    );
  }
}

/* -------------------------------------------------------------------------- */
/* [PATCH] MODIFICATION: PRICE & THRESHOLD ADJUSTMENTS WITH AUDIT LOGGING     */
/* -------------------------------------------------------------------------- */

export async function PATCH(req: NextRequest) {
  try {
    const user = await validateAccess(PermissionAction.UPDATE);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "BranchProduct ID parameter is missing." }, { status: 400 });
    }

    const body = await req.json();
    const { sellingPrice, reorderLevel, safetyStock } = body;

    const existing = await prisma.branchProduct.findUnique({
      where: { id, organizationId: user.organizationId },
      include: { product: { select: { sku: true, name: true } } }
    });

    if (!existing) {
      return NextResponse.json({ error: "Inventory record not found or inaccessible." }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.branchProduct.update({
        where: { id },
        data: {
          sellingPrice: sellingPrice !== undefined ? new Prisma.Decimal(sellingPrice) : undefined,
          reorderLevel: reorderLevel !== undefined ? Number(reorderLevel) : undefined,
          safetyStock: safetyStock !== undefined ? Number(safetyStock) : undefined,
        }
      });

      await tx.activityLog.create({
        data: {
          organizationId: user.organizationId,
          branchId: existing.branchId,
          actorId: user.id,
          actorType: ActorType.USER,
          actorRole: user.role,
          action: "PRICE_OR_THRESHOLD_UPDATE",
          description: `Updated inventory parameters for ${existing.product.name} (SKU: ${existing.product.sku})`,
          severity: Severity.MEDIUM,
          critical: false,
          targetId: existing.id,
          targetType: "BRANCH_PRODUCT",
          before: {
             sellingPrice: existing.sellingPrice?.toNumber(),
             reorderLevel: existing.reorderLevel,
             safetyStock: existing.safetyStock
          },
          after: {
             sellingPrice: updated.sellingPrice?.toNumber(),
             reorderLevel: updated.reorderLevel,
             safetyStock: updated.safetyStock
          }
        }
      });

      return updated;
    });

    return NextResponse.json({ 
      success: true, 
      id: result.id, 
      newPrice: Number(result.sellingPrice),
      message: "Parameters updated and securely logged."
    });

  } catch (error: any) {
    console.error("[FORTRESS_PATCH_ERROR]", error);
    return NextResponse.json(
      { error: error.message || "Failed to commit inventory adjustments." }, 
      { status: error.status || 500 }
    );
  }
}