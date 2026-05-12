/**
 * src/app/api/inventory/route.ts
 * * CORE INVENTORY & STOCK MANAGEMENT API
 * Integrated with Forensic Audit, RBAC, and Approval Workflows.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import {
  PermissionAction,
  Severity,
  Prisma,
  Role,
  CriticalAction,
  ApprovalStatus,
  Resource,
} from "@prisma/client";
import crypto from "crypto";
import { authorize } from "@/core/lib/permission";
import { createAuditLog, notifyManagement } from "@/core/lib/audit";

/* -------------------------------------------------------------------------- */
/* CONFIGURATION & HELPERS                                                    */
/* -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 500;
const EXPORT_LIMIT = 10000;
const APPROVAL_EXPIRY_DAYS = 7;

export type UiBranchProduct = {
  id: string;
  stock: number;
  stockVersion: number;
  reorderLevel: number;
  safetyStock: number;
  sellingPrice: number | null;
  costPrice: number | null;
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
  pendingApproval?: {
    id: string;
    actionType: CriticalAction;
    changes: Prisma.JsonValue;
    createdAt: string;
  } | null;
};

// Augmented Session User type based on your auth.ts injection
interface AuthenticatedUser {
  id: string;
  organizationId: string;
  branchId: string | null;
  role: Role;
  isOrgOwner: boolean;
  permissions: string[]; // Injected by production-ready auth.ts
}

function parseIntSafe(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/* -------------------------------------------------------------------------- */
/* [GET] DATA RETRIEVAL: STOCK GRID & METADATA                                */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as AuthenticatedUser;

    // --- INTEGRATED PERMISSION CHECK (DB + FALLBACK) ---
    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.READ,
      resources: Resource.STOCK, // Explicitly corrected to STOCK
      userPermissions: user.permissions, // Use pre-resolved permissions from session
    });

    if (!auth.allowed) return NextResponse.json({ error: auth.reason || "ACCESS_DENIED" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const orgId = user.organizationId;
    const isGlobalViewer = [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role) || user.isOrgOwner;
    
    const branchIdParam = searchParams.get("branchId");
    const branchId = isGlobalViewer ? (branchIdParam || user.branchId) : user.branchId;

    if (!branchId) {
      return NextResponse.json({ error: "Missing required parameter: branchId" }, { status: 400 });
    }

    const meta = searchParams.get("meta");

    // --- META DROPDOWNS ---
    if (meta === "vendors") {
      const vendors = await prisma.vendor.findMany({
        where: { organizationId: orgId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      });
      return NextResponse.json({ items: vendors });
    }

    if (meta === "categories") {
      const categories = await prisma.category.findMany({
        where: { organizationId: orgId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      });
      return NextResponse.json({ items: categories });
    }

    // --- MAIN GRID QUERY ---
    const exportAll = searchParams.get("export") === "true";
    if (exportAll) {
      const exportAuth = authorize({
        role: user.role,
        isOrgOwner: user.isOrgOwner,
        action: PermissionAction.EXPORT,
        resources: Resource.STOCK,
        userPermissions: user.permissions,
      });
      if (!exportAuth.allowed) return NextResponse.json({ error: "ACCESS_DENIED: Export Restricted." }, { status: 403 });
    }

    const page = parseIntSafe(searchParams.get("page"), 1);
    const limitInput = parseIntSafe(searchParams.get("limit"), DEFAULT_LIMIT);
    const take = exportAll ? EXPORT_LIMIT : Math.min(limitInput, MAX_LIMIT);
    const skip = (page - 1) * take;

    const search = searchParams.get("search")?.trim() || "";
    const vendorId = searchParams.get("vendorId");
    const categoryId = searchParams.get("categoryId");
    const status = (searchParams.get("status") || "all").toLowerCase();
    const sort = (searchParams.get("sort") || "name").toLowerCase();

    const where: Prisma.BranchProductWhereInput = {
      organizationId: orgId,
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

    // Stock Status Filtering logic
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
        take,
        skip
      }),
      prisma.branchProduct.count({ where })
    ]);

    if (exportAll) {
      const header = ["SKU", "Product Name", "Category", "Vendor", "Stock", "Safety Stock", "Reorder Level", "Cost Price", "Selling Price", "Last Sold At"];
      const rows = rawItems.map((bp) => [
        bp.product.sku,
        bp.product.name,
        bp.product.category?.name || "Uncategorized",
        bp.vendor?.name || "No Vendor",
        bp.stock.toString(),
        bp.safetyStock?.toString() || "0",
        bp.reorderLevel?.toString() || "0",
        bp.costPrice?.toString() || "0.00",
        bp.sellingPrice?.toString() || "0.00",
        bp.lastSoldAt ? bp.lastSoldAt.toISOString() : "Never"
      ]);
      const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="stock_report_${Date.now()}.csv"`,
        },
      });
    }

    const productIds = rawItems.map(item => item.id);
    const pendingApprovals = await prisma.approvalRequest.findMany({
      where: {
        organizationId: orgId,
        targetType: "BRANCH_PRODUCT",
        targetId: { in: productIds },
        status: ApprovalStatus.PENDING
      },
      select: {
        id: true,
        targetId: true,
        actionType: true,
        changes: true,
        createdAt: true
      }
    });

    const approvalsMap = new Map(pendingApprovals.map(app => [app.targetId, app]));

    const mapped: UiBranchProduct[] = rawItems.map(bp => {
      const pendingReq = approvalsMap.get(bp.id);
      return {
        id: bp.id,
        stock: bp.stock,
        stockVersion: bp.stockVersion,
        reorderLevel: bp.reorderLevel ?? 0,
        safetyStock: bp.safetyStock ?? 0,
        sellingPrice: bp.sellingPrice ? Number(bp.sellingPrice) : null,
        costPrice: bp.costPrice ? Number(bp.costPrice) : null,
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
        lastRestockedAt: bp.lastRestockedAt?.toISOString() || null,
        pendingApproval: pendingReq ? {
          id: pendingReq.id,
          actionType: pendingReq.actionType,
          changes: pendingReq.changes,
          createdAt: pendingReq.createdAt.toISOString()
        } : null
      };
    });

    return NextResponse.json({ 
      items: mapped, 
      total, 
      page, 
      limit: take,
      totalPages: Math.ceil(total / take)
    });

  } catch (error: unknown) {
    console.error("[FORTRESS_GET_ERROR]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* [PATCH] MODIFICATION: CRITICAL ACTION AUTHORIZATION BRIDGE                 */
/* -------------------------------------------------------------------------- */

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as AuthenticatedUser;
    const orgId = user.organizationId;

    const requestId = crypto.randomUUID();
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    // --- INTEGRATED PERMISSION CHECK (DB + FALLBACK) ---
    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.UPDATE,
      resources: Resource.STOCK,
      userPermissions: user.permissions,
    });

    if (!auth.allowed) return NextResponse.json({ error: auth.reason || "ACCESS_DENIED" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Product ID parameter is missing." }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const { sellingPrice, reorderLevel, safetyStock } = body;

    // Validation
    if (sellingPrice !== undefined && (isNaN(Number(sellingPrice)) || Number(sellingPrice) < 0)) {
      return NextResponse.json({ error: "Selling price cannot be less than 0." }, { status: 400 });
    }

    const existing = await prisma.branchProduct.findUnique({
      where: { id, organizationId: orgId },
      include: { product: { select: { sku: true, name: true } } }
    });

    if (!existing) {
      return NextResponse.json({ error: "Stock record not found." }, { status: 404 });
    }

    const oldSellingPrice = existing.sellingPrice ? existing.sellingPrice.toNumber() : null;
    const isPriceChange = sellingPrice !== undefined && Number(sellingPrice) !== oldSellingPrice;

    // Check if the user can auto-approve critical actions based on role hierarchy or ownership
    const canAutoApprovePrice = [Role.ADMIN, Role.MANAGER, Role.DEV].includes(user.role) || user.isOrgOwner;

    // Deduplication check for pending price requests
    if (isPriceChange && !canAutoApprovePrice) {
      const activeApproval = await prisma.approvalRequest.findFirst({
        where: {
          organizationId: orgId,
          targetType: "BRANCH_PRODUCT",
          targetId: existing.id,
          actionType: CriticalAction.PRICE_UPDATE,
          status: ApprovalStatus.PENDING
        }
      });
      if (activeApproval) return NextResponse.json({ error: "A price update request is already pending." }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      let branchProduct = existing;
      let approvalReq = null;
      let priceUpdated = false;

      // 1. Handle Thresholds (Standard Action)
      const newReorder = reorderLevel !== undefined ? Math.floor(Number(reorderLevel)) : undefined;
      const newSafety = safetyStock !== undefined ? Math.floor(Number(safetyStock)) : undefined;

      if (newReorder !== undefined || newSafety !== undefined) {
        branchProduct = await tx.branchProduct.update({
          where: { id },
          data: {
            reorderLevel: newReorder,
            safetyStock: newSafety
          }
        });
      }

      // 2. Handle Price Change (Critical Action)
      if (isPriceChange) {
        if (canAutoApprovePrice) {
          branchProduct = await tx.branchProduct.update({
            where: { id },
            data: { sellingPrice: new Prisma.Decimal(sellingPrice) }
          });
          priceUpdated = true;
        } else {
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + APPROVAL_EXPIRY_DAYS);

          approvalReq = await tx.approvalRequest.create({
            data: {
              organizationId: orgId,
              branchId: existing.branchId,
              requesterId: user.id,
              actionType: CriticalAction.PRICE_UPDATE,
              requiredRole: Role.MANAGER,
              changes: { sellingPrice: { old: oldSellingPrice, new: Number(sellingPrice) } },
              targetType: "BRANCH_PRODUCT",
              targetId: existing.id,
              status: ApprovalStatus.PENDING,
              expiresAt: expiryDate 
            }
          });
        }
      }

      // 3. Centralized Audit Logging
      if (priceUpdated || newReorder !== undefined || newSafety !== undefined) {
        const log = await createAuditLog(tx, {
          organizationId: orgId,
          branchId: existing.branchId,
          actorId: user.id,
          actorRole: user.role,
          action: priceUpdated ? "PRICE_UPDATE" : "THRESHOLD_UPDATE",
          entityType: Resource.STOCK,
          entityId: existing.id,
          severity: priceUpdated ? Severity.HIGH : Severity.MEDIUM,
          description: `Updated parameters for ${existing.product.name}`,
          ipAddress,
          deviceInfo,
          changes: {
            from: { sellingPrice: priceUpdated ? oldSellingPrice : undefined },
            to: { sellingPrice: priceUpdated ? Number(sellingPrice) : undefined }
          },
          metadata: { correlationId: requestId } // Passing standard UUID for chain correlation
        });

        // Trigger notifications explicitly using centralized engine
        if (priceUpdated) {
          await notifyManagement(tx, orgId, existing.branchId, "Price Changed", `${existing.product.name} price updated to ${sellingPrice}`, log.id, undefined, CriticalAction.PRICE_UPDATE);
        }
      }

      // 4. Traceability for Pending Approvals
      if (approvalReq) {
        const log = await createAuditLog(tx, {
          organizationId: orgId,
          branchId: existing.branchId,
          actorId: user.id,
          actorRole: user.role,
          action: "REQUEST_PRICE_UPDATE",
          entityType: Resource.STOCK,
          entityId: existing.id,
          severity: Severity.MEDIUM,
          description: `Requested price change for ${existing.product.name} to ${sellingPrice}`,
          ipAddress,
          deviceInfo,
          approvalId: approvalReq.id,
          changes: {
            from: { sellingPrice: oldSellingPrice },
            to: { requestedPrice: Number(sellingPrice) }
          },
          metadata: { correlationId: requestId }
        });
        
        await notifyManagement(tx, orgId, existing.branchId, "Approval Required", `New price request for ${existing.product.name}`, log.id, approvalReq.id, CriticalAction.PRICE_UPDATE);
      }

      return { branchProduct, approvalReq };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 15000 
    });

    return NextResponse.json({ 
      success: true, 
      id: result.branchProduct.id, 
      approvalPending: !!result.approvalReq,
      message: result.approvalReq 
        ? "Price change request sent for approval."
        : "Stock parameters updated and logged."
    });

  } catch (error: unknown) {
    console.error("[FORTRESS_PATCH_ERROR]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to update stock record." }, { status: 500 });
  }
}