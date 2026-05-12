/**
 * src/app/api/inventory/fortress/route.ts
 * * CORE INVENTORY & STOCK MANAGEMENT API (FORTRESS V3.5)
 * * Integrated with: Pure Forensic Audit, RBAC, SOP, and Approval Workflows.
 * * * * CRITICAL AUDIT COMPLIANCE: 
 * * This route strictly governs COMMERCIAL and LOGISTICAL parameters ONLY.
 * * Any payload attempting to modify 'stock', 'quantity', or direct balance 
 * * will be intercepted and rejected with a 400 Bad Request to prevent 
 * * untraceable inventory shrinkage.
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
  NotificationType,
  CriticalAction,
  ApprovalStatus,
  Resource,
} from "@prisma/client";
import crypto from "crypto";
import { authorize } from "@/core/lib/permission";
// STRICT IMPORT: We only import pure forensic functions. No side-effect imports.
import { createAuditLog } from "@/core/lib/audit";

/* -------------------------------------------------------------------------- */
/* CONFIGURATION & HELPERS                                                    */
/* -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 500;
const EXPORT_LIMIT = 10000;
const APPROVAL_EXPIRY_DAYS = 7; // Auto-expire pending critical requests

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

// Augmented Session User type mapped to the production NextAuth injection
interface AuthenticatedUser {
  id: string;
  name: string; // Added to capture the user's real name for human-readable notifications
  organizationId: string;
  branchId: string | null;
  role: Role;
  isOrgOwner: boolean;
  permissions: string[];
}

function parseIntSafe(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/* -------------------------------------------------------------------------- */
/* NOTIFICATION ENGINE (API LAYER ISOLATED)                                   */
/* -------------------------------------------------------------------------- */

/**
 * LOCALIZED NOTIFICATION DISPATCHER
 * Defined within the API to prevent polluting the pure forensic audit utility.
 * Targets high-authority personnel for critical inventory threshold or price alerts.
 */
async function notifyManagement(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    branchId?: string | null;
    title: string;
    message: string;
    activityLogId: string;
    approvalId?: string;
    actionTrigger?: CriticalAction;
  }
) {
  // Identify authorized personnel in the organization
  const targets = await tx.authorizedPersonnel.findMany({
    where: {
      organizationId: params.organizationId,
      deletedAt: null,
      disabled: false,
      OR: [
        { role: Role.ADMIN }, 
        { role: Role.MANAGER }, 
        { role: Role.AUDITOR }, 
        { isOrgOwner: true }
      ],
    },
    select: { id: true },
  });

  if (targets.length === 0) return;

  // Dispatch the internal system notification
  await tx.notification.create({
    data: {
      organizationId: params.organizationId,
      branchId: params.branchId ?? undefined,
      type: NotificationType.INVENTORY,
      title: params.title,
      message: params.message,
      activityLogId: params.activityLogId,
      approvalId: params.approvalId,
      actionTrigger: params.actionTrigger,
      recipients: {
        create: targets.map((t) => ({ personnelId: t.id })),
      },
    },
  });
}

/* -------------------------------------------------------------------------- */
/* [GET] DATA RETRIEVAL: STOCK GRID & METADATA                                */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as AuthenticatedUser;

    // --- INTEGRATED PERMISSION CHECK ---
    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.READ,
      resources: Resource.STOCK,
      userPermissions: user.permissions, 
    });

    if (!auth.allowed) return NextResponse.json({ error: auth.reason || "ACCESS_DENIED" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const orgId = user.organizationId;
    const meta = searchParams.get("meta");

    // --- 1. UI METADATA HELPERS (For Filter Dropdowns) ---
    if (meta === "filters") {
      const [categories, vendors] = await Promise.all([
        prisma.category.findMany({ 
          where: { organizationId: orgId, deletedAt: null }, 
          select: { id: true, name: true },
          orderBy: { name: "asc" }
        }),
        prisma.vendor.findMany({ 
          where: { organizationId: orgId, deletedAt: null }, 
          select: { id: true, name: true },
          orderBy: { name: "asc" }
        }),
      ]);
      return NextResponse.json({ 
        categories: categories.map(c => ({ id: c.id, name: c.name })), 
        vendors: vendors.map(v => ({ id: v.id, name: v.name })) 
      });
    }

    // --- 2. MULTI-TENANT BRANCH SECURITY ---
    const isGlobalViewer = [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role) || user.isOrgOwner;
    const requestedBranchId = searchParams.get("branchId") || user.branchId;

    if (!requestedBranchId) {
      return NextResponse.json({ error: "Branch context required." }, { status: 400 });
    }

    // Guard: Prevent non-global users from querying other branches
    if (!isGlobalViewer && requestedBranchId !== user.branchId) {
      return NextResponse.json({ error: "Branch access restricted by hierarchy." }, { status: 403 });
    }

    // Guard: Ensure branch actually belongs to the user's organization
    const branchValidation = await prisma.branch.findFirst({
      where: { id: requestedBranchId, organizationId: orgId }
    });
    
    if (!branchValidation) {
      return NextResponse.json({ error: "Invalid branch for this organization context." }, { status: 403 });
    }

    // --- 3. QUERY CONSTRUCTION ---
    const exportAll = searchParams.get("export") === "true";
    
    if (exportAll) {
      const exportAuth = authorize({
        role: user.role,
        isOrgOwner: user.isOrgOwner,
        action: PermissionAction.EXPORT,
        resources: Resource.STOCK,
        userPermissions: user.permissions,
      });
      if (!exportAuth.allowed) return NextResponse.json({ error: "Export Restricted by RBAC." }, { status: 403 });
    }

    const page = parseIntSafe(searchParams.get("page"), 1);
    const limit = Math.min(parseIntSafe(searchParams.get("limit"), DEFAULT_LIMIT), MAX_LIMIT);
    const skip = exportAll ? 0 : (page - 1) * limit;
    const take = exportAll ? EXPORT_LIMIT : limit;

    const search = searchParams.get("search")?.trim() || "";
    const vendorId = searchParams.get("vendorId");
    const categoryId = searchParams.get("categoryId");
    const status = (searchParams.get("status") || "all").toLowerCase();
    const sort = (searchParams.get("sort") || "name").toLowerCase();

    // Base WHERE clause
    const where: Prisma.BranchProductWhereInput = {
      organizationId: orgId,
      branchId: requestedBranchId,
      deletedAt: null,
      product: { 
        deletedAt: null,
        ...(categoryId && categoryId !== "all" ? { categoryId } : {})
      },
      ...(vendorId && vendorId !== "all" ? { vendorId } : {})
    };

    // Advanced Text Search (Includes Barcode Support)
    if (search) {
      where.OR = [
        { product: { name: { contains: search, mode: "insensitive" } } },
        { product: { sku: { contains: search, mode: "insensitive" } } },
        { product: { barcode: { contains: search, mode: "insensitive" } } }
      ];
    }

    // --- 3.5 REFINED KPI STATUS FILTERING ---
    // Note: Direct field-to-field comparison in Prisma requires specific syntax 
    // or may need to be handled via the 'where' input if version >= 4.3.0
    if (status === "critical") {
      where.stock = {
        lte: prisma.branchProduct.fields.safetyStock
      };
    } else if (status === "reorder") {
      where.AND = [
        { stock: { gt: prisma.branchProduct.fields.safetyStock } },
        { stock: { lte: prisma.branchProduct.fields.reorderLevel } }
      ];
    } else if (status === "optimal") {
      where.stock = { gt: prisma.branchProduct.fields.reorderLevel };
    }

    // Dynamic Sorting Logic
    let orderBy: Prisma.BranchProductOrderByWithRelationInput | Prisma.BranchProductOrderByWithRelationInput[] = { 
      product: { name: "asc" } 
    };

    if (sort === "stock_asc") orderBy = { stock: "asc" };
    if (sort === "stock_desc") orderBy = { stock: "desc" };
    if (sort === "price_desc") orderBy = { sellingPrice: "desc" };
    if (sort === "cost_desc") orderBy = { costPrice: "desc" };
    if (sort === "last_sold") orderBy = { lastSoldAt: "desc" };

    // --- 4. EXECUTE QUERY ---
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

    // --- 5. EXPORT HANDLER ---
    if (exportAll) {
      const header = ["SKU", "Barcode", "Product Name", "Category", "Vendor", "Stock", "UOM", "Safety Stock", "Reorder Level", "Cost Price", "Selling Price", "Last Sold At"];
      const rows = rawItems.map((bp) => [
        bp.product.sku,
        bp.product.barcode || "",
        bp.product.name,
        bp.product.category?.name || "Uncategorized",
        bp.vendor?.name || "No Vendor",
        bp.stock.toString(),
        bp.product.uom?.abbreviation || "",
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
          "Content-Disposition": `attachment; filename="inventory_parameters_${Date.now()}.csv"`,
        },
      });
    }

    // --- 6. PENDING APPROVAL MAPPING (UI BADGES) ---
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
    return NextResponse.json({ error: "Critical internal retrieval error." }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* [PATCH] PARAMETER MODIFICATION: COMMERCIAL & LOGISTICAL                    */
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

    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.UPDATE,
      resources: Resource.STOCK, // Strictly verified against schema Enum
      userPermissions: user.permissions,
    });

    if (!auth.allowed) return NextResponse.json({ error: auth.reason || "ACCESS_DENIED" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Target ID parameter is missing." }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });

    // --- CRITICAL AUDIT ENFORCEMENT: QUANTITY IMMUTABILITY ---
    // Under no circumstances can this route modify physical stock.
    // Stock modifications MUST go through Sales, Procurement, or Audit StockTake APIs.
    if ("stock" in body || "quantity" in body || "stockAdjustment" in body) {
      return NextResponse.json({ 
        error: "AUDIT VIOLATION: Manual stock quantity adjustments are strictly prohibited on this route. Please use the official Stock Take or Goods Receipt APIs." 
      }, { status: 400 });
    }

    const { sellingPrice, costPrice, reorderLevel, safetyStock, reason } = body;

    // Numerical Integrity Validation
    if (sellingPrice !== undefined && (isNaN(Number(sellingPrice)) || Number(sellingPrice) < 0)) {
      return NextResponse.json({ error: "Selling price cannot be negative." }, { status: 400 });
    }
    if (costPrice !== undefined && (isNaN(Number(costPrice)) || Number(costPrice) < 0)) {
      return NextResponse.json({ error: "Cost price cannot be negative." }, { status: 400 });
    }
    if (reorderLevel !== undefined && (isNaN(Number(reorderLevel)) || Number(reorderLevel) < 0)) {
      return NextResponse.json({ error: "Reorder level cannot be negative." }, { status: 400 });
    }
    if (safetyStock !== undefined && (isNaN(Number(safetyStock)) || Number(safetyStock) < 0)) {
      return NextResponse.json({ error: "Safety stock cannot be negative." }, { status: 400 });
    }

    // Fetch the origin state
    const existing = await prisma.branchProduct.findUnique({
      where: { id, organizationId: orgId },
      include: { product: { select: { sku: true, name: true } } }
    });

    if (!existing) {
      return NextResponse.json({ error: "Product record not found or inaccessible." }, { status: 404 });
    }

    const oldSellingPrice = existing.sellingPrice ? existing.sellingPrice.toNumber() : null;
    const oldCostPrice = existing.costPrice ? existing.costPrice.toNumber() : null;
    
    const isSellingPriceChange = sellingPrice !== undefined && Number(sellingPrice) !== oldSellingPrice;
    const isCostPriceChange = costPrice !== undefined && Number(costPrice) !== oldCostPrice;
    const isCommercialChange = isSellingPriceChange || isCostPriceChange;

    // SOP Optimization: Block empty requests
    if (!isCommercialChange && reorderLevel === undefined && safetyStock === undefined) {
      return NextResponse.json({ error: "Payload exactly matches current state. No changes made." }, { status: 400 });
    }

    // --- GOVERNANCE RULES ---
    // Admin, Dev, Manager, and Owner bypass the approval queue.
    const canAutoApproveCommercial = [Role.ADMIN, Role.MANAGER, Role.DEV].includes(user.role) || user.isOrgOwner;

    // Deduplication check for pending requests
    if (isCommercialChange && !canAutoApproveCommercial) {
      const activeApproval = await prisma.approvalRequest.findFirst({
        where: {
          organizationId: orgId,
          targetType: "BRANCH_PRODUCT",
          targetId: existing.id,
          actionType: CriticalAction.PRICE_UPDATE,
          status: ApprovalStatus.PENDING
        }
      });

      if (activeApproval) {
        return NextResponse.json(
          { error: "A commercial update request is already pending management review for this item." }, 
          { status: 409 }
        );
      }
    }

    // --- ATOMIC SERIALIZABLE TRANSACTION ---
    const result = await prisma.$transaction(async (tx) => {
      let branchProduct = existing;
      let approvalReq = null;
      let commercialDirectlyUpdated = false;

      // 1. LOGISTICAL PARAMETERS (No Approval Required)
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

      // 2. COMMERCIAL PARAMETERS (Approval Gate)
      if (isCommercialChange) {
        if (canAutoApproveCommercial) {
          branchProduct = await tx.branchProduct.update({
            where: { id },
            data: { 
              sellingPrice: sellingPrice !== undefined ? new Prisma.Decimal(sellingPrice) : undefined,
              costPrice: costPrice !== undefined ? new Prisma.Decimal(costPrice) : undefined
            }
          });
          commercialDirectlyUpdated = true;
        } else {
          // Construct explicit payload for the pending queue
          const changesPayload: Prisma.InputJsonValue = {
            ...(isSellingPriceChange && { sellingPrice: { old: oldSellingPrice, new: Number(sellingPrice) } }),
            ...(isCostPriceChange && { costPrice: { old: oldCostPrice, new: Number(costPrice) } }),
            reason: reason || "Manual parameter adjustment"
          };

          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + APPROVAL_EXPIRY_DAYS);

          approvalReq = await tx.approvalRequest.create({
            data: {
              organizationId: orgId,
              branchId: existing.branchId,
              requesterId: user.id,
              actionType: CriticalAction.PRICE_UPDATE,
              requiredRole: Role.MANAGER,
              changes: changesPayload,
              targetType: "BRANCH_PRODUCT",
              targetId: existing.id,
              status: ApprovalStatus.PENDING,
              expiresAt: expiryDate 
            }
          });
        }
      }

      // 3. PURE FORENSIC AUDIT CHRONICLE
      if (commercialDirectlyUpdated || newReorder !== undefined || newSafety !== undefined) {
        const auditActionType = commercialDirectlyUpdated && (newReorder !== undefined || newSafety !== undefined) 
          ? "COMMERCIAL_AND_LOGISTICAL_UPDATE" 
          : commercialDirectlyUpdated ? "COMMERCIAL_UPDATE" : "LOGISTICAL_UPDATE";

        const log = await createAuditLog(tx, {
          organizationId: orgId,
          branchId: existing.branchId,
          actorId: user.id,
          actorRole: user.role,
          action: auditActionType,
          resource: Resource.STOCK,
          resourceId: existing.id,
          severity: commercialDirectlyUpdated ? Severity.HIGH : Severity.MEDIUM,
          description: `Updated parameters for ${existing.product.name}. Reason: ${reason || 'System update'}`,
          requestId,
          ipAddress,
          deviceInfo,
          changes: {
            from: { 
              sellingPrice: commercialDirectlyUpdated && isSellingPriceChange ? oldSellingPrice : undefined,
              costPrice: commercialDirectlyUpdated && isCostPriceChange ? oldCostPrice : undefined,
              reorderLevel: newReorder !== undefined ? existing.reorderLevel : undefined,
              safetyStock: newSafety !== undefined ? existing.safetyStock : undefined
            },
            to: { 
              sellingPrice: commercialDirectlyUpdated && isSellingPriceChange ? Number(sellingPrice) : undefined,
              costPrice: commercialDirectlyUpdated && isCostPriceChange ? Number(costPrice) : undefined,
              reorderLevel: newReorder !== undefined ? newReorder : undefined,
              safetyStock: newSafety !== undefined ? newSafety : undefined
            }
          }
        });

        // Fire Localized Notification
        if (commercialDirectlyUpdated) {
          await notifyManagement(
            tx, 
            {
              organizationId: orgId, 
              branchId: existing.branchId, 
              title: "Commercial Parameters Updated", 
              message: `Price variables for ${existing.product.name} were directly updated by ${user.name || user.id} (${user.role}).`, 
              activityLogId: log.id,
              actionTrigger: CriticalAction.PRICE_UPDATE
            }
          );
        }
      }

      // 4. TRACEABILITY FOR PENDING APPROVALS
      if (approvalReq) {
        const log = await createAuditLog(tx, {
          organizationId: orgId,
          branchId: existing.branchId,
          actorId: user.id,
          actorRole: user.role,
          action: "REQUEST_COMMERCIAL_UPDATE",
          resource: Resource.STOCK,
          resourceId: existing.id,
          severity: Severity.MEDIUM,
          description: `Requested commercial update for ${existing.product.name} (SKU: ${existing.product.sku}).`,
          requestId,
          ipAddress,
          deviceInfo,
          approvalId: approvalReq.id, 
          changes: {
            from: { 
              sellingPrice: isSellingPriceChange ? oldSellingPrice : undefined,
              costPrice: isCostPriceChange ? oldCostPrice : undefined
            },
            to: { 
              sellingPrice: isSellingPriceChange ? Number(sellingPrice) : undefined,
              costPrice: isCostPriceChange ? Number(costPrice) : undefined
            }
          }
        });
        
        await notifyManagement(
          tx, 
          {
            organizationId: orgId, 
            branchId: existing.branchId, 
            title: "Approval Required: Commercial Update", 
            message: `User ${user.name || user.id} (${user.role}) requested a price review for ${existing.product.name}.`, 
            activityLogId: log.id,
            approvalId: approvalReq.id, 
            actionTrigger: CriticalAction.PRICE_UPDATE 
          }
        );
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
        ? "Logistical metrics updated. Commercial changes securely forwarded for managerial approval."
        : "Product parameters updated and securely logged."
    });

  } catch (error: unknown) {
    console.error("[FORTRESS_PATCH_ERROR]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to securely commit parameter adjustments." }, { status: 500 });
  }
}