import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { ActorType, Severity, Prisma } from "@prisma/client";
import crypto from "crypto";

// Helper for Forensic Audit Logging
async function createAuditLog(tx: Prisma.TransactionClient, data: any) {
  const lastLog = await tx.activityLog.findFirst({
    where: { organizationId: data.organizationId },
    orderBy: { createdAt: "desc" },
    select: { hash: true },
  });
  
  const previousHash = lastLog?.hash ?? "0".repeat(64);
  const logPayload = JSON.stringify({
    action: data.action,
    actorId: data.actorId,
    targetId: data.targetId,
    requestId: data.requestId,
    previousHash,
    timestamp: Date.now(),
  });

  const hash = crypto.createHash("sha256").update(logPayload).digest("hex");

  return tx.activityLog.create({
    data: { 
      ...data, 
      actorType: ActorType.USER, 
      previousHash, 
      hash, 
      critical: data.severity === Severity.HIGH || data.severity === Severity.CRITICAL 
    }
  });
}

/**
 * GET: Fetch all UOMs for the organization
 * Wrapped in { data: [] } to match frontend fetch logic
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;

    const uoms = await prisma.unitOfMeasure.findMany({
      where: { 
        organizationId: user.organizationId,
        active: true // Only return active units for selection
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ data: uoms });
  } catch (error) {
    console.error("[UOM_GET]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST: Create new UOM
 */
export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";
    const body = await req.json();

    const result = await prisma.$transaction(async (tx) => {
      const uom = await tx.unitOfMeasure.create({
        data: {
          name: body.name,
          abbreviation: body.abbreviation,
          active: body.active ?? true,
          organizationId: user.organizationId,
        },
      });

      await createAuditLog(tx, {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.role,
        action: "CREATE_UOM",
        targetType: "UNIT_OF_MEASURE",
        targetId: uom.id,
        severity: Severity.LOW,
        description: `Created UOM: ${uom.abbreviation}`,
        requestId,
        ipAddress,
        deviceInfo,
        after: uom,
      });

      return uom;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

/**
 * PATCH: Update existing UOM
 */
export async function PATCH(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";
    const body = await req.json();

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.unitOfMeasure.findUnique({ 
        where: { id: body.id, organizationId: user.organizationId } 
      });

      if (!existing) throw new Error("Unit of Measure not found");

      const updated = await tx.unitOfMeasure.update({
        where: { id: body.id },
        data: { 
          name: body.name, 
          abbreviation: body.abbreviation, 
          active: body.active 
        },
      });

      await createAuditLog(tx, {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.role,
        action: "UPDATE_UOM",
        targetType: "UNIT_OF_MEASURE",
        targetId: updated.id,
        severity: Severity.LOW,
        description: `Updated UOM: ${updated.abbreviation}`,
        requestId,
        ipAddress,
        deviceInfo,
        before: existing,
        after: updated,
      });

      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ data: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

/**
 * DELETE: Remove UOM (Hard Delete)
 */
export async function DELETE(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";
    
    const body = await req.json();
    const ids = Array.isArray(body.ids) ? body.ids : [body.id];

    await prisma.$transaction(async (tx) => {
      const existing = await tx.unitOfMeasure.findMany({ 
        where: { id: { in: ids }, organizationId: user.organizationId } 
      });
      
      await tx.unitOfMeasure.deleteMany({
        where: { id: { in: ids }, organizationId: user.organizationId }
      });

      await createAuditLog(tx, {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.role,
        action: ids.length > 1 ? "BULK_DELETE_UOM" : "DELETE_UOM",
        targetType: "UNIT_OF_MEASURE",
        targetId: ids.join(","),
        severity: Severity.HIGH,
        description: `Permanently deleted ${ids.length} UOMs`,
        requestId,
        ipAddress,
        deviceInfo,
        before: existing,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}