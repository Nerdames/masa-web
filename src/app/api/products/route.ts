import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import {
  PermissionAction,
  ActorType,
  Severity,
  Prisma,
  Role,
} from "@prisma/client";
import crypto from "crypto";
import { z } from "zod";
import { authorize, RESOURCES } from "@/core/lib/permission";

/* -------------------------------------------------------------------------- */
/* CONFIG & SCHEMAS                                                           */
/* -------------------------------------------------------------------------- */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 1000;

// Validation Schema for Product Creation
const productSchema = z.object({
  name: z.string().min(2, "Product name must be at least 2 characters"),
  sku: z.string().min(2, "SKU is required"),
  barcode: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  categoryId: z.string().cuid().optional().nullable(),
  uomId: z.string().cuid().optional().nullable(),
  baseCostPrice: z.number().min(0, "Base cost cannot be negative"),
  costPrice: z.number().optional(), // Defaults to baseCostPrice if omitted
  currency: z.string().default("NGN"),
});

// Validation Schema for Product Updates
const productPatchSchema = productSchema.partial();

/* -------------------------------------------------------------------------- */
/* FORENSIC AUDIT ENGINE                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Creates a cryptographically chained audit log for maximum compliance.
 * This ensures that the history of the product is tamper-evident.
 */
async function createAuditLog(
  tx: Prisma.TransactionClient,
  data: {
    organizationId: string;
    actorId: string;
    actorRole: Role;
    action: string;
    targetId: string;
    severity: Severity;
    description: string;
    requestId: string;
    ipAddress: string;
    deviceInfo: string;
    before?: any;
    after?: any;
  }
) {
  // Fetch the hash of the last log for this organization to maintain the chain
  const lastLog = await tx.activityLog.findFirst({
    where: { organizationId: data.organizationId },
    orderBy: { createdAt: "desc" },
    select: { hash: true },
  });

  const previousHash = lastLog?.hash ?? "0".repeat(64);
  
  // Construct a payload for the cryptographic hash
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
      targetType: "PRODUCT",
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
/* GET HANDLER                                                                */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const user = session.user as any;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.READ,
      resource: RESOURCES.INVENTORY || "INVENTORY",
    });
    if (!auth.allowed) return NextResponse.json({ error: "Forbidden: Insufficient Permissions" }, { status: 403 });

    // Single Product Fetch
    if (id) {
      const product = await prisma.product.findUnique({
        where: { 
          id, 
          organizationId: user.organizationId, 
          deletedAt: null 
        },
        include: {
          category: { select: { id: true, name: true } },
          uom: { select: { id: true, name: true, abbreviation: true } },
          createdBy: { select: { name: true } },
          updatedBy: { select: { name: true } },
        },
      });
      if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
      return NextResponse.json(product);
    }

    // List Fetch with Pagination & Filtering
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10), MAX_LIMIT);
    const search = searchParams.get("search")?.trim() || "";
    const categoryId = searchParams.get("categoryId") || undefined;

    const where: Prisma.ProductWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
    };

    if (categoryId) where.categoryId = categoryId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
        { barcode: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          uom: { select: { id: true, name: true, abbreviation: true } },
        },
        orderBy: { name: "asc" },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({ items, total, page, limit });
  } catch (error: any) {
    console.error("[PRODUCT_GET_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* POST HANDLER                                                              */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const user = session.user as any;
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.CREATE,
      resource: RESOURCES.INVENTORY || "INVENTORY",
    });
    if (!auth.allowed) return NextResponse.json({ error: "Forbidden: Insufficient Permissions" }, { status: 403 });

    const body = await req.json();
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

    const data = parsed.data;

    // Use SERIALIZABLE to prevent SKU/Barcode race conditions
    const result = await prisma.$transaction(async (tx) => {
      // 1. Uniqueness Checks
      const existingSku = await tx.product.findUnique({
        where: { organizationId_sku: { organizationId: user.organizationId, sku: data.sku } },
      });
      if (existingSku) throw new Error(`SKU '${data.sku}' already exists.`);

      if (data.barcode) {
        const existingBarcode = await tx.product.findUnique({
          where: { organizationId_barcode: { organizationId: user.organizationId, barcode: data.barcode } },
        });
        if (existingBarcode) throw new Error(`Barcode '${data.barcode}' is already in use.`);
      }

      // 2. Insert Product
      const product = await tx.product.create({
        data: {
          organizationId: user.organizationId,
          name: data.name,
          sku: data.sku,
          barcode: data.barcode || null,
          description: data.description || null,
          categoryId: data.categoryId || null,
          uomId: data.uomId || null,
          baseCostPrice: new Prisma.Decimal(data.baseCostPrice),
          costPrice: new Prisma.Decimal(data.costPrice ?? data.baseCostPrice),
          currency: data.currency,
          createdById: user.id,
        },
      });

      // 3. Create Audit Trail
      await createAuditLog(tx, {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.role as Role,
        action: "CREATE_PRODUCT",
        targetId: product.id,
        severity: Severity.MEDIUM,
        description: `Registered new master product: ${product.name} (${product.sku})`,
        requestId,
        ipAddress,
        deviceInfo,
        after: product,
      });

      return product;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: any) {
    console.error("[PRODUCT_POST_ERROR]", error);
    return NextResponse.json({ error: error.message || "Failed to create product" }, { status: 400 });
  }
}

/* -------------------------------------------------------------------------- */
/* PATCH HANDLER                                                             */
/* -------------------------------------------------------------------------- */

export async function PATCH(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const user = session.user as any;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    
    if (!id) return NextResponse.json({ error: "Product ID is required." }, { status: 400 });

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.UPDATE,
      resource: RESOURCES.INVENTORY || "INVENTORY",
    });
    if (!auth.allowed) return NextResponse.json({ error: "Forbidden: Insufficient Permissions" }, { status: 403 });

    const body = await req.json();
    const parsed = productPatchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

    const data = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Snapshot Before State
      const existing = await tx.product.findUnique({
        where: { id, organizationId: user.organizationId },
      });
      if (!existing || existing.deletedAt) throw new Error("Product not found.");

      // 2. Uniqueness Validations for SKU/Barcode changes
      if (data.sku && data.sku !== existing.sku) {
        const skuCheck = await tx.product.findUnique({
          where: { organizationId_sku: { organizationId: user.organizationId, sku: data.sku } },
        });
        if (skuCheck) throw new Error(`SKU '${data.sku}' is already taken.`);
      }

      if (data.barcode && data.barcode !== existing.barcode) {
        const barcodeCheck = await tx.product.findUnique({
          where: { organizationId_barcode: { organizationId: user.organizationId, barcode: data.barcode } },
        });
        if (barcodeCheck) throw new Error(`Barcode '${data.barcode}' is already in use.`);
      }

      // 3. Prepare Update Data
      const updateData: Prisma.ProductUpdateInput = {
        updatedBy: { connect: { id: user.id } },
      };
      
      if (data.name !== undefined) updateData.name = data.name;
      if (data.sku !== undefined) updateData.sku = data.sku;
      if (data.barcode !== undefined) updateData.barcode = data.barcode || null;
      if (data.description !== undefined) updateData.description = data.description || null;
      
      if (data.categoryId !== undefined) {
        updateData.category = data.categoryId ? { connect: { id: data.categoryId } } : { disconnect: true };
      }
      if (data.uomId !== undefined) {
        updateData.uom = data.uomId ? { connect: { id: data.uomId } } : { disconnect: true };
      }
      
      if (data.baseCostPrice !== undefined) updateData.baseCostPrice = new Prisma.Decimal(data.baseCostPrice);
      if (data.costPrice !== undefined) updateData.costPrice = new Prisma.Decimal(data.costPrice);
      if (data.currency !== undefined) updateData.currency = data.currency;

      const updated = await tx.product.update({
        where: { id },
        data: updateData,
      });

      // 4. Create Forensic Log with Before/After
      await createAuditLog(tx, {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.role as Role,
        action: "UPDATE_PRODUCT",
        targetId: updated.id,
        severity: Severity.LOW,
        description: `Updated product properties for: ${updated.sku}`,
        requestId,
        ipAddress,
        deviceInfo,
        before: existing,
        after: updated,
      });

      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error: any) {
    console.error("[PRODUCT_PATCH_ERROR]", error);
    return NextResponse.json({ error: error.message || "Failed to update product" }, { status: 400 });
  }
}

/* -------------------------------------------------------------------------- */
/* DELETE HANDLER                                                            */
/* -------------------------------------------------------------------------- */

export async function DELETE(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const user = session.user as any;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Product ID is required." }, { status: 400 });

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.DELETE,
      resource: RESOURCES.INVENTORY || "INVENTORY",
    });
    if (!auth.allowed) return NextResponse.json({ error: "Forbidden: Insufficient Permissions" }, { status: 403 });

    await prisma.$transaction(async (tx) => {
      // 1. Check Existence and active relations
      const existing = await tx.product.findUnique({
        where: { id, organizationId: user.organizationId },
      });
      if (!existing || existing.deletedAt) throw new Error("Product not found or already deleted.");

      // 2. Perform Soft Delete
      const deleted = await tx.product.update({
        where: { id },
        data: { 
          deletedAt: new Date(),
          updatedBy: { connect: { id: user.id } } 
        },
      });

      // 3. Create Audit Log
      await createAuditLog(tx, {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.role as Role,
        action: "DELETE_PRODUCT",
        targetId: deleted.id,
        severity: Severity.HIGH,
        description: `Soft deleted master product: ${deleted.sku}`,
        requestId,
        ipAddress,
        deviceInfo,
        before: existing,
        after: deleted,
      });
    });

    return NextResponse.json({ success: true, message: "Product deleted successfully." }, { status: 200 });
  } catch (error: any) {
    console.error("[PRODUCT_DELETE_ERROR]", error);
    return NextResponse.json({ error: error.message || "Failed to delete product" }, { status: 400 });
  }
}