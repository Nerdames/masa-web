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

function generateHash(data: any): string {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

/**
 * PATCH /api/inventory/purchase-orders/[id]
 * Specifically handles the VOID/CANCEL action for a Purchase Order.
 */
export async function PATCH(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string }> } // params is now a Promise in Next.js 15+
) {
  try {
    // 1. Unwrap the dynamic route parameters
    const { id: poId } = await params;

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent") ?? "unknown";
    const requestId = crypto.randomUUID();

    // 2. Rate Limiting
    const { success: limitOk } = await ratelimit.limit(`po_patch:${ipAddress}`);
    if (!limitOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    // 3. Auth Check
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = session.user.organizationId;
    const actorId = session.user.id;

    // 4. Payload Validation
    const body = await req.json();
    const parsed = patchPOSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    // 5. Transaction with Serializable Isolation for Ledger Integrity
    return await prisma.$transaction(async (tx) => {
      // Fetch current PO state within transaction to prevent race conditions
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
      if (existingPO.status === POStatus.FULFILLED || existingPO.status === POStatus.PARTIALLY_RECEIVED) {
        throw new Error("Cannot void a PO that has already been partially or fully received.");
      }

      // Apply Status Change
      const updatedPO = await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: POStatus.CANCELLED },
      });

      // 6. Forensic Audit Log Entry (Fortress Logic)
      const lastLog = await tx.activityLog.findFirst({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        select: { hash: true },
      });
      const previousHash = lastLog?.hash ?? "GENESIS";

      const logData = {
        action: "VOID_PURCHASE_ORDER",
        organizationId: orgId,
        branchId: existingPO.branchId,
        actorId,
        actorRole: session.user.role as Role,
        targetId: poId,
        targetType: "PURCHASE_ORDER",
        previousHash,
        requestId,
      };

      await tx.activityLog.create({
        data: {
          ...logData,
          description: `Voided Purchase Order ${existingPO.poNumber}`,
          actorType: ActorType.USER,
          critical: true,
          severity: Severity.HIGH,
          ipAddress,
          deviceInfo,
          before: existingPO as unknown as Prisma.InputJsonValue,
          after: updatedPO as unknown as Prisma.InputJsonValue,
          hash: generateHash(logData),
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

  } catch (err: any) {
    console.error("[PATCH_PO_FATAL]", err);
    if (err.message) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}