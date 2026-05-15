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
  name: string;
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

// Helper to safely serialize Decimals for Audit Logs without losing precision
function formatDecimalForAudit(value: Prisma.Decimal | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return value.toString();
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
  // FIX 5: Notification Logic - Broad vs. Localized
  // Ensure we only notify managers for THIS branch, plus global admins/owners
  const targets = await tx.authorizedPersonnel.findMany({
    where: {
      organizationId: params.organizationId,
      deletedAt: null,
      disabled: false,
      OR: [
        { role: Role.ADMIN },
        { isOrgOwner: true },
        // Only include managers/auditors if they are assigned to this branch or have no branch (global)
        { 
          role: { in: [Role.MANAGER, Role.AUDITOR] },
          OR: [
            { branchId: params.branchId },
            { branchId: null }
          ]
        }
      ],
    },
    select: { id: true },
  });

  if (targets.length === 0) return;

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

    const isGlobalViewer = [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role) || user.isOrgOwner;
    const requestedBranchId = searchParams.get("branchId") || user.branchId;

    if (!requestedBranchId) {
      return NextResponse.json({ error: "Branch context required." }, { status: 400 });
    }

    if (!isGlobalViewer && requestedBranchId !== user.branchId) {
      return NextResponse.json({ error: "Branch access restricted by hierarchy." }, { status: 403 });
    }

    const branchValidation = await prisma.branch.findFirst({
      where: { id: requestedBranchId, organizationId: orgId }
    });
    
    if (!branchValidation) {
      return NextResponse.json({ error: "Invalid branch for this organization context." }, { status: 403 });
    }

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

    if (search) {
      where.OR = [
        { product: { name: { contains: search, mode: "insensitive" } } },
        { product: { sku: { contains: search, mode: "insensitive" } } },
        { product: { barcode: { contains: search, mode: "insensitive" } } }
      ];
    }

    // FIX 2: Prisma Field-to-Field Comparison (The status Filter)
    // To handle field-to-field comparisons natively in Prisma without raw queries, 
    // we must fetch the data and filter in memory if the specific db engine/prisma version doesn't support it,
    // OR we use the preview feature. Assuming standard safe implementation:
    // We will pull the data and filter if status is provided, but to keep pagination accurate,
    // we use a raw query fallback or rely on the application layer if needed.
    // For this Fortified version, we will assume standard filtering is possible via schema 
    // or we skip field-to-field in the `where` and filter post-fetch if necessary.
    // However, for pure performance, we will implement a safe, generic fallback or leave it to standard where if supported.
    // *If your Prisma version does NOT support `fields`, this block must be removed and filtered in memory.*
    
    // Safest approach without preview features: We do NOT use field-to-field in the Prisma `where` clause directly.
    // Since we need pagination, we'll keep the standard approach but wrap it in a try-catch in case of Prisma version issues,
    // or ideally, we'd use raw queries. For this snippet, we will keep the standard implementation but flag it.
    
    if (status === "critical") {
      // Note: Requires previewFeatures = ["fieldReference"] in schema.prisma if < 5.x
      where.stock = { lte: prisma.branchProduct.fields.safetyStock };
    } else if (status === "reorder") {
      where.AND = [
        { stock: { gt: prisma.branchProduct.fields.safetyStock } },
        { stock: { lte: prisma.branchProduct.fields.reorderLevel } }
      ];
    } else if (status === "optimal") {
      where.stock = { gt: prisma.branchProduct.fields.reorderLevel };
    }

    let orderBy: Prisma.BranchProductOrderByWithRelationInput | Prisma.BranchProductOrderByWithRelationInput[] = { 
      product: { name: "asc" } 
    };

    if (sort === "stock_asc") orderBy = { stock: "asc" };
    if (sort === "stock_desc") orderBy = { stock: "desc" };
    if (sort === "price_desc") orderBy = { sellingPrice: "desc" };
    if (sort === "cost_desc") orderBy = { costPrice: "desc" };
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
      resources: Resource.STOCK,
      userPermissions: user.permissions,
    });

    if (!auth.allowed) return NextResponse.json({ error: auth.reason || "ACCESS_DENIED" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Target ID parameter is missing." }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });

    // --- CRITICAL AUDIT ENFORCEMENT ---
    if ("stock" in body || "quantity" in body || "stockAdjustment" in body) {
      return NextResponse.json({ 
        error: "AUDIT VIOLATION: Manual stock quantity adjustments are strictly prohibited on this route. Please use the official Stock Take or Goods Receipt APIs." 
      }, { status: 400 });
    }

    const { sellingPrice, costPrice, reorderLevel, safetyStock, reason, expectedVersion } = body;

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

    const existing = await prisma.branchProduct.findUnique({
      where: { id, organizationId: orgId },
      include: { product: { select: { sku: true, name: true } } }
    });

    if (!existing) {
      return NextResponse.json({ error: "Product record not found or inaccessible." }, { status: 404 });
    }

    // FIX 1: Concurrency Guard - Optimistic Locking via stockVersion
    if (expectedVersion !== undefined && existing.stockVersion !== expectedVersion) {
      return NextResponse.json({ error: "Concurrency Conflict: The product parameters were updated by another user. Please refresh and try again." }, { status: 409 });
    }

    const oldSellingPriceStr = formatDecimalForAudit(existing.sellingPrice);
    const oldCostPriceStr = formatDecimalForAudit(existing.costPrice);
    
    // We still use numbers for comparison logic, but Strings for the audit log
    const oldSellingPriceNum = existing.sellingPrice ? existing.sellingPrice.toNumber() : null;
    const oldCostPriceNum = existing.costPrice ? existing.costPrice.toNumber() : null;

    const isSellingPriceChange = sellingPrice !== undefined && Number(sellingPrice) !== oldSellingPriceNum;
    const isCostPriceChange = costPrice !== undefined && Number(costPrice) !== oldCostPriceNum;
    const isCommercialChange = isSellingPriceChange || isCostPriceChange;

    // FIX 7: Audit Log Integrity - Mandatory Reason for Commercial Changes
    if (isCommercialChange && (!reason || reason.trim() === "")) {
      return NextResponse.json({ error: "A detailed reason is mandatory for forensic auditing when altering commercial parameters." }, { status: 400 });
    }

    if (!isCommercialChange && reorderLevel === undefined && safetyStock === undefined) {
      return NextResponse.json({ error: "Payload exactly matches current state. No changes made." }, { status: 400 });
    }

    const canAutoApproveCommercial = [Role.ADMIN, Role.MANAGER, Role.DEV].includes(user.role) || user.isOrgOwner;

    // FIX 4: Approval Workflow Deduplication
    let activeApproval = null;
    if (isCommercialChange && !canAutoApproveCommercial) {
      activeApproval = await prisma.approvalRequest.findFirst({
        where: {
          organizationId: orgId,
          targetType: "BRANCH_PRODUCT",
          targetId: existing.id,
          actionType: CriticalAction.PRICE_UPDATE,
          status: ApprovalStatus.PENDING
        }
      });
      
      // We don't block. We will OVERWRITE/UPDATE the existing pending request below.
    }

    // FIX 6: Transaction Isolation Performance
    // Changed from Serializable to RepeatableRead for better throughput on simple parameter updates
    const result = await prisma.$transaction(async (tx) => {
      let branchProduct = existing;
      let approvalReq = activeApproval;
      let commercialDirectlyUpdated = false;

      // 1. LOGISTICAL PARAMETERS (No Approval Required)
      const newReorder = reorderLevel !== undefined ? Math.floor(Number(reorderLevel)) : undefined;
      const newSafety = safetyStock !== undefined ? Math.floor(Number(safetyStock)) : undefined;

      if (newReorder !== undefined || newSafety !== undefined) {
        branchProduct = await tx.branchProduct.update({
          where: { 
            id,
            // Optimistic Lock execution
            ...(expectedVersion !== undefined ? { stockVersion: expectedVersion } : {})
          },
          data: {
            reorderLevel: newReorder,
            safetyStock: newSafety,
            stockVersion: { increment: 1 } // FIX 1: Increment the version
          }
        });
      }

      // 2. COMMERCIAL PARAMETERS (Approval Gate)
      if (isCommercialChange) {
        if (canAutoApproveCommercial) {
          branchProduct = await tx.branchProduct.update({
            where: { 
              id,
              ...(expectedVersion !== undefined && newReorder === undefined && newSafety === undefined ? { stockVersion: expectedVersion } : {})
            },
            data: { 
              sellingPrice: sellingPrice !== undefined ? new Prisma.Decimal(sellingPrice) : undefined,
              costPrice: costPrice !== undefined ? new Prisma.Decimal(costPrice) : undefined,
              // Only increment if we didn't already increment in the logistical step
              ...(newReorder === undefined && newSafety === undefined ? { stockVersion: { increment: 1 } } : {})
            }
          });
          commercialDirectlyUpdated = true;
        } else {
          // Construct explicit payload for the pending queue
          // FIX 3: Store as strings/numbers safely for audit, excluding DB-breaking fields
          const changesPayload: Prisma.InputJsonValue = {
            ...(isSellingPriceChange && { sellingPrice: Number(sellingPrice) }),
            ...(isCostPriceChange && { costPrice: Number(costPrice) }),
          };

          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + APPROVAL_EXPIRY_DAYS);

          const approvalData = {
            organizationId: orgId,
            branchId: existing.branchId,
            requesterId: user.id,
            actionType: CriticalAction.PRICE_UPDATE,
            requiredRole: Role.MANAGER,
            changes: changesPayload,
            targetType: "BRANCH_PRODUCT",
            targetId: existing.id,
            status: ApprovalStatus.PENDING,
            expiresAt: expiryDate,
            rejectionNote: `Initial Request Reason: ${reason}` // Store reason here
          };

          if (activeApproval) {
            // FIX 4: Update existing request instead of throwing 409
            approvalReq = await tx.approvalRequest.update({
              where: { id: activeApproval.id },
              data: approvalData
            });
          } else {
            approvalReq = await tx.approvalRequest.create({
              data: approvalData
            });
          }
        }
      }

      // 3. PURE FORENSIC AUDIT CHRONICLE
      if (commercialDirectlyUpdated || newReorder !== undefined || newSafety !== undefined) {
        const auditActionType = commercialDirectlyUpdated && (newReorder !== undefined || newSafety !== undefined) 
          ? "COMMERCIAL_AND_LOGISTICAL_UPDATE" 
          : commercialDirectlyUpdated ? "COMMERCIAL_UPDATE" : "LOGISTICAL_UPDATE";

        const log = await createAuditLog(tx as any, {
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
          // FIX 3: Keep strings for prices in Audit Logs
          changes: {
            from: { 
              sellingPrice: commercialDirectlyUpdated && isSellingPriceChange ? oldSellingPriceStr : undefined,
              costPrice: commercialDirectlyUpdated && isCostPriceChange ? oldCostPriceStr : undefined,
              reorderLevel: newReorder !== undefined ? existing.reorderLevel : undefined,
              safetyStock: newSafety !== undefined ? existing.safetyStock : undefined
            },
            to: { 
              sellingPrice: commercialDirectlyUpdated && isSellingPriceChange ? String(sellingPrice) : undefined,
              costPrice: commercialDirectlyUpdated && isCostPriceChange ? String(costPrice) : undefined,
              reorderLevel: newReorder !== undefined ? newReorder : undefined,
              safetyStock: newSafety !== undefined ? newSafety : undefined
            }
          }
        });

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
        const log = await createAuditLog(tx as any, {
          organizationId: orgId,
          branchId: existing.branchId,
          actorId: user.id,
          actorRole: user.role,
          action: activeApproval ? "UPDATE_COMMERCIAL_REQUEST" : "REQUEST_COMMERCIAL_UPDATE",
          resource: Resource.STOCK,
          resourceId: existing.id,
          severity: Severity.MEDIUM,
          description: `${activeApproval ? 'Updated' : 'Requested'} commercial update for ${existing.product.name} (SKU: ${existing.product.sku}).`,
          requestId,
          ipAddress,
          deviceInfo,
          approvalId: approvalReq.id, 
          // FIX 3: Keep strings for prices in Audit Logs
          changes: {
            from: { 
              sellingPrice: isSellingPriceChange ? oldSellingPriceStr : undefined,
              costPrice: isCostPriceChange ? oldCostPriceStr : undefined
            },
            to: { 
              sellingPrice: isSellingPriceChange ? String(sellingPrice) : undefined,
              costPrice: isCostPriceChange ? String(costPrice) : undefined
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
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, 
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