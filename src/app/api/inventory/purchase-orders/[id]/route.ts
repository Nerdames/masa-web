// /app/api/inventory/purchase-orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import crypto from "crypto";
import { z } from "zod";
import { Prisma, POStatus, ActorType, Severity, Role } from "@prisma/client";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, "10 s"),
});

const patchPOSchema = z.object({
  status: z.literal(POStatus.CANCELLED),
});

/**
 * Generates a SHA-256 hash for audit log chaining.
 */
function generateHash(data: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

/**
 * PATCH /api/inventory/purchase-orders/[id]
 * Specifically handles the VOID/CANCEL action for a Purchase Order.
 */
export async function PATCH(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: poId } = await params;

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent") ?? "unknown";
    const requestId = crypto.randomUUID();

    // 1. Rate Limiting
    const { success: limitOk } = await ratelimit.limit(`po_patch:${ipAddress}`);
    if (!limitOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    // 2. Auth Check
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = session.user.organizationId;
    const actorId = session.user.id;
    const actorRole = session.user.role as Role;

    // 3. Payload Validation
    const body = await req.json();
    const parsed = patchPOSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // 4. Transaction with Serializable Isolation
    return await prisma.$transaction(async (tx) => {
      const existingPO = await tx.purchaseOrder.findUnique({
        where: { 
          id: poId, 
          organizationId: orgId 
        },
        include: { items: true },
      });

      if (!existingPO) throw new Error("Purchase Order not found");
      
      // Business Logic Validation
      if (existingPO.status === POStatus.CANCELLED) {
        throw new Error("Purchase order is already cancelled.");
      }
      
      // Prevent voiding if goods have already started arriving
      const protectedStatuses: string[] = [POStatus.FULFILLED, "PARTIALLY_RECEIVED"];
      if (protectedStatuses.includes(existingPO.status)) {
        throw new Error("Cannot void a PO that has already been partially or fully received.");
      }

      // Apply Status Change
      const updatedPO = await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: POStatus.CANCELLED },
      });

      // 5. Forensic Audit Log Entry
      const lastLog = await tx.activityLog.findFirst({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        select: { hash: true },
      });
      const previousHash = lastLog?.hash ?? "0".repeat(64);

      const logPayload: Record<string, unknown> = {
        action: "VOID_PURCHASE_ORDER",
        organizationId: orgId,
        branchId: existingPO.branchId,
        actorId,
        actorRole,
        targetId: poId,
        targetType: "PURCHASE_ORDER",
        previousHash,
        requestId,
        timestamp: Date.now(),
      };

      await tx.activityLog.create({
        data: {
          organizationId: orgId,
          branchId: existingPO.branchId,
          actorId,
          actorType: ActorType.USER,
          action: "VOID_PURCHASE_ORDER",
          targetId: poId,
          targetType: "PURCHASE_ORDER",
          severity: Severity.HIGH,
          description: `Voided Purchase Order ${existingPO.poNumber}`,
          requestId,
          previousHash,
          hash: generateHash(logPayload),
          metadata: {
            ipAddress,
            deviceInfo,
            before: existingPO as unknown as Prisma.JsonValue,
            after: updatedPO as unknown as Prisma.JsonValue,
          } as Prisma.JsonObject,
        },
      });

      return NextResponse.json({ 
        success: true, 
        id: updatedPO.id, 
        status: updatedPO.status 
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000,
    });

  } catch (err: unknown) {
    console.error("[PATCH_PO_FATAL]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}