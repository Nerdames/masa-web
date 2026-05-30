import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/infrastructure/auth/config"; // Infrastructure auth engine
import prisma from "@/infrastructure/prisma/client"; // Singleton database client
import {
  PermissionAction,
  Severity,
  Prisma,
  POStatus,
  Role,
  Resource,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import crypto from "crypto";
import { authorize, RESOURCES } from "@/server/permissions/enforcer"; // Server permissions engine
import { createAuditLog } from "@/modules/audit/server/audit.service"; // Enterprise module service
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* SECURITY & RATE LIMITING                                                   */
/* -------------------------------------------------------------------------- */
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
  permissions: string[];
}

/* -------------------------------------------------------------------------- */
/* ZOD VALIDATION (PATCH)                                                     */
/* -------------------------------------------------------------------------- */
// [FIX] Implemented strict PATCH validation to prevent invalid data injections
const updatePOSchema = z.object({
  status: z.nativeEnum(POStatus).optional(),
  vendorId: z.string().optional(),
  expectedDate: z.union([z.string(), z.date()]).nullish().transform(val => {
    if (!val) return undefined;
    const d = new Date(val);
    return isNaN(d.getTime()) ? undefined : d;
  }).optional(),
  notes: z.string().max(2000).optional(),
  reason: z.string().max(500).optional(), // Used for VOID action logging
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantityOrdered: z.coerce.number().int().positive(),
      unitCost: z.coerce.number().nonnegative()
    })
  ).optional()
});

/* -------------------------------------------------------------------------- */
/* GET /api/inventory/procurement/[id]                                        */
/* -------------------------------------------------------------------------- */
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
      resources: RESOURCES.PROCUREMENT,
      userPermissions: user.permissions,
    });

    if (!auth.allowed) return NextResponse.json({ error: "Access Denied" }, { status: 403 });

    const po = await prisma.purchaseOrder.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        deletedAt: null,
        // Branch isolation for non-global viewers
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

/* -------------------------------------------------------------------------- */
/* PATCH /api/inventory/procurement/[id]                                      */
/* (Dynamic Logic for Edits, Issuing, and Voiding)                            */
/* -------------------------------------------------------------------------- */
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

    // [FIX] Validating PATCH body
    const rawBody = await req.json().catch(() => null);
    if (!rawBody) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const parsedBody = updatePOSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      const errorMessages = parsedBody.error.issues.map(err => `${err.path.join('.')}: ${err.message}`).join(" | ");
      return NextResponse.json({ error: `Validation Failed - ${errorMessages}` }, { status: 400 });
    }

    const { status: requestedStatus, items: updatedItems, vendorId, expectedDate, notes, reason } = parsedBody.data;

    // 3. Process Transaction
    const result = await prisma.$transaction(async (tx) => {
      const existingPO = await tx.purchaseOrder.findFirst({
        where: { id: poId, organizationId: user.organizationId },
        include: { items: true }
      });

      if (!existingPO) throw new Error("PO_NOT_FOUND");

      // --- SCENARIO A: VOID/CANCEL ---
      if (requestedStatus === POStatus.CANCELLED) {
        const auth = authorize({ 
            role: user.role, 
            isOrgOwner: user.isOrgOwner, 
            action: PermissionAction.VOID, 
            resources: RESOURCES.PROCUREMENT,
            userPermissions: user.permissions
        });
        if (!auth.allowed) throw new Error("UNAUTHORIZED_VOID");
        
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
          action: "VOID_PURCHASE_ORDER",
          resource: Resource.PROCUREMENT,
          resourceId: poId,
          organizationId: user.organizationId,
          branchId: existingPO.branchId,
          actorId: user.id,
          actorRole: user.role,
          severity: Severity.HIGH,
          description: `Voided PO ${existingPO.poNumber}. Reason: ${reason || 'Not specified'}`,
          changes: { 
            from: { status: existingPO.status }, 
            to: { status: POStatus.CANCELLED } 
          },
          requestId, 
          ipAddress, 
          deviceInfo,
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
        expectedDate: expectedDate ?? existingPO.expectedDate,
        vendorId: vendorId ?? existingPO.vendorId,
      };

      // [FIX] Guarding against Empty Array vulnerability and processing valid items
      if (updatedItems && Array.isArray(updatedItems)) {
        if (updatedItems.length === 0) {
            throw new Error("EMPTY_ITEMS_ARRAY");
        }
        
        // Deleting old items because we have valid new ones to replace them with
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: poId } });
        
        let newTotal = new Decimal(0);
        const itemCreates = [];

        for (const item of updatedItems) {
          // [FIX] Round Decimals correctly to prevent float mismatches
          const unitCost = new Decimal(item.unitCost).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
          const qty = new Decimal(item.quantityOrdered);
          const lineTotal = unitCost.mul(qty).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
          
          newTotal = newTotal.add(lineTotal);

          itemCreates.push({
            productId: item.productId,
            quantityOrdered: item.quantityOrdered,
            unitCost: unitCost,
            totalCost: lineTotal
          });
        }
        
        updateData.items = { create: itemCreates };
        updateData.totalAmount = newTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        finalTotal = updateData.totalAmount;
      }

      // Handle Transition to ISSUED
      if (requestedStatus === POStatus.ISSUED) {
        updateData.status = POStatus.ISSUED;
        updateData.approvedById = user.id;
      }

      const updated = await tx.purchaseOrder.update({
        where: { id: poId },
        data: updateData,
      });

      await createAuditLog(tx, {
        action: requestedStatus === POStatus.ISSUED ? "ISSUE_PURCHASE_ORDER" : "UPDATE_PURCHASE_ORDER",
        resource: Resource.PROCUREMENT,
        resourceId: poId,
        organizationId: user.organizationId,
        branchId: existingPO.branchId,
        actorId: user.id,
        actorRole: user.role,
        severity: Severity.MEDIUM,
        description: `${requestedStatus === POStatus.ISSUED ? 'Issued' : 'Updated'} PO ${existingPO.poNumber}. Total: ${finalTotal.toFixed(2)}`,
        changes: { 
            from: { status: existingPO.status, total: existingPO.totalAmount.toString() }, 
            to: { status: updated.status, total: finalTotal.toString() } 
        },
        requestId, 
        ipAddress, 
        deviceInfo,
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
      EMPTY_ITEMS_ARRAY: { m: "You cannot remove all line items. A Purchase Order must have at least one product.", s: 400 }
    };

    const info = errorMap[err.message] || { m: err.message || "Internal server error", s: 500 };
    return NextResponse.json({ error: info.m }, { status: info.s });
  }
}