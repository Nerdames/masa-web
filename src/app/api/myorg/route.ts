import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/infrastructure/auth/config"; // Infrastructure auth engine
import prisma from "@/infrastructure/prisma/client"; // Singleton database client
import { createAuditLog } from "@/modules/audit/server/audit.service"; // Enterprise module service
import { invalidateOrgRole } from "@/server/permissions/cache"; // Server permission caching system
import { 
  Severity, 
  Prisma, 
  Role, 
  PreferenceScope, 
  PreferenceCategory,
  Resource,
  PermissionAction 
} from "@prisma/client";
import crypto from "crypto";

/**
 * GET: Fetch all Organization Configuration & RBAC Matrix
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const user = session.user;

    // Security Gate: Only privileged roles can access the config multiplexer
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
  } catch (error) {
    console.error("[ORG_GET_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST: Create/Update RBAC Resource Permissions
 */
export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user;

    if (!user || (user.role !== Role.ADMIN && !user.isOrgOwner && user.role !== Role.DEV)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";
    
    const { role, resource, actions } = await req.json();

    // Validate Actions against Prisma Enum
    const validActions = Object.values(PermissionAction);
    const validatedActions = (actions as string[]).filter((a): a is PermissionAction => 
      validActions.includes(a as PermissionAction)
    );

    const result = await prisma.$transaction(async (tx) => {
      // Get 'Before' state for the audit log
      const existing = await tx.resourcePermission.findUnique({
        where: { organizationId_resource_role: { organizationId: user.organizationId, resource: resource as Resource, role: role as Role } }
      });

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

      // Forensic Audit Entry
      await createAuditLog(tx, {
        organizationId: user.organizationId,
        actorId: user.id, 
        actorRole: user.role as Role,
        action: "UPDATE_RESOURCE_PERMISSION",
        entityType: Resource.SETTINGS,
        entityId: permission.id,
        severity: Severity.HIGH,
        description: `Updated ${resource} permissions for role: ${role}`,
        requestId, 
        ipAddress, 
        deviceInfo, 
        changes: { from: existing, to: permission }
      });

      return permission;
    });

    // Cache Invalidation
    invalidateOrgRole(user.organizationId, role as Role);

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("[ORG_POST_PERMISSIONS_ERROR]", error);
    return NextResponse.json({ error: error.message || "Failed to update permissions" }, { status: 400 });
  }
}

/**
 * PATCH: Configuration Multiplexer (UOM, Tax, Preferences, Profile)
 */
export async function PATCH(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const user = session.user;
    if (user.role !== Role.ADMIN && !user.isOrgOwner && user.role !== Role.DEV) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";
    const { action, payload } = await req.json();

    const result = await prisma.$transaction(async (tx) => {
      
      if (action === "UPDATE_PROFILE") {
        const existing = await tx.organization.findUnique({ where: { id: user.organizationId } });
        const updated = await tx.organization.update({
          where: { id: user.organizationId },
          data: { name: payload.name },
        });

        await createAuditLog(tx, {
          organizationId: user.organizationId,
          actorId: user.id, actorRole: user.role as Role,
          action: "UPDATE_ORG_PROFILE", entityType: "ORGANIZATION", entityId: updated.id,
          severity: Severity.MEDIUM,
          description: `Updated organization name to ${updated.name}`,
          requestId, ipAddress, deviceInfo, changes: { from: existing, to: updated },
        });
        return updated;
      }

      if (action === "UPSERT_UOM") {
        const existing = payload.id ? await tx.unitOfMeasure.findUnique({ where: { id: payload.id } }) : null;
        const uom = payload.id 
          ? await tx.unitOfMeasure.update({ where: { id: payload.id }, data: { name: payload.name, abbreviation: payload.abbreviation, active: payload.active } })
          : await tx.unitOfMeasure.create({ data: { organizationId: user.organizationId, name: payload.name, abbreviation: payload.abbreviation, active: payload.active ?? true } });

        await createAuditLog(tx, {
          organizationId: user.organizationId,
          actorId: user.id, actorRole: user.role as Role,
          action: payload.id ? "UPDATE_UOM" : "CREATE_UOM",
          entityType: "UNIT_OF_MEASURE", entityId: uom.id,
          severity: Severity.LOW,
          description: `${payload.id ? "Updated" : "Created"} UoM: ${uom.abbreviation}`,
          requestId, ipAddress, deviceInfo, changes: { from: existing, to: uom },
        });
        return uom;
      }

      if (action === "UPSERT_TAX_RATE") {
        const existing = payload.id ? await tx.taxRate.findUnique({ where: { id: payload.id } }) : null;
        const taxRate = payload.id
          ? await tx.taxRate.update({ where: { id: payload.id }, data: { name: payload.name, rate: payload.rate, active: payload.active } })
          : await tx.taxRate.create({ data: { organizationId: user.organizationId, name: payload.name, rate: payload.rate, active: payload.active ?? true } });

        await createAuditLog(tx, {
          organizationId: user.organizationId,
          actorId: user.id, actorRole: user.role as Role,
          action: payload.id ? "UPDATE_TAX_RATE" : "CREATE_TAX_RATE",
          entityType: "TAX_RATE", entityId: taxRate.id,
          severity: Severity.LOW,
          description: `Configured tax rate: ${taxRate.name} (${taxRate.rate}%)`,
          requestId, ipAddress, deviceInfo, changes: { from: existing, to: taxRate },
        });
        return taxRate;
      }

      if (action === "UPSERT_PREFERENCE") {
        const existing = await tx.preference.findFirst({
          where: { organizationId: user.organizationId, key: payload.key, scope: PreferenceScope.ORGANIZATION }
        });

        const pref = await tx.preference.upsert({
          where: { 
            scope_category_key_organizationId_branchId_personnelId_target: { 
              organizationId: user.organizationId, 
              scope: PreferenceScope.ORGANIZATION, 
              category: payload.category as PreferenceCategory,
              key: payload.key,
              branchId: null, personnelId: null, target: null
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
          action: "UPDATE_PREFERENCE", entityType: "PREFERENCE", entityId: pref.id,
          severity: Severity.MEDIUM,
          description: `Updated global setting: ${pref.key}`,
          requestId, ipAddress, deviceInfo, changes: { from: existing, to: pref },
        });
        return pref;
      }

      throw new Error("Invalid configuration action.");
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("[ORG_PATCH_ERROR]", error);
    return NextResponse.json({ error: error.message || "Failed to update configuration" }, { status: 400 });
  }
}