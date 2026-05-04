import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { ActorType, Severity, Prisma, Role, PreferenceScope, PreferenceCategory } from "@prisma/client";
import crypto from "crypto";

/* -------------------------------------------------------------------------- */
/* FORENSIC AUDIT ENGINE                                                      */
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
/* GET HANDLER (Fetch Org Configuration)                                     */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const user = session.user as any;

    if (user.role !== Role.ADMIN && !user.isOrgOwner) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    // Removed permission query from Promise.all
    const [org, uoms, taxRates, preferences] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { id: true, name: true, active: true, createdAt: true },
      }),
      prisma.unitOfMeasure.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { name: "asc" },
      }),
      prisma.taxRate.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { name: "asc" },
      }),
      prisma.preference.findMany({
        where: { organizationId: user.organizationId, scope: PreferenceScope.ORGANIZATION },
      }),
    ]);

    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    // Removed permissions from response payload
    return NextResponse.json({ org, uoms, taxRates, preferences });
  } catch (error: any) {
    console.error("[ORG_GET_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* PATCH HANDLER (Multiplexer)                                               */
/* -------------------------------------------------------------------------- */

export async function PATCH(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const user = session.user as any;
    if (user.role !== Role.ADMIN && !user.isOrgOwner) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";
    const body = await req.json();
    const { action, payload } = body;

    const result = await prisma.$transaction(async (tx) => {
      
      // 1. UPDATE ORGANIZATION PROFILE
      if (action === "UPDATE_PROFILE") {
        const existing = await tx.organization.findUnique({ where: { id: user.organizationId } });
        const updated = await tx.organization.update({
          where: { id: user.organizationId },
          data: { name: payload.name },
        });

        await createAuditLog(tx, {
          organizationId: user.organizationId,
          actorId: user.id, actorRole: user.role as Role,
          action: "UPDATE_ORG_PROFILE", targetType: "ORGANIZATION", targetId: updated.id,
          severity: Severity.MEDIUM,
          description: `Updated organization name to ${updated.name}`,
          requestId, ipAddress, deviceInfo, before: existing, after: updated,
        });
        return { success: true, data: updated };
      }

      // 2. UPSERT UNIT OF MEASURE
      if (action === "UPSERT_UOM") {
        const uom = payload.id 
          ? await tx.unitOfMeasure.update({ where: { id: payload.id }, data: { name: payload.name, abbreviation: payload.abbreviation, active: payload.active } })
          : await tx.unitOfMeasure.create({ data: { organizationId: user.organizationId, name: payload.name, abbreviation: payload.abbreviation, active: payload.active ?? true } });

        await createAuditLog(tx, {
          organizationId: user.organizationId,
          actorId: user.id, actorRole: user.role as Role,
          action: payload.id ? "UPDATE_UOM" : "CREATE_UOM",
          targetType: "UNIT_OF_MEASURE", targetId: uom.id,
          severity: Severity.LOW,
          description: `${payload.id ? "Updated" : "Created"} UoM: ${uom.abbreviation}`,
          requestId, ipAddress, deviceInfo, after: uom,
        });
        return { success: true, data: uom };
      }

      // 3. UPSERT TAX RATE
      if (action === "UPSERT_TAX_RATE") {
        const taxRate = payload.id
          ? await tx.taxRate.update({ where: { id: payload.id }, data: { name: payload.name, rate: payload.rate, active: payload.active } })
          : await tx.taxRate.create({ data: { organizationId: user.organizationId, name: payload.name, rate: payload.rate, active: payload.active ?? true } });

        await createAuditLog(tx, {
          organizationId: user.organizationId,
          actorId: user.id, actorRole: user.role as Role,
          action: payload.id ? "UPDATE_TAX_RATE" : "CREATE_TAX_RATE",
          targetType: "TAX_RATE", targetId: taxRate.id,
          severity: Severity.LOW,
          description: `Configured tax rate: ${taxRate.name} (${taxRate.rate}%)`,
          requestId, ipAddress, deviceInfo, after: taxRate,
        });
        return { success: true, data: taxRate };
      }

      // 4. UPSERT GLOBAL PREFERENCE
      if (action === "UPSERT_PREFERENCE") {
        const pref = await tx.preference.upsert({
          where: { 
            organizationId_scope_key: { 
              organizationId: user.organizationId, 
              scope: PreferenceScope.ORGANIZATION, 
              key: payload.key 
            } 
          },
          update: { value: payload.value, category: payload.category as PreferenceCategory },
          create: {
            organizationId: user.organizationId,
            scope: PreferenceScope.ORGANIZATION,
            category: payload.category as PreferenceCategory,
            key: payload.key,
            value: payload.value,
          },
        });

        await createAuditLog(tx, {
          organizationId: user.organizationId,
          actorId: user.id, actorRole: user.role as Role,
          action: "UPDATE_PREFERENCE", targetType: "PREFERENCE", targetId: pref.id,
          severity: Severity.MEDIUM,
          description: `Updated global setting: ${pref.key}`,
          requestId, ipAddress, deviceInfo, after: pref,
        });
        return { success: true, data: pref };
      }

      throw new Error("Invalid configuration action specified.");
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("[ORG_PATCH_ERROR]", error);
    return NextResponse.json({ error: error.message || "Failed to update configuration" }, { status: 400 });
  }
}