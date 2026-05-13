import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import {
  PermissionAction,
  Severity,
  Prisma,
  GRNStatus,
  POStatus,
  Role,
  NotificationType,
  StockMovementType,
  CriticalAction,
  ApprovalStatus,
  Resource
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import crypto from "crypto";
import { authorize, RESOURCES } from "@/core/lib/permission";
import { createAuditLog } from "@/core/lib/audit";

/* -------------------------
  ROUTE SEGMENT CONFIG 
------------------------- */
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
  poItemId?: string | null;
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

function generateGRNNumber(branchId: string): string {
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  const branchPart = branchId.slice(0, 4).toUpperCase();
  return `GRN-${branchPart}-${suffix}`;
}

async function canExport(user: MasaUser): Promise<boolean> {
  if (user.isOrgOwner) return true;
  const auth = authorize({
    role: user.role,
    isOrgOwner: user.isOrgOwner,
    action: PermissionAction.EXPORT,
    resources: RESOURCES.PROCUREMENT,
    userPermissions: user.permissions
  });
  return auth.allowed;
}

/* -------------------------
  GET /api/inventory/grns
------------------------- */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const user = session.user as MasaUser;
    
    // Authorization Check for Read Access
    const readAuth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.READ,
      resources: RESOURCES.PROCUREMENT,
      userPermissions: user.permissions
    });
    if (!readAuth.allowed) return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const meta = searchParams.get("meta");
    const orgId = user.organizationId;
    
    const isGlobalViewer = [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role) || user.isOrgOwner;
    const branchIdParam = searchParams.get("branchId");
    
    // Strict branch scoping to prevent cross-branch data leakage
    const branchId = isGlobalViewer ? (branchIdParam || undefined) : user.branchId;

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
            branchId, // Scoped to allowed branch
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
    const createAuth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.CREATE,
      resources: RESOURCES.PROCUREMENT,
      userPermissions: user.permissions
    });
    
    if (!createAuth.allowed) {
      return NextResponse.json({ error: "ACCESS_DENIED: Insufficient permissions." }, { status: 403 });
    }

    // 2. Determine Auto-Approval Rights (Does this user need a manager to approve the restock?)
    const canApprove = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.APPROVE,
      resources: RESOURCES.PROCUREMENT,
      userPermissions: user.permissions
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
      return NextResponse.json({ error: "GRN must contain at least one valid item." }, { status: 400 });
    }

    // Branch Spoofing Protection
    const isGlobalViewer = [Role.ADMIN, Role.MANAGER, Role.DEV].includes(user.role) || user.isOrgOwner;
    const targetBranchId = bodyBranchId || user.branchId;
    
    if (!targetBranchId) return NextResponse.json({ error: "Target branch is strictly required." }, { status: 400 });
    if (!isGlobalViewer && targetBranchId !== user.branchId) {
       return NextResponse.json({ error: "SECURITY_VIOLATION: Branch isolation constraint failed." }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      let vendorId = bodyVendorId;
      let po = null;

      // 3. Resolve & Secure Purchase Order context
      if (purchaseOrderId) {
        po = await tx.purchaseOrder.findUnique({ 
          where: { id: purchaseOrderId },
          include: { items: true } 
        });
        
        if (!po || po.organizationId !== orgId) throw new Error("Purchase Order not found or accessible.");
        if (po.branchId !== targetBranchId) throw new Error("PO does not belong to the target receiving branch.");
        if (po.status === POStatus.CANCELLED || po.status === POStatus.FULFILLED) {
            throw new Error(`Cannot receive items for a PO currently marked as ${po.status}.`);
        }
        vendorId = po.vendorId;
      }

      if (!vendorId) throw new Error("Vendor association is strictly required.");

      const typedRawItems = rawItems as GRNItemInput[];
      
      // Validation Check against negative amounts
      for (const item of typedRawItems) {
        if (item.quantityAccepted < 0 || item.quantityRejected < 0 || item.unitCost < 0) {
          throw new Error("Quantities and costs must be strictly positive numeric values.");
        }
      }

      const productIds = typedRawItems.map((it) => it.productId);
      const baseProducts = await tx.product.findMany({
        where: { id: { in: productIds }, organizationId: orgId },
        select: { id: true, uomId: true }
      });
      
      if (baseProducts.length !== productIds.length) {
        throw new Error("One or more products failed cross-reference validation.");
      }
      
      const productMap = new Map(baseProducts.map(p => [p.id, p]));

      // Ensure no PO Item spoofing
      if (po) {
        const validPoItemIds = new Set(po.items.map(i => i.id));
        for (const item of typedRawItems) {
           if (item.poItemId && !validPoItemIds.has(item.poItemId)) {
             throw new Error("PO Item ID mismatch detected. Security constraint failed.");
           }
        }
      }

      const grnNumber = generateGRNNumber(targetBranchId);
      const targetStatus = canApprove ? GRNStatus.RECEIVED : GRNStatus.PENDING;
      
      // 4. Create GRN Node
      const grn = await tx.goodsReceiptNote.create({
        data: {
          organizationId: orgId,
          branchId: targetBranchId,
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
      let totalReceivedCost = new Decimal(0);

      for (const it of typedRawItems) {
        const itemCost = new Decimal(it.unitCost || 0);
        const qtyAccepted = Number(it.quantityAccepted || 0);
        const qtyRejected = Number(it.quantityRejected || 0);
        const baseProduct = productMap.get(it.productId);

        if (!baseProduct) throw new Error(`Product mapping failed for ${it.productId}.`);

        // 5a. Upsert Branch Product
        const branchProduct = await tx.branchProduct.upsert({
          where: { branchId_productId: { branchId: targetBranchId, productId: it.productId } },
          update: canApprove ? { 
            stock: { increment: qtyAccepted }, 
            costPrice: itemCost, // SOP: Cost price averaging/updating on reception
            lastRestockedAt: new Date()
          } : {}, 
          create: {
            organizationId: orgId,
            branchId: targetBranchId,
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
          totalReceivedCost = totalReceivedCost.add(movementTotal);

          await tx.stockMovement.create({
            data: {
              organizationId: orgId,
              branchId: targetBranchId,
              branchProductId: branchProduct.id,
              productId: it.productId,
              type: StockMovementType.IN,
              quantity: qtyAccepted,
              unitCost: itemCost,
              totalCost: movementTotal,
              reason: `GRN Restock: ${grn.grnNumber}`,
              runningBalance: branchProduct.stock, // Assumes Upsert returned post-increment
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

      // 6. IF APPROVED: Cascade PO Status 
      if (canApprove && purchaseOrderId && po) {
        const updatedPoItems = await tx.purchaseOrderItem.findMany({ 
          where: { purchaseOrderId } 
        });

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

      let approvalReq = null;

      // 7. PENDING PROTOCOL: Create Approval Request
      if (!canApprove) {
         approvalReq = await tx.approvalRequest.create({
           data: {
             organizationId: orgId,
             branchId: targetBranchId,
             requesterId: user.id,
             actionType: CriticalAction.STOCK_ADJUST,
             status: ApprovalStatus.PENDING,
             requiredRole: Role.MANAGER,
             targetType: "GRN",
             targetId: grn.id,
             changes: { items: typedRawItems, totalValue: totalReceivedCost.toNumber() }
           }
         });
      }

      // 8. AUDIT & FORENSIC CHAINING
      const actionName = canApprove ? "RECEIVE_GRN_APPROVED" : "CREATE_GRN_PENDING";
      const severity = canApprove ? Severity.HIGH : Severity.MEDIUM;
      
      const log = await createAuditLog(tx, {
         action: actionName,
         resource: Resource.PROCUREMENT,
         resourceId: grn.id,
         organizationId: orgId,
         branchId: targetBranchId,
         actorId: user.id,
         actorRole: user.role,
         severity,
         critical: canApprove,
         description: canApprove 
            ? `GRN ${grn.grnNumber} Auto-Approved. Physical stock incremented by system.` 
            : `Pending Goods Receipt created: ${grn.grnNumber}. Awaiting manager review.`,
         changes: { to: { grn, items: typedRawItems, approvalRequestId: approvalReq?.id } },
         ipAddress,
         deviceInfo,
         requestId,
         actionTrigger: canApprove ? CriticalAction.STOCK_ADJUST : undefined,
         approvalId: approvalReq?.id
      });

      // 9. NOTIFICATION PIPELINE (For Pending GRNs)
      if (!canApprove && approvalReq) {
        const managers = await tx.authorizedPersonnel.findMany({
          where: { 
             organizationId: orgId, 
             deletedAt: null, 
             disabled: false, 
             OR: [{ role: Role.ADMIN }, { role: Role.MANAGER }, { role: Role.AUDITOR }, { isOrgOwner: true }] 
          },
          select: { id: true },
        });

        if (managers.length > 0) {
          await tx.notification.create({
            data: {
              organizationId: orgId,
              branchId: targetBranchId,
              type: NotificationType.APPROVAL,
              actionTrigger: CriticalAction.STOCK_ADJUST,
              title: "Stock Restock Approval Required",
              message: `GRN ${grnNumber} from ${grn.vendor?.name || 'Vendor'} requires authorization to update physical inventory count.`,
              activityLogId: log.id,
              approvalId: approvalReq.id,
              recipients: { create: managers.map((m) => ({ personnelId: m.id })) },
            },
          });
        }
      }

      return { grn, autoApproved: canApprove };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 15000 // Extended for high throughput ledger writes
    });

    return NextResponse.json({ 
      success: true, 
      id: result.grn.id, 
      grnNumber: result.grn.grnNumber,
      status: result.grn.status,
      message: result.autoApproved 
        ? "Items fully received. Inventory ledgers and Purchase Orders updated successfully." 
        : "Draft GRN created and staged. Awaiting Manager Approval to finalize stock adjustment."
    }, { status: 201 });

  } catch (err: unknown) {
    console.error("[GRN_POST_ERROR]", err);
    const message = err instanceof Error ? err.message : "Security Protocol or validation failed while processing goods receipt.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}