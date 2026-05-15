/**
 * src/app/api/products/route.ts
 * PRODUCTION-READY PRODUCT MANAGEMENT API (V3.1 - FORTIFIED)
 * Optimized for: Forensic Auditing, Concurrency, Strict Authorization, and Safe Serialization.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import {
  PermissionAction,
  Severity,
  Prisma,
  Resource,
  NotificationType,
} from "@prisma/client";
import crypto from "crypto";
import { z } from "zod";
import { authorize } from "@/core/lib/permission";
import { createAuditLog } from "@/core/lib/audit";

/* -------------------------------------------------------------------------- */
/* CONFIG & SCHEMAS                                                           */
/* -------------------------------------------------------------------------- */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 1000;

// Enforces financial precision natively at the validation layer
const productSchema = z.object({
  name: z.string().trim().min(2, "Product name must be at least 2 characters"),
  sku: z.string().trim().min(2, "SKU is required"),
  barcode: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  categoryId: z.string().cuid().optional().nullable(),
  uomId: z.string().cuid().optional().nullable(),
  baseCostPrice: z.number()
    .min(0, "Base cost cannot be negative")
    .transform((val) => Number(val.toFixed(2))), 
  costPrice: z.number()
    .min(0)
    .optional()
    .transform((val) => (val !== undefined ? Number(val.toFixed(2)) : undefined)),
  currency: z.string().length(3).default("NGN"),
});

const productPatchSchema = productSchema.partial();

/* -------------------------------------------------------------------------- */
/* INTERNAL HELPERS                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Prevents Prisma Decimal/Date serialization crashes in Postgres JSONB columns.
 */
const sanitizeForAudit = (data: any) => {
  if (!data) return null;
  return JSON.parse(JSON.stringify(data)); 
};

async function triggerProductNotification(
  tx: Prisma.TransactionClient,
  { organizationId, userId, message, type = NotificationType.INVENTORY }: {
    organizationId: string;
    userId: string;
    message: string;
    type?: NotificationType;
  }
) {
  return tx.notification.create({
    data: {
      organizationId,
      title: "Product Registry Update",
      message,
      type,
      recipients: {
        create: {
          personnelId: userId,
          read: false,
        },
      },
    },
  });
}

/* -------------------------------------------------------------------------- */
/* GET HANDLER (READ)                                                         */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = session.user;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const mode = searchParams.get("mode");

    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.READ,
      resources: Resource.PRODUCT,
      userPermissions: user.permissions, // Injected from auth.ts
    });

    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason || "Forbidden" }, { status: 403 });
    }

    if (mode === "dropdown") {
      const options = await prisma.product.findMany({
        where: { organizationId: user.organizationId, deletedAt: null },
        select: { id: true, name: true, sku: true, barcode: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json(options);
    }

    if (id) {
      const product = await prisma.product.findFirst({
        where: { id, organizationId: user.organizationId, deletedAt: null },
        include: {
          category: { select: { id: true, name: true } },
          uom: { select: { id: true, name: true, abbreviation: true } },
          createdBy: { select: { name: true } },
          updatedBy: { select: { name: true } },
        },
      });
      if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
      
      return NextResponse.json({
        ...product,
        baseCostPrice: product.baseCostPrice.toNumber(),
        costPrice: product.costPrice.toNumber(),
      });
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10), MAX_LIMIT);
    const search = searchParams.get("search")?.trim() || "";
    const categoryId = searchParams.get("categoryId") || undefined;

    const where: Prisma.ProductWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(categoryId && { categoryId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          { barcode: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          uom: { select: { id: true, name: true, abbreviation: true } },
          createdBy: { select: { name: true } },
          updatedBy: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.product.count({ where }),
    ]);

    // Map items to safe numbers to prevent serialization crashes on Decimals
    const safeItems = items.map(item => ({
      ...item,
      baseCostPrice: item.baseCostPrice.toNumber(),
      costPrice: item.costPrice.toNumber(),
    }));

    return NextResponse.json({
      items: safeItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      requestId
    });

  } catch (error: any) {
    console.error(`[${requestId}] PRODUCT_GET_ERROR:`, error);
    return NextResponse.json({ error: "Failed to retrieve product data" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* POST HANDLER (CREATE)                                                      */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = session.user;
    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.CREATE,
      resources: Resource.PRODUCT,
      userPermissions: user.permissions,
    });
    if (!auth.allowed) return NextResponse.json({ error: auth.reason }, { status: 403 });

    const body = await req.json();
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

    const input = parsed.data;
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    const result = await prisma.$transaction(async (tx) => {
      const conflict = await tx.product.findFirst({
        where: {
          organizationId: user.organizationId,
          OR: [
            { sku: input.sku },
            { barcode: input.barcode ? input.barcode : undefined }
          ],
          deletedAt: null
        }
      });
      
      if (conflict) {
        throw new Error(`Conflict: SKU or Barcode already exists (${conflict.name})`);
      }

      const product = await tx.product.create({
        data: {
          organizationId: user.organizationId,
          ...input,
          baseCostPrice: new Prisma.Decimal(input.baseCostPrice),
          costPrice: new Prisma.Decimal(input.costPrice ?? input.baseCostPrice),
          createdById: user.id,
          updatedById: user.id,
        },
      });

      await createAuditLog(tx as any, {
        action: "CREATE_PRODUCT",
        resource: Resource.PRODUCT,
        resourceId: product.id,
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.role,
        severity: Severity.MEDIUM,
        description: `Product Registered: ${product.name} [${product.sku}]`,
        changes: sanitizeForAudit(product),
        ipAddress,
        deviceInfo,
        requestId,
      });

      await triggerProductNotification(tx, {
        organizationId: user.organizationId,
        userId: user.id,
        message: `Catalog Update: ${product.name} (${product.sku}) created.`,
        type: NotificationType.INVENTORY
      });

      return {
        ...product,
        baseCostPrice: product.baseCostPrice.toNumber(),
        costPrice: product.costPrice.toNumber()
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: any) {
    console.error(`[${requestId}] PRODUCT_POST_ERROR:`, error.message);
    return NextResponse.json({ error: error.message || "Product creation failed" }, { status: 400 });
  }
}

/* -------------------------------------------------------------------------- */
/* PATCH HANDLER (UPDATE)                                                     */
/* -------------------------------------------------------------------------- */

export async function PATCH(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = session.user;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing Product ID" }, { status: 400 });

    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.UPDATE,
      resources: Resource.PRODUCT,
      userPermissions: user.permissions,
    });
    if (!auth.allowed) return NextResponse.json({ error: auth.reason }, { status: 403 });

    const body = await req.json();
    const parsed = productPatchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

    const updateInput = parsed.data;
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent") ?? "unknown";

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findFirst({
        where: { id, organizationId: user.organizationId, deletedAt: null },
      });
      if (!existing) throw new Error("Target product record not found.");

      if (updateInput.sku && updateInput.sku !== existing.sku) {
        const skuConflict = await tx.product.findFirst({
          where: { organizationId: user.organizationId, sku: updateInput.sku, deletedAt: null },
        });
        if (skuConflict) throw new Error("The target SKU is already assigned to another product.");
      }

      const updated = await tx.product.update({
        where: { id },
        data: {
          ...updateInput,
          baseCostPrice: updateInput.baseCostPrice !== undefined ? new Prisma.Decimal(updateInput.baseCostPrice) : undefined,
          costPrice: updateInput.costPrice !== undefined ? new Prisma.Decimal(updateInput.costPrice) : undefined,
          updatedById: user.id,
        },
      });

      await createAuditLog(tx as any, {
        action: "UPDATE_PRODUCT",
        resource: Resource.PRODUCT,
        resourceId: id,
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.role,
        severity: Severity.LOW,
        description: `Metadata modified for SKU: ${existing.sku}`,
        changes: sanitizeForAudit({ from: existing, to: updated }),
        ipAddress,
        deviceInfo,
        requestId,
      });

      return {
        ...updated,
        baseCostPrice: updated.baseCostPrice.toNumber(),
        costPrice: updated.costPrice.toNumber()
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Update operation failed" }, { status: 400 });
  }
}

/* -------------------------------------------------------------------------- */
/* DELETE HANDLER (SOFT DELETE)                                               */
/* -------------------------------------------------------------------------- */

export async function DELETE(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = session.user;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Product ID required" }, { status: 400 });

    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.DELETE,
      resources: Resource.PRODUCT,
      userPermissions: user.permissions,
    });
    if (!auth.allowed) return NextResponse.json({ error: auth.reason }, { status: 403 });

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent") ?? "unknown";

    await prisma.$transaction(async (tx) => {
      const target = await tx.product.findFirst({
        where: { id, organizationId: user.organizationId, deletedAt: null },
      });
      if (!target) throw new Error("Product not found or already decommissioned.");

      // BLOCK DELETION IF STOCK REMAINS
      const stockSummary = await tx.branchProduct.aggregate({
        where: { productId: id, organizationId: user.organizationId },
        _sum: { stock: true }
      });
      
      const totalQty = Number(stockSummary._sum.stock || 0);
      if (totalQty > 0) {
        throw new Error(`Deletion Forbidden: ${totalQty} units remain in inventory.`);
      }

      const deleted = await tx.product.update({
        where: { id },
        data: { 
          deletedAt: new Date(), 
          updatedById: user.id 
        },
      });

      await createAuditLog(tx as any, {
        action: "DELETE_PRODUCT",
        resource: Resource.PRODUCT,
        resourceId: id,
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.role,
        severity: Severity.HIGH,
        description: `Soft-delete: ${target.sku} decommissioned.`,
        changes: sanitizeForAudit({ from: target, to: deleted }),
        ipAddress,
        deviceInfo,
        requestId,
      });

      await triggerProductNotification(tx, {
        organizationId: user.organizationId,
        userId: user.id,
        message: `Alert: Product ${target.sku} archived by ${user.name || 'Admin'}.`,
        type: NotificationType.INVENTORY
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ success: true, message: "Product archived successfully." });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Archive operation failed" }, { status: 400 });
  }
}