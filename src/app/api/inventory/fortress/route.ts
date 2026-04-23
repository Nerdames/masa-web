import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import {
  PermissionAction,
  ActorType,
  Severity,
  Prisma,
  Role,
  NotificationType,
  CriticalAction,
  ApprovalStatus,
} from "@prisma/client";
import crypto from "crypto";
import { authorize, RESOURCES } from "@/core/lib/permission";

/* -------------------------------------------------------------------------- */
/* CONFIGURATION & HELPERS                                                    */
/* -------------------------------------------------------------------------- */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 500;
const EXPORT_LIMIT = 10000;

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
};

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

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/* -------------------------------------------------------------------------- */
/* FORENSIC AUDIT & NOTIFICATION ENGINES                                      */
/* -------------------------------------------------------------------------- */

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
    approvalId?: string; // GAP CLOSED: Added relation support
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
      targetType: "BRANCH_PRODUCT",
      targetId: data.resourceId,
      severity: data.severity ?? Severity.MEDIUM,
      description: data.description,
      approvalId: data.approvalId, // Relational Link
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
  activityLogId: string,
  approvalId?: string, // GAP CLOSED: Added relation support
  actionTrigger?: CriticalAction // GAP CLOSED: Added trigger support
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
      approvalId, // Relational Link
      actionTrigger, // UI Filter Hook
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
          resource: RESOURCES.INVENTORY,
        },
      },
    });
    if (perm) return true;
  } catch (e) {}
  return [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role);
}

/* -------------------------------------------------------------------------- */
/* [GET] DATA RETRIEVAL: INVENTORY GRID & METADATA                            */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as AuthenticatedUser;

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
    const authGrid = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.READ,
      resource: RESOURCES.INVENTORY,
    });
    if (!authGrid.allowed) return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });

    const exportAll = searchParams.get("export") === "true";
    if (exportAll && !(await canExport(user))) {
      return NextResponse.json({ error: "ACCESS_DENIED: Export Restricted." }, { status: 403 });
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
          "Content-Disposition": `attachment; filename="inventory_${Date.now()}.csv"`,
        },
      });
    }

    const mapped: UiBranchProduct[] = rawItems.map(bp => ({
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
      lastRestockedAt: bp.lastRestockedAt?.toISOString() || null
    }));

    return NextResponse.json({ 
      items: mapped, 
      total, 
      page, 
      limit: take,
      totalPages: Math.ceil(total / take)
    });

  } catch (error: any) {
    console.error("[FORTRESS_GET_ERROR]", error);
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

    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.UPDATE,
      resource: RESOURCES.INVENTORY,
    });
    if (!auth.allowed) return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "BranchProduct ID parameter is missing." }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const { sellingPrice, reorderLevel, safetyStock } = body;

    const existing = await prisma.branchProduct.findUnique({
      where: { id, organizationId: orgId },
      include: { product: { select: { sku: true, name: true } } }
    });

    if (!existing) {
      return NextResponse.json({ error: "Inventory record not found or inaccessible." }, { status: 404 });
    }

    // --- CRITICAL ACTION EVALUATION ---
    // GAP CLOSED: Null-safe extraction of Decimal fields
    const oldSellingPrice = existing.sellingPrice ? existing.sellingPrice.toNumber() : null;
    const isPriceChange = sellingPrice !== undefined && Number(sellingPrice) !== oldSellingPrice;
    
    const canAutoApprovePrice = [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role) || user.isOrgOwner;

    const result = await prisma.$transaction(async (tx) => {
      let branchProduct = existing;
      let approvalReq = null;
      let priceUpdated = false;

      // 1. Handle Standard Threshold Updates
      const newReorder = reorderLevel !== undefined ? Number(reorderLevel) : undefined;
      const newSafety = safetyStock !== undefined ? Number(safetyStock) : undefined;

      if (newReorder !== undefined || newSafety !== undefined) {
        branchProduct = await tx.branchProduct.update({
          where: { id },
          data: {
            reorderLevel: newReorder,
            safetyStock: newSafety
          }
        });
      }

      // 2. Handle Price Update (Critical Action Bridge)
      if (isPriceChange) {
        if (canAutoApprovePrice) {
          branchProduct = await tx.branchProduct.update({
            where: { id },
            data: { sellingPrice: new Prisma.Decimal(sellingPrice) }
          });
          priceUpdated = true;
        } else {
          approvalReq = await tx.approvalRequest.create({
            data: {
              organizationId: orgId,
              branchId: existing.branchId,
              requesterId: user.id,
              actionType: CriticalAction.PRICE_UPDATE,
              requiredRole: Role.MANAGER,
              changes: {
                sellingPrice: {
                  old: oldSellingPrice,
                  new: Number(sellingPrice)
                }
              },
              targetType: "BRANCH_PRODUCT",
              targetId: existing.id,
              status: ApprovalStatus.PENDING
            }
          });
        }
      }

      // 3. Robust Ledger Activity Logging
      if (priceUpdated || newReorder !== undefined || newSafety !== undefined) {
        const log = await createAuditLog(tx, {
          organizationId: orgId,
          branchId: existing.branchId,
          actorId: user.id,
          actorRole: user.role,
          action: priceUpdated ? "PRICE_AND_THRESHOLD_UPDATE" : "THRESHOLD_UPDATE",
          resourceId: existing.id,
          severity: priceUpdated ? Severity.HIGH : Severity.MEDIUM,
          description: `Updated parameters for ${existing.product.name} (SKU: ${existing.product.sku})`,
          requestId,
          ipAddress,
          deviceInfo,
          before: {
            sellingPrice: priceUpdated ? oldSellingPrice : undefined,
            reorderLevel: newReorder !== undefined ? existing.reorderLevel : undefined,
            safetyStock: newSafety !== undefined ? existing.safetyStock : undefined
          },
          after: {
            sellingPrice: priceUpdated ? Number(sellingPrice) : undefined,
            reorderLevel: newReorder !== undefined ? newReorder : undefined,
            safetyStock: newSafety !== undefined ? newSafety : undefined
          }
        });

        if (priceUpdated) {
          await notifyManagement(
            tx, 
            orgId, 
            existing.branchId, 
            "Price Update Executed", 
            `Price for ${existing.product.name} directly updated to ${sellingPrice} by ${user.role}.`, 
            log.id,
            undefined, // No approval ID for auto-approved
            CriticalAction.PRICE_UPDATE
          );
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
          resourceId: existing.id,
          severity: Severity.MEDIUM,
          description: `Requested price update for ${existing.product.name} (SKU: ${existing.product.sku}) to ${sellingPrice}`,
          requestId,
          ipAddress,
          deviceInfo,
          approvalId: approvalReq.id, // GAP CLOSED: Tied log structurally to approval
          before: { sellingPrice: oldSellingPrice },
          after: { requestedPrice: Number(sellingPrice) } // Removed approvalRequestId from JSON body payload as it is mapped natively
        });
        
        await notifyManagement(
          tx, 
          orgId, 
          existing.branchId, 
          "Price Update Approval Required", 
          `User ${user.id} (${user.role}) has requested a price change for ${existing.product.name}.`, 
          log.id,
          approvalReq.id, // GAP CLOSED: Notifies directly via the Approval relation
          CriticalAction.PRICE_UPDATE // GAP CLOSED: Adds actionable hook for UI filter
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
      newPrice: result.branchProduct.sellingPrice ? Number(result.branchProduct.sellingPrice) : null,
      approvalPending: !!result.approvalReq,
      message: result.approvalReq 
        ? "Thresholds updated successfully. The requested price change has been securely forwarded for managerial approval."
        : "Inventory parameters updated and securely logged."
    });

  } catch (error: any) {
    console.error("[FORTRESS_PATCH_ERROR]", error);
    return NextResponse.json({ error: "Failed to commit inventory adjustments" }, { status: 500 });
  }
}