import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import {
  PermissionAction,
  ActorType,
  Severity,
  Prisma,
  POStatus,
  Role,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import crypto from "crypto";
import { authorize, RESOURCES } from "@/core/lib/permission";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/* -------------------------
  Security & Rate Limiting
------------------------- */
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(30, "10 s"),
});

interface AuthenticatedUser {
  id: string;
  organizationId: string;
  branchId: string | null;
  role: Role;
  isOrgOwner: boolean;
}

/* -------------------------
  Forensic Audit Engine
------------------------- */
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
      targetType: "PURCHASE_ORDER",
      targetId: data.resourceId,
      severity: data.severity ?? Severity.MEDIUM,
      description: data.description,
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

/* -------------------------
  GET /api/inventory/procurement/[id]
------------------------- */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as AuthenticatedUser;

    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.READ,
      resource: RESOURCES.PROCUREMENT,
    });

    if (!auth.allowed) return NextResponse.json({ error: "Access Denied" }, { status: 403 });

    const po = await prisma.purchaseOrder.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        deletedAt: null,
        // Branch isolation for non-admins
        branchId: [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role) || user.isOrgOwner 
          ? undefined 
          : (user.branchId ?? undefined),
      },
      include: {
        vendor: true,
        branch: { select: { name: true } },
        items: {
          include: {
            product: {
              select: { name: true, sku: true, barcode: true, uom: { select: { name: true, abbreviation: true } } }
            }
          }
        },
        createdBy: { select: { name: true, role: true } },
        approvedBy: { select: { name: true, role: true } },
      },
    });

    if (!po) return NextResponse.json({ error: "Purchase Order not found" }, { status: 404 });

    return NextResponse.json(po);
  } catch (err) {
    console.error("[PO_GET_BY_ID_ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------------
  PATCH /api/inventory/procurement/[id]
  (Dynamic Logic for Edits, Issuing, and Voiding)
------------------------- */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: poId } = await params;
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";
    const requestId = crypto.randomUUID();

    // 1. Rate Limiting
    const { success: limitOk } = await ratelimit.limit(`po_update:${ipAddress}`);
    if (!limitOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    // 2. Auth Check
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as AuthenticatedUser;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const { status: requestedStatus, items: updatedItems, vendorId, expectedDate, notes, reason } = body;

    // 3. Process Transaction
    const result = await prisma.$transaction(async (tx) => {
      const existingPO = await tx.purchaseOrder.findFirst({
        where: { id: poId, organizationId: user.organizationId },
        include: { items: true }
      });

      if (!existingPO) throw new Error("PO_NOT_FOUND");

      // --- SCENARIO A: VOID/CANCEL ---
      if (requestedStatus === POStatus.CANCELLED) {
        if (!authorize({ role: user.role, isOrgOwner: user.isOrgOwner, action: PermissionAction.VOID, resource: RESOURCES.PROCUREMENT }).allowed) {
          throw new Error("UNAUTHORIZED_VOID");
        }
        if ([POStatus.FULFILLED, POStatus.PARTIALLY_RECEIVED].includes(existingPO.status)) {
          throw new Error("CANNOT_VOID_RECEIVED_GOODS");
        }

        const voided = await tx.purchaseOrder.update({
          where: { id: poId },
          data: { 
            status: POStatus.CANCELLED,
            notes: reason ? `${existingPO.notes || ''}\n[VOID REASON]: ${reason}`.trim() : existingPO.notes
          },
        });

        await createAuditLog(tx, {
          organizationId: user.organizationId,
          branchId: existingPO.branchId,
          actorId: user.id,
          actorRole: user.role,
          action: "VOID_PURCHASE_ORDER",
          resourceId: poId,
          severity: Severity.HIGH,
          description: `Voided PO ${existingPO.poNumber}. Reason: ${reason || 'Not specified'}`,
          requestId, ipAddress, deviceInfo,
          before: { status: existingPO.status },
          after: { status: POStatus.CANCELLED }
        });

        return voided;
      }

      // --- SCENARIO B: EDITING DRAFT OR ISSUING ---
      if (existingPO.status !== POStatus.DRAFT && requestedStatus !== POStatus.CANCELLED) {
        throw new Error("LOCKED_FOR_EDITING");
      }

      let finalTotal = new Decimal(existingPO.totalAmount.toString());
      let updateData: Prisma.PurchaseOrderUpdateInput = {
        notes: notes ?? existingPO.notes,
        expectedDate: expectedDate ? new Date(expectedDate) : existingPO.expectedDate,
        vendorId: vendorId ?? existingPO.vendorId,
      };

      // Handle Item Updates (Only if in Draft)
      if (Array.isArray(updatedItems)) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: poId } });
        
        let newTotal = new Decimal(0);
        const itemCreates = [];

        for (const item of updatedItems) {
          const unitCost = new Decimal(item.unitCost);
          const qty = new Decimal(item.quantityOrdered);
          const lineTotal = unitCost.mul(qty);
          newTotal = newTotal.add(lineTotal);

          itemCreates.push({
            productId: item.productId,
            quantityOrdered: item.quantityOrdered,
            unitCost: unitCost,
            totalCost: lineTotal
          });
        }
        
        updateData.items = { create: itemCreates };
        updateData.totalAmount = newTotal;
        finalTotal = newTotal;
      }

      // Handle Transition to ISSUED
      if (requestedStatus === POStatus.ISSUED) {
        updateData.status = POStatus.ISSUED;
        updateData.approvedById = user.id; // Record who issued/locked the PO
      }

      const updated = await tx.purchaseOrder.update({
        where: { id: poId },
        data: updateData,
      });

      await createAuditLog(tx, {
        organizationId: user.organizationId,
        branchId: existingPO.branchId,
        actorId: user.id,
        actorRole: user.role,
        action: requestedStatus === POStatus.ISSUED ? "ISSUE_PURCHASE_ORDER" : "UPDATE_PURCHASE_ORDER",
        resourceId: poId,
        description: `${requestedStatus === POStatus.ISSUED ? 'Issued' : 'Updated'} PO ${existingPO.poNumber}. Total: ${finalTotal.toFixed(2)}`,
        requestId, ipAddress, deviceInfo,
        before: { status: existingPO.status, total: existingPO.totalAmount.toString() },
        after: { status: updated.status, total: finalTotal.toString() }
      });

      return updated;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 15000
    });

    return NextResponse.json({ success: true, data: result });

  } catch (err: any) {
    console.error("[PO_PATCH_ERROR]", err);
    
    const errorMap: Record<string, { m: string; s: number }> = {
      PO_NOT_FOUND: { m: "Purchase order not found", s: 404 },
      UNAUTHORIZED_VOID: { m: "Insufficient permissions to void", s: 403 },
      CANNOT_VOID_RECEIVED_GOODS: { m: "Cannot void an order already in the receiving process", s: 400 },
      LOCKED_FOR_EDITING: { m: "This PO is Issued or Fulfilled and cannot be edited. You must Void it or use GRN for receiving.", s: 422 },
    };

    const info = errorMap[err.message] || { m: err.message || "Internal server error", s: 500 };
    return NextResponse.json({ error: info.m }, { status: info.s });
  }
}