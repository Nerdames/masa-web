import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import {
  PermissionAction,
  ActorType,
  Severity,
  Prisma,
  GRNStatus,
  POStatus,
  Role,
  NotificationType,
  StockMovementType
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import crypto from "crypto";
import { authorize, RESOURCES } from "@/core/lib/permission";

/* -------------------------
  ROUTE SEGMENT CONFIG 
------------------------- */
// Replaces the deprecated `export const config = { matcher: ... }`
export const dynamic = "force-dynamic";

/* -------------------------
  Interfaces & Types
------------------------- */
interface MasaUser {
  id: string;
  role: Role;
  organizationId: string;
  branchId: string | null;
  isOrgOwner: boolean;
  permissions: string[]; 
}

interface GRNItemInput {
  productId: string;
  poItemId?: string;
  unitCost: number;
  quantityAccepted: number;
  quantityRejected: number;
}

/* -------------------------
  Helpers & Config
------------------------- */
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const EXPORT_LIMIT = 10000;

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

function generateGRNNumber(branchId?: string | null): string {
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  const branchPart = branchId ? branchId.slice(0, 4).toUpperCase() : "ORG";
  return `GRN-${branchPart}-${suffix}`;
}

async function canExport(user: MasaUser): Promise<boolean> {
  if (user.isOrgOwner) return true;
  const hasExportPerm = user.permissions.includes(`${PermissionAction.EXPORT}:${RESOURCES.PROCUREMENT}`);
  if (hasExportPerm) return true;
  return [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role);
}

/* -------------------------
  GET /api/inventory/grns
------------------------- */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const user = session.user as MasaUser;
    const { searchParams } = new URL(req.url);
    const meta = searchParams.get("meta");
    const orgId = user.organizationId;
    
    const isGlobalViewer = [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role) || user.isOrgOwner;
    const branchIdParam = searchParams.get("branchId");
    const branchId = isGlobalViewer ? branchIdParam : (user.branchId || branchIdParam);

    // --- META DROPDOWNS ---
    if (meta) {
      if (meta === "vendors") {
        const items = await prisma.vendor.findMany({
          where: { organizationId: orgId, deletedAt: null },
          select: { id: true, name: true, email: true, phone: true },
          orderBy: { name: "asc" },
        });
        return NextResponse.json({ items });
      }

      if (meta === "purchase-orders") {
        const items = await prisma.purchaseOrder.findMany({
          where: { 
            organizationId: orgId, 
            status: { in: [POStatus.ISSUED, POStatus.PARTIALLY_RECEIVED] } 
          },
          select: { id: true, poNumber: true, vendorId: true, branchId: true, currency: true },
          orderBy: { createdAt: "desc" },
        });
        return NextResponse.json({ items });
      }
      return NextResponse.json({ error: "Unknown meta type" }, { status: 400 });
    }

    // --- MAIN QUERY ---
    const page = parseIntSafe(searchParams.get("page"), 1);
    const limit = Math.min(parseIntSafe(searchParams.get("limit"), DEFAULT_LIMIT), MAX_LIMIT);
    const search = searchParams.get("search")?.trim() || null;
    const status = searchParams.get("status") || null;
    const from = parseDateSafe(searchParams.get("from"));
    const to = parseDateSafe(searchParams.get("to"));
    const poId = searchParams.get("purchaseOrderId") || null;
    
    const exportAll = searchParams.get("export") === "true";
    if (exportAll && !(await canExport(user))) {
      return NextResponse.json({ error: "ACCESS_DENIED: Export authorization failed." }, { status: 403 });
    }

    const take = exportAll ? EXPORT_LIMIT : limit;
    const skip = exportAll ? 0 : (page - 1) * take;

    const where: Prisma.GoodsReceiptNoteWhereInput = { organizationId: orgId };
    if (branchId) where.branchId = branchId;
    if (poId) where.purchaseOrderId = poId;
    if (search) {
      where.OR = [
        { grnNumber: { contains: search, mode: "insensitive" } },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
        { purchaseOrder: { poNumber: { contains: search, mode: "insensitive" } } }
      ];
    }
    if (status && status !== "all") where.status = status as GRNStatus;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    const [items, total] = await Promise.all([
      prisma.goodsReceiptNote.findMany({
        where,
        include: {
          vendor: { select: { id: true, name: true, email: true, phone: true } },
          purchaseOrder: { select: { poNumber: true, currency: true } },
          receivedBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
          items: { 
            include: { 
              product: { 
                select: { 
                  name: true, sku: true, 
                  uom: { select: { name: true, abbreviation: true } }
                } 
              } 
            } 
          }
        },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.goodsReceiptNote.count({ where }),
    ]);

    if (exportAll) {
      const header = ["GRN Number", "Date", "Vendor", "PO Ref", "Status", "Items Count", "Received By"];
      const rows = items.map((it) => [
        it.grnNumber,
        it.receivedAt.toISOString(),
        it.vendor?.name || "N/A",
        it.purchaseOrder?.poNumber || "Direct",
        it.status,
        String(it.items.length),
        it.receivedBy?.name || "System"
      ]);
      const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="grns_${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({ items, total, page, limit: take });
  } catch (err) {
    console.error("[GRN_GET_ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------------
  POST /api/inventory/grns
------------------------- */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const user = session.user as MasaUser;
    const orgId = user.organizationId;
    
    const requestId = crypto.randomUUID();
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    // 1. Verify Create Permissions
    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.CREATE,
      resource: RESOURCES.PROCUREMENT,
    });
    if (!auth.allowed) return NextResponse.json({ error: "ACCESS_DENIED: Insufficient permissions." }, { status: 403 });

    // 2. Determine Auto-Approval Rights
    const canApprove = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.APPROVE,
      resource: RESOURCES.PROCUREMENT,
    }).allowed;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const { 
      branchId: bodyBranchId, 
      vendorId: bodyVendorId, 
      purchaseOrderId, 
      receivedAt, 
      notes, 
      items: rawItems 
    } = body;

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json({ error: "GRN must contain at least one item." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      let branchId = bodyBranchId || user.branchId;
      let vendorId = bodyVendorId;
      let po = null;

      // 3. Resolve Purchase Order context if applicable
      if (purchaseOrderId) {
        po = await tx.purchaseOrder.findUnique({ 
          where: { id: purchaseOrderId },
          include: { items: true } 
        });
        if (!po) throw new Error("Linked Purchase Order not found.");
        if (po.status === POStatus.CANCELLED || po.status === POStatus.FULFILLED) {
            throw new Error(`Cannot receive items for a PO in ${po.status} status.`);
        }
        branchId = po.branchId;
        vendorId = po.vendorId;
      }

      if (!branchId) throw new Error("Target branch is required.");
      if (!vendorId) throw new Error("Vendor is required.");

      const typedRawItems = rawItems as GRNItemInput[];
      const productIds = typedRawItems.map((it) => it.productId);
      
      const baseProducts = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, uomId: true }
      });
      const productMap = new Map(baseProducts.map(p => [p.id, p]));

      const grnNumber = generateGRNNumber(branchId);
      const targetStatus = canApprove ? GRNStatus.RECEIVED : GRNStatus.PENDING;
      
      // 4. Create GRN Node
      const grn = await tx.goodsReceiptNote.create({
        data: {
          organizationId: orgId,
          branchId,
          vendorId,
          purchaseOrderId: purchaseOrderId || null,
          grnNumber,
          status: targetStatus,
          receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
          receivedById: user.id,
          approvedById: canApprove ? user.id : null,
          notes: notes || null,
        },
        include: { vendor: { select: { name: true } } }
      });

      // 5. Process Items & Handle Auto-Approval Logistics
      for (const it of typedRawItems) {
        const itemCost = new Decimal(it.unitCost || 0);
        const qtyAccepted = Number(it.quantityAccepted || 0);
        const qtyRejected = Number(it.quantityRejected || 0);
        const baseProduct = productMap.get(it.productId);

        if (!baseProduct) throw new Error(`Product ${it.productId} not found.`);

        // 5a. Upsert Branch Product
        // If auto-approving, immediately update the physical stock count.
        const branchProduct = await tx.branchProduct.upsert({
          where: { branchId_productId: { branchId, productId: it.productId } },
          update: canApprove ? { 
            stock: { increment: qtyAccepted }, 
            costPrice: itemCost, // SOP: Updates average/latest cost price upon receipt
            lastRestockedAt: new Date()
          } : {}, 
          create: {
            organizationId: orgId,
            branchId,
            productId: it.productId,
            vendorId,
            stock: canApprove ? qtyAccepted : 0, 
            costPrice: itemCost,
            reorderLevel: 0,
            safetyStock: 0,
            uomId: baseProduct.uomId 
          }
        });

        // 5b. Write GRN Item
        const grnItem = await tx.goodsReceiptItem.create({
          data: {
            grnId: grn.id,
            productId: it.productId,
            branchProductId: branchProduct.id,
            poItemId: it.poItemId || null,
            quantityAccepted: qtyAccepted,
            quantityRejected: qtyRejected,
            unitCost: itemCost
          }
        });

        // 5c. IF APPROVED: Write Forensic Ledger (Stock Movement) & PO Item update
        if (canApprove && qtyAccepted > 0) {
          const movementTotal = itemCost.mul(qtyAccepted);

          await tx.stockMovement.create({
            data: {
              organizationId: orgId,
              branchId,
              branchProductId: branchProduct.id,
              productId: it.productId,
              type: StockMovementType.IN,
              quantity: qtyAccepted,
              unitCost: itemCost,
              totalCost: movementTotal,
              reason: `GRN Received: ${grn.grnNumber}`,
              runningBalance: branchProduct.stock, // Post-update balance from upsert
              handledById: user.id,
              approvedAt: new Date(),
              grnId: grn.id
            }
          });

          if (it.poItemId) {
            await tx.purchaseOrderItem.update({
              where: { id: it.poItemId },
              data: { quantityReceived: { increment: qtyAccepted } }
            });
          }
        }
      }

      // 6. IF APPROVED: Cascade PO Status (The Core Gap Fix)
      if (canApprove && purchaseOrderId && po) {
        const updatedPoItems = await tx.purchaseOrderItem.findMany({ 
          where: { purchaseOrderId } 
        });

        // Validation Math: Are all items completely fulfilled?
        const allFulfilled = updatedPoItems.every(i => i.quantityReceived >= i.quantityOrdered);
        const anyReceived = updatedPoItems.some(i => i.quantityReceived > 0);

        let newPoStatus = po.status;
        if (allFulfilled) {
          newPoStatus = POStatus.FULFILLED;
        } else if (anyReceived) {
          newPoStatus = POStatus.PARTIALLY_RECEIVED;
        }

        if (newPoStatus !== po.status) {
          await tx.purchaseOrder.update({
            where: { id: purchaseOrderId },
            data: { status: newPoStatus }
          });
        }
      }

      // 7. Audit & Cryptographic Chain
      const lastLog = await tx.activityLog.findFirst({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        select: { hash: true },
      });
      const previousHash = lastLog?.hash ?? "0".repeat(64);
      const timestamp = Date.now();
      const actionName = canApprove ? "RECEIVE_GRN_APPROVED" : "CREATE_GRN_PENDING";
      
      const hashPayload = JSON.stringify({ previousHash, requestId, actorId: user.id, action: actionName, targetId: grn.id, timestamp });
      const hash = crypto.createHash("sha256").update(hashPayload).digest("hex");

      const log = await tx.activityLog.create({
        data: {
          organizationId: orgId,
          branchId,
          actorId: user.id,
          actorType: ActorType.USER,
          actorRole: user.role,
          action: actionName,
          targetType: "GRN",
          targetId: grn.id,
          severity: canApprove ? Severity.HIGH : Severity.MEDIUM,
          description: canApprove 
            ? `GRN ${grn.grnNumber} Auto-Approved. Inventory incremented & PO updated.` 
            : `Pending Receipt Created: ${grn.grnNumber}. Awaiting manager approval.`,
          requestId, ipAddress, deviceInfo, previousHash, hash, critical: canApprove,
        },
      });

      // 8. Notifications (Only if Pending)
      if (!canApprove) {
        const targets = await tx.authorizedPersonnel.findMany({
          where: { organizationId: orgId, deletedAt: null, disabled: false, OR: [{ role: Role.ADMIN }, { role: Role.MANAGER }, { role: Role.AUDITOR }, { isOrgOwner: true }] },
          select: { id: true },
        });

        if (targets.length > 0) {
          await tx.notification.create({
            data: {
              organizationId: orgId,
              branchId,
              type: NotificationType.APPROVAL,
              title: "GRN Approval Required",
              message: `Receipt ${grnNumber} from ${grn.vendor?.name || 'Vendor'} requires your approval to restock inventory.`,
              activityLogId: log.id,
              recipients: { create: targets.map((t) => ({ personnelId: t.id })) },
            },
          });
        }
      }

      return { grn, autoApproved: canApprove };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 15000
    });

    return NextResponse.json({ 
      success: true, 
      id: result.grn.id, 
      grnNumber: result.grn.grnNumber,
      status: result.grn.status,
      message: result.autoApproved 
        ? "Items received successfully. Inventory and PO have been updated." 
        : "Draft GRN created. Awaiting approval."
    }, { status: 201 });

  } catch (err: unknown) {
    console.error("[GRN_POST_ERROR]", err);
    const message = err instanceof Error ? err.message : "Failed to process receipt.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}