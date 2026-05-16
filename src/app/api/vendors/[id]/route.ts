/**
 * app/api/vendors/[id]/route.ts
 * PRODUCTION-GRADE DYNAMIC VENDORS API
 * Fortified for Next.js 16 (Async Params), MASA Schema, Core RBAC, and Forensic Audit V2.6.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { createAuditLog } from "@/core/lib/audit";
import { authorize } from "@/core/lib/permission";
import {
  PermissionAction,
  Severity,
  Resource,
  Role,
  NotificationType,
} from "@prisma/client";

/* -------------------------------------------------------------------------- */
/* TYPES & CONFIGURATIONS                                                     */
/* -------------------------------------------------------------------------- */

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface VendorUpdateInput {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}

/* -------------------------------------------------------------------------- */
/* UTILITY HELPERS                                                            */
/* -------------------------------------------------------------------------- */

function sanitizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractClientInfo(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1",
    deviceInfo: req.headers.get("user-agent") || "system",
  };
}

/**
 * Validates session context and coordinates authorization with the central RBAC matrix.
 */
async function validateAccess(action: PermissionAction) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.organizationId) {
    throw { status: 401, message: "Unauthorized: Missing organization context." };
  }

  if (session.user.disabled || session.user.locked) {
    throw { status: 403, message: "Forbidden: Account is deactivated or locked." };
  }

  const { allowed, reason } = authorize({
    role: session.user.role,
    isOrgOwner: session.user.isOrgOwner,
    action,
    resources: Resource.VENDOR,
    userPermissions: session.user.permissions || [],
  });

  if (!allowed) {
    throw { status: 403, message: reason || "Forbidden: Insufficient Permissions." };
  }

  return session.user;
}

/**
 * Dispatches notifications to managerial personnel within the active transaction.
 */
async function notifyManagement(
  tx: any,
  organizationId: string,
  title: string,
  message: string,
  activityLogId: string,
  branchId?: string | null
) {
  const targets = await tx.authorizedPersonnel.findMany({
    where: {
      organizationId,
      deletedAt: null,
      disabled: false,
      OR: [{ role: Role.ADMIN }, { role: Role.MANAGER }, { isOrgOwner: true }],
    },
    select: { id: true },
  });

  if (targets.length === 0) return;

  await tx.notification.create({
    data: {
      organizationId,
      branchId: branchId ?? undefined,
      type: NotificationType.INFO,
      title,
      message,
      activityLogId,
      recipients: {
        create: targets.map((t: { id: string }) => ({ personnelId: t.id })),
      },
    },
  });
}

/* -------------------------------------------------------------------------- */
/* ROUTE HANDLERS                                                             */
/* -------------------------------------------------------------------------- */

/**
 * PATCH /api/vendors/[id]
 * Updates specific vendor profile fields with delta capturing and duplicate protection.
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const user = await validateAccess(PermissionAction.UPDATE);
    const { id } = await context.params;
    const { ipAddress, deviceInfo } = extractClientInfo(req);

    if (!id) {
      return NextResponse.json({ error: "Vendor ID is required" }, { status: 400 });
    }

    const body: unknown = await req.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const input = body as VendorUpdateInput;
    const name = sanitizeString(input.name);
    const email = sanitizeString(input.email);
    const phone = sanitizeString(input.phone);
    const address = sanitizeString(input.address);

    const vendorBefore = await prisma.vendor.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });

    if (!vendorBefore) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    /* ---------- Duplicate Name Verification ---------- */
    if (name && name !== vendorBefore.name) {
      const duplicate = await prisma.vendor.findFirst({
        where: {
          organizationId: user.organizationId,
          name,
          deletedAt: null,
          NOT: { id },
        },
      });

      if (duplicate) {
        return NextResponse.json({ error: "Vendor with this name already exists" }, { status: 409 });
      }
    }

    /* ---------- Build Verified Payload ---------- */
    const updateData: Prisma.VendorUpdateInput = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields provided for update" }, { status: 400 });
    }

    updateData.updatedById = user.id;

    const result = await prisma.$transaction(async (tx) => {
      const vendorAfter = await tx.vendor.update({
        where: { id },
        data: updateData,
      });

      const log = await createAuditLog(tx, {
        action: "UPDATE_VENDOR_PROFILE",
        resource: Resource.VENDOR,
        resourceId: id,
        organizationId: user.organizationId,
        branchId: user.branchId ?? null,
        actorId: user.id,
        actorRole: user.role,
        severity: Severity.LOW,
        description: `Modified layout metrics for vendor entity: ${vendorAfter.name}`,
        changes: { from: vendorBefore, to: vendorAfter },
        ipAddress,
        deviceInfo,
      });

      await notifyManagement(
        tx,
        user.organizationId,
        "Vendor Profile Modified",
        `Vendor parameters for ${vendorAfter.name} altered by ${user.name || user.id}.`,
        log.id,
        user.branchId ?? null
      );

      return vendorAfter;
    });

    return NextResponse.json({ vendor: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update vendor" }, { status: err.status || 500 });
  }
}

/**
 * DELETE /api/vendors/[id]
 * Archives vendor entities using a soft-delete pattern. Supports safe detachment.
 */
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const user = await validateAccess(PermissionAction.DELETE);
    const { id } = await context.params;
    const { ipAddress, deviceInfo } = extractClientInfo(req);
    
    const force = req.nextUrl.searchParams.get("force") === "true";

    if (!id) {
      return NextResponse.json({ error: "Vendor ID is required" }, { status: 400 });
    }

    const vendor = await prisma.vendor.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      include: {
        branchProducts: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });

    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    /* ---------- Linked Constraints Enforcement ---------- */
    if (vendor.branchProducts.length > 0 && !force) {
      return NextResponse.json(
        {
          error: "Cannot delete vendor. Active branch product relationships exist. Append ?force=true to override and clear references.",
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      let detachedCount = 0;

      if (vendor.branchProducts.length > 0 && force) {
        const structuralUpdate = await tx.branchProduct.updateMany({
          where: { vendorId: id, deletedAt: null },
          data: { vendorId: null },
        });
        detachedCount = structuralUpdate.count;
      }

      const archivedVendor = await tx.vendor.update({
        where: { id },
        data: { 
          deletedAt: new Date(),
          updatedById: user.id 
        },
      });

      const log = await createAuditLog(tx, {
        action: "ARCHIVE_VENDOR_NODE",
        resource: Resource.VENDOR,
        resourceId: id,
        organizationId: user.organizationId,
        branchId: user.branchId ?? null,
        actorId: user.id,
        actorRole: user.role,
        severity: Severity.HIGH, // Triggers elevated visibility indicators inside the forensic tracker
        description: `Soft-deleted vendor node: ${vendor.name}.${detachedCount ? ` Unlinked ${detachedCount} inventory associations.` : ""}`,
        changes: { from: vendor, to: archivedVendor },
        ipAddress,
        deviceInfo,
        metadata: { forcedSeverance: force, disconnectedNodesCount: detachedCount },
      });

      await notifyManagement(
        tx,
        user.organizationId,
        "Vendor Purged From Workspace",
        `Vendor ledger reference for "${vendor.name}" set to archived state by ${user.name || user.id}.`,
        log.id,
        user.branchId ?? null
      );
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to terminate vendor reference" }, { status: err.status || 500 });
  }
}