import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { invalidateOrgRole } from "@/core/lib/permissionCache";
import { 
  ActorType, 
  Severity, 
  Prisma, 
  Role, 
  PreferenceScope, 
  PreferenceCategory,
  Resource,
  PermissionAction 
} from "@prisma/client";
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
    organizationId: data.organizationId,
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
/* GET HANDLER (Fetch All Config & RBAC Permissions)                          */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const user = session.user as any;

    if (user.role !== Role.ADMIN && !user.isOrgOwner && user.role !== Role.DEV) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [org, uoms, taxRates, preferences, permissions] = await Promise.all([
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
      prisma.resourcePermission.findMany({
        where: { organizationId: user.organizationId },
        orderBy: [{ role: 'asc' }, { resource: 'asc' }]
      })
    ]);

    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    return NextResponse.json({ org, uoms, taxRates, preferences, permissions });
  } catch (error: any) {
    console.error("[ORG_GET_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* POST HANDLER (Create/Update RBAC Permissions)                             */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    if (!user || (user.role !== Role.ADMIN && !user.isOrgOwner && user.role !== Role.DEV)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";
    
    const { role, resource, actions } = await req.json();

    const validActions = Object.values(PermissionAction);
    const validatedActions = (actions as string[]).filter((a): a is PermissionAction => 
      validActions.includes(a as PermissionAction)
    );

    const result = await prisma.$transaction(async (tx) => {
      const permission = await tx.resourcePermission.upsert({
        where: {
          organizationId_resource_role: {
            organizationId: user.organizationId,
            resource: resource as Resource,
            role: role as Role,
          }
        },
        update: { actions: validatedActions },
        create: {
          organizationId: user.organizationId,
          role: role as Role,
          resource: resource as Resource,
          actions: validatedActions,
        }
      });

      await createAuditLog(tx, {
        organizationId: user.organizationId,
        actorId: user.id, 
        actorRole: user.role as Role,
        action: "UPDATE_RESOURCE_PERMISSION",
        targetType: "RESOURCE_PERMISSION", 
        targetId: permission.id,
        severity: Severity.HIGH,
        description: `Updated ${resource} permissions for role: ${role}`,
        requestId, 
        ipAddress, 
        deviceInfo, 
        after: permission,
      });

      return permission;
    });

    // CRITICAL: Invalidate cache so changes take effect immediately
    invalidateOrgRole(user.organizationId, role as Role);

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("[ORG_POST_PERMISSIONS_ERROR]", error);
    return NextResponse.json({ error: error.message || "Failed to update permissions" }, { status: 400 });
  }
}

/* -------------------------------------------------------------------------- */
/* PATCH HANDLER (General Configuration Multiplexer)                          */
/* -------------------------------------------------------------------------- */

export async function PATCH(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const user = session.user as any;
    if (user.role !== Role.ADMIN && !user.isOrgOwner && user.role !== Role.DEV) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";
    const body = await req.json();
    const { action, payload } = body;

    const result = await prisma.$transaction(async (tx) => {
      
      if (action === "UPDATE_PROFILE") {
        const existing = await tx.organization.findUnique({ where: { id: user.organizationId } });
        if (!existing) throw new Error("Organization not found");
        
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

      if (action === "UPSERT_PREFERENCE") {
        const pref = await tx.preference.upsert({
          where: { 
            scope_category_key_organizationId_branchId_personnelId_target: { 
              organizationId: user.organizationId, 
              scope: PreferenceScope.ORGANIZATION, 
              category: payload.category as PreferenceCategory,
              key: payload.key,
              branchId: null,
              personnelId: null,
              target: null
            } 
          },
          update: { value: payload.value },
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