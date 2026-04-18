import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { ActorType, Severity, Prisma, Role } from "@prisma/client";
import crypto from "crypto";

/* -------------------------------------------------------------------------- */
/* FORENSIC AUDIT ENGINE (Aligned with Reference)                            */
/* -------------------------------------------------------------------------- */

async function createAuditLog(
  tx: Prisma.TransactionClient,
  data: {
    organizationId: string;
    actorId: string;
    actorRole: Role;
    action: string;
    targetId: string;
    targetType: string;
    severity: Severity;
    description: string;
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
      organizationId: data.organizationId,
      actorId: data.actorId,
      actorType: ActorType.USER,
      actorRole: data.actorRole,
      action: data.action,
      targetType: data.targetType,
      targetId: data.targetId,
      severity: data.severity,
      description: data.description,
      requestId: data.requestId,
      ipAddress: data.ipAddress,
      deviceInfo: data.deviceInfo,
      before: data.before ? (data.before as Prisma.InputJsonValue) : Prisma.JsonNull,
      after: data.after ? (data.after as Prisma.InputJsonValue) : Prisma.JsonNull,
      previousHash,
      hash,
      critical: data.severity === Severity.HIGH || data.severity === Severity.CRITICAL,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* HANDLERS                                                                   */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;

    const categories = await prisma.category.findMany({
      where: { 
        organizationId: user.organizationId,
        deletedAt: null 
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(categories);
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

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
      const category = await tx.category.create({
        data: {
          name: body.name,
          description: body.description,
          organizationId: user.organizationId,
          createdById: user.id,
        },
      });

      await createAuditLog(tx, {
        organizationId: user.organizationId,
        actorId: user.id, actorRole: user.role,
        action: "CREATE_CATEGORY", targetType: "CATEGORY", targetId: category.id,
        severity: Severity.LOW, description: `Created category: ${category.name}`,
        requestId, ipAddress, deviceInfo, after: category,
      });

      return category;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

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
      const existing = await tx.category.findUnique({ 
        where: { id: body.id, organizationId: user.organizationId } 
      });
      if (!existing) throw new Error("Category not found");

      const updated = await tx.category.update({
        where: { id: body.id },
        data: { name: body.name, description: body.description },
      });

      await createAuditLog(tx, {
        organizationId: user.organizationId,
        actorId: user.id, actorRole: user.role,
        action: "UPDATE_CATEGORY", targetType: "CATEGORY", targetId: updated.id,
        severity: Severity.LOW, description: `Updated category: ${updated.name}`,
        requestId, ipAddress, deviceInfo, before: existing, after: updated,
      });

      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";
    
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id"); // Single
    const body = await req.json().catch(() => ({})); 
    const ids = body.ids; // Multiple

    const targetIds = id ? [id] : ids;
    if (!targetIds || !targetIds.length) throw new Error("No IDs provided");

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.category.findMany({
        where: { id: { in: targetIds }, organizationId: user.organizationId }
      });

      // Soft Delete
      await tx.category.updateMany({
        where: { id: { in: targetIds }, organizationId: user.organizationId },
        data: { deletedAt: new Date() },
      });

      await createAuditLog(tx, {
        organizationId: user.organizationId,
        actorId: user.id, actorRole: user.role,
        action: targetIds.length > 1 ? "BULK_DELETE_CATEGORY" : "DELETE_CATEGORY",
        targetType: "CATEGORY", targetId: targetIds.join(","),
        severity: Severity.MEDIUM, 
        description: `Soft-deleted ${targetIds.length} categories`,
        requestId, ipAddress, deviceInfo, before: existing,
      });

      return { success: true, count: targetIds.length };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}