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
import crypto from "crypto";
import { authorize, RESOURCES } from "@/core/lib/permission";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/* -------------------------
  Security & Rate Limiting
------------------------- */
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, "10 s"),
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
        // If not admin/manager, restrict to user's branch
        branchId: [Role.ADMIN, Role.MANAGER, Role.AUDITOR].includes(user.role) || user.isOrgOwner 
          ? undefined 
          : (user.branchId ?? undefined),
      },
      include: {
        vendor: true,
        branch: { select: { name: true } },
        items: {
          include: {
            product: {
              select: { name: true, sku: true, barcode: true, uom: true }
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------------
  PATCH /api/inventory/procurement/[id]
  (Void / Cancel Logic)
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
    const { success: limitOk } = await ratelimit.limit(`po_void:${ipAddress}`);
    if (!limitOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    // 2. Auth Check
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as AuthenticatedUser;

    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.VOID, // Explicit check for VOID/CANCEL capability
      resource: RESOURCES.PROCUREMENT,
    });

    if (!auth.allowed) {
      return NextResponse.json({ error: "Insufficient permissions to void procurement" }, { status: 403 });
    }

    // 3. Payload Validation
    const body = await req.json().catch(() => ({}));
    if (body.status !== POStatus.CANCELLED) {
      return NextResponse.json({ error: "Invalid operation. Use this endpoint for cancellation." }, { status: 400 });
    }

    // 4. Atomic Transaction
    const result = await prisma.$transaction(async (tx) => {
      const existingPO = await tx.purchaseOrder.findFirst({
        where: { id: poId, organizationId: user.organizationId },
        include: { items: true }
      });

      if (!existingPO) throw new Error("PO_NOT_FOUND");
      
      // Business Rules Check
      if (existingPO.status === POStatus.CANCELLED) throw new Error("PO_ALREADY_CANCELLED");
      
      const irreversibleStatuses: POStatus[] = [
        POStatus.FULFILLED, 
        POStatus.PARTIALLY_RECEIVED
      ];

      if (irreversibleStatuses.includes(existingPO.status)) {
        throw new Error("CANNOT_CANCEL_RECEIVED_GOODS");
      }

      // Update PO Status
      const updatedPO = await tx.purchaseOrder.update({
        where: { id: poId },
        data: { 
          status: POStatus.CANCELLED,
          notes: body.reason ? `${existingPO.notes || ''}\n[VOID REASON]: ${body.reason}`.trim() : existingPO.notes
        },
      });

      // 5. Forensic Audit
      await createAuditLog(tx, {
        organizationId: user.organizationId,
        branchId: existingPO.branchId,
        actorId: user.id,
        actorRole: user.role,
        action: "VOID_PURCHASE_ORDER",
        resourceId: poId,
        severity: Severity.HIGH,
        description: `Voided Purchase Order ${existingPO.poNumber}. Reason: ${body.reason || 'Not specified'}`,
        requestId,
        ipAddress,
        deviceInfo,
        before: { status: existingPO.status },
        after: { status: updatedPO.status },
      });

      return updatedPO;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000,
    });

    return NextResponse.json({ success: true, status: result.status });

  } catch (err: any) {
    console.error("[PO_VOID_ERROR]", err);
    
    const errorMap: Record<string, { m: string; s: number }> = {
      PO_NOT_FOUND: { m: "Purchase Order not found", s: 404 },
      PO_ALREADY_CANCELLED: { m: "This order is already cancelled", s: 400 },
      CANNOT_CANCEL_RECEIVED_GOODS: { m: "Cannot cancel an order that has been fulfilled or partially received", s: 403 },
    };

    const errorInfo = errorMap[err.message] || { m: "Internal server error", s: 500 };
    return NextResponse.json({ error: errorInfo.m }, { status: errorInfo.s });
  }
}