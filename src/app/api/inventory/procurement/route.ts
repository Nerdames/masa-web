import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import {
  PermissionAction,
  Severity,
  Prisma,
  POStatus,
  Role,
  NotificationType,
  Resource,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import crypto from "crypto";
import { authorize, RESOURCES } from "@/core/lib/permission";
import { createAuditLog } from "@/core/lib/audit";
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* CONFIG & HELPERS                                                           */
/* -------------------------------------------------------------------------- */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const EXPORT_LIMIT = 10000;

interface AuthenticatedUser {
  id: string;
  organizationId: string;
  branchId: string | null;
  role: Role;
  isOrgOwner: boolean;
  permissions: string[];
}

function parseIntSafe(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseDateSafe(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function generatePONumber(branchId?: string | null): string {
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  const branchPart = branchId ? branchId.slice(0, 4).toUpperCase() : "ORG";
  return `PO-${branchPart}-${suffix}`;
}

/* -------------------------------------------------------------------------- */
/* ZOD SCHEMAS (RUNTIME VALIDATION)                                           */
/* -------------------------------------------------------------------------- */

const poItemSchema = z.object({
  productId: z.string().min(1, "Product ID is required."),
  quantityOrdered: z.coerce.number().int().positive("Quantity ordered must be at least 1."),
  unitCost: z.coerce.number().nonnegative("Unit cost cannot be negative.").nullish(),
});

const createPOSchema = z.object({
  vendorId: z.string().min(1, "Vendor selection is required."),
  branchId: z.string().nullish(),
  expectedDate: z.union([z.string(), z.date()]).nullish().transform(val => {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }),
  status: z.nativeEnum(POStatus).nullish().default(POStatus.DRAFT),
  notes: z.string().max(2000, "Notes cannot exceed 2000 characters.").nullish(),
  poNumber: z.string().max(50, "PO Number cannot exceed 50 characters.").nullish(),
  currency: z.string().length(3, "Currency must be a 3-letter ISO code.").nullish().default("NGN"),
  items: z.array(poItemSchema).min(1, "You must add at least one line item to the PO."),
});

/* -------------------------------------------------------------------------- */
/* PERMISSION & NOTIFICATION ENGINES                                          */
/* -------------------------------------------------------------------------- */

async function canExport(user: AuthenticatedUser): Promise<boolean> {
  if (user.isOrgOwner) return true;
  if ([Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role)) return true;

  try {
    const perm = await prisma.resourcePermission.findFirst({
      where: {
        organizationId: user.organizationId,
        role: user.role,
        resource: Resource.PROCUREMENT,
        actions: { has: PermissionAction.EXPORT },
      },
    });
    return !!perm;
  } catch (e) {
    return false;
  }
}

async function notifyManagement(
  tx: Prisma.TransactionClient,
  organizationId: string,
  branchId: string | null | undefined,
  title: string,
  message: string,
  activityLogId: string
) {
  const targets = await tx.authorizedPersonnel.findMany({
    where: {
      organizationId,
      deletedAt: null,
      disabled: false,
      OR: [{ role: Role.ADMIN }, { role: Role.MANAGER }, { role: Role.AUDITOR }, { isOrgOwner: true }],
    },
    select: { id: true },
  });

  if (targets.length === 0) return;

  await tx.notification.create({
    data: {
      organizationId,
      branchId: branchId ?? undefined,
      type: NotificationType.INVENTORY,
      title,
      message,
      activityLogId,
      recipients: {
        create: targets.map((t) => ({ personnelId: t.id })),
      },
    },
  });
}

/* -------------------------------------------------------------------------- */
/* GET: LIST PROCUREMENT / DROPDOWNS                                          */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
    const user = session.user as AuthenticatedUser;

    const { searchParams } = new URL(req.url);
    const meta = searchParams.get("meta");
    const orgId = user.organizationId;
    
    const isGlobalViewer = [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV].includes(user.role) || user.isOrgOwner;
    const branchIdParam = searchParams.get("branchId");
    
    // [FIX] Correct Branch Isolation for Global Viewers
    // If Admin doesn't pass a branchId param, this correctly resolves to undefined, fetching ALL branches.
    let branchId: string | undefined = user.branchId ?? undefined;
    if (isGlobalViewer) {
      branchId = branchIdParam || undefined; 
    }

    if (meta) {
      if (meta === "vendors") {
        const vendors = await prisma.vendor.findMany({
          where: { organizationId: orgId, deletedAt: null },
          select: { id: true, name: true, email: true, phone: true },
          orderBy: { name: "asc" },
        });
        return NextResponse.json({ items: vendors });
      }

      if (meta === "products") {
        const q = searchParams.get("q") || "";
        const products = await prisma.product.findMany({
          where: { 
            organizationId: orgId, 
            deletedAt: null,
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
              { barcode: { contains: q, mode: "insensitive" } }
            ]
          },
          select: { 
            id: true, 
            name: true, 
            sku: true, 
            barcode: true,
            baseCostPrice: true,
            uom: { select: { id: true, name: true, abbreviation: true } }
          },
          orderBy: { name: "asc" },
          take: 100,
        });

        return NextResponse.json({ 
          items: products.map(p => ({
            ...p,
            productId: p.id,
            costPrice: p.baseCostPrice,
            uomName: p.uom?.name,
            uomAbbreviation: p.uom?.abbreviation // [FIX] Exposing abbreviation explicitly
          })) 
        });
      }
      return NextResponse.json({ error: "Invalid metadata request type." }, { status: 400 });
    }

    const authPO = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.READ,
      resources: RESOURCES.PROCUREMENT,
      userPermissions: user.permissions,
    });
    
    if (!authPO.allowed) return NextResponse.json({ error: "Access Denied: You lack permissions to view Purchase Orders." }, { status: 403 });

    const page = parseIntSafe(searchParams.get("page"), 1);
    const limit = Math.min(parseIntSafe(searchParams.get("limit"), DEFAULT_LIMIT), MAX_LIMIT);
    const search = searchParams.get("search")?.trim() || null;
    const status = searchParams.get("status") || null;
    const from = parseDateSafe(searchParams.get("from"));
    const to = parseDateSafe(searchParams.get("to"));
    
    const exportAll = searchParams.get("export") === "true";
    if (exportAll && !(await canExport(user))) {
      return NextResponse.json({ error: "Access Denied: You lack permissions to export procurement data." }, { status: 403 });
    }

    const take = exportAll ? EXPORT_LIMIT : limit;
    const skip = (page - 1) * take;

    const where: Prisma.PurchaseOrderWhereInput = { 
      organizationId: orgId,
      deletedAt: null 
    };
    
    // Applying the resolved branchId
    if (branchId) where.branchId = branchId;

    if (search) {
      where.OR = [
        { poNumber: { contains: search, mode: "insensitive" } },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
      ];
    }
    
    if (status && status !== "all") {
      const validStatuses = Object.values(POStatus);
      if (validStatuses.includes(status as POStatus)) {
        where.status = status as POStatus;
      }
    }

    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = from;
    if (to) dateFilter.lte = to;
    if (from || to) where.createdAt = dateFilter;

    const [items, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          vendor: { select: { id: true, name: true, email: true, phone: true } },
          items: {
            include: {
              product: { 
                select: { 
                  name: true, 
                  sku: true,
                  uom: { select: { abbreviation: true } }
                } 
              },
            },
          },
          createdBy: { select: { name: true } },
          approvedBy: { select: { name: true } }
        },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    if (exportAll) {
      const header = ["PO Number", "Date", "Vendor", "Status", "Total", "Currency", "Created By", "Approved By"];
      const rows = items.map((it) => [
        it.poNumber,
        it.createdAt.toISOString(),
        it.vendor?.name || "DELETED VENDOR",
        it.status,
        it.totalAmount.toString(),
        it.currency,
        it.createdBy?.name || "System",
        it.approvedBy?.name || "N/A"
      ]);
      const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="procurement_${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({ items, total, page, limit: take });
  } catch (err: any) {
    console.error("[PO_GET_ERROR]", err);
    return NextResponse.json({ error: "An unexpected error occurred while fetching procurement data." }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* POST: CREATE PURCHASE ORDER                                                */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
    const user = session.user as AuthenticatedUser;
    const orgId = user.organizationId;
    
    const requestId = crypto.randomUUID();
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
    const deviceInfo = req.headers.get("user-agent")?.substring(0, 255) ?? "unknown";

    const auth = authorize({
      role: user.role,
      isOrgOwner: user.isOrgOwner,
      action: PermissionAction.CREATE,
      resources: RESOURCES.PROCUREMENT,
      userPermissions: user.permissions,
    });
    
    if (!auth.allowed) {
      return NextResponse.json({ error: "Access Denied: You do not have permission to create or draft Purchase Orders." }, { status: 403 });
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody) return NextResponse.json({ error: "Invalid request. Could not parse the submitted data." }, { status: 400 });

    const parsedBody = createPOSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      const errorMessages = parsedBody.error.issues.map(err => `${err.path.join('.')}: ${err.message}`).join(" | ");
      return NextResponse.json({ error: `Validation Failed - ${errorMessages}` }, { status: 400 });
    }

    const {
      vendorId,
      branchId: bodyBranchId,
      expectedDate,
      status: requestedStatus,
      notes,
      items: validatedItems,
      poNumber: providedPoNumber,
      currency,
    } = parsedBody.data;

    const isGlobalCreator = [Role.ADMIN, Role.MANAGER, Role.DEV].includes(user.role) || user.isOrgOwner;
    const targetBranchId = isGlobalCreator ? (bodyBranchId ?? user.branchId) : user.branchId;
    
    if (!targetBranchId) {
      return NextResponse.json({ error: "Branch resolution failed. Please ensure you are logged into an active branch." }, { status: 400 });
    }

    const branchExists = await prisma.branch.findFirst({
      where: { id: targetBranchId, organizationId: orgId }
    });
    if (!branchExists) {
      return NextResponse.json({ error: "Access Denied: The specified branch does not exist in your organization." }, { status: 403 });
    }

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, organizationId: orgId, deletedAt: null } });
    if (!vendor) {
      return NextResponse.json({ error: "The selected vendor could not be found or has been deactivated." }, { status: 404 });
    }

    const finalStatus = requestedStatus === POStatus.ISSUED ? POStatus.ISSUED : POStatus.DRAFT;

    // Strict Product Organization Boundary Check to prevent cross-tenant injection
    const uniqueProductIds = Array.from(new Set(validatedItems.map((it) => it.productId)));
    const products = await prisma.product.findMany({
      where: { id: { in: uniqueProductIds }, organizationId: orgId, deletedAt: null },
      select: { id: true, name: true, baseCostPrice: true }
    });
    
    if (products.length !== uniqueProductIds.length) {
       return NextResponse.json({ error: "One or more requested products do not exist, are inactive, or belong to another organization." }, { status: 400 });
    }

    const productMap = new Map(products.map(p => [p.id, p]));
    const itemsForInsert = [];

    for (const [idx, it] of validatedItems.entries()) {
      const product = productMap.get(it.productId)!;

      let unitCost: Decimal;
      if (it.unitCost !== undefined && it.unitCost !== null && it.unitCost > 0) {
        unitCost = new Decimal(it.unitCost);
      } else if (product.baseCostPrice && product.baseCostPrice.greaterThan(0)) {
        unitCost = new Decimal(product.baseCostPrice.toString());
      } else {
        const actionVerb = finalStatus === POStatus.ISSUED ? "issue" : "save";
        return NextResponse.json({ 
          error: `Unit cost is missing or zero for '${product.name}' (line ${idx + 1}). Please provide a valid cost to ${actionVerb} this Purchase Order.` 
        }, { status: 400 });
      }

      // Precision rounding to prevent float mismatches downstream
      unitCost = unitCost.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const qty = new Decimal(it.quantityOrdered);
      const totalCost = unitCost.mul(qty).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      itemsForInsert.push({ 
        productId: it.productId, 
        quantityOrdered: it.quantityOrdered, 
        unitCost, 
        totalCost 
      });
    }

    // Final total aggregation rounded correctly
    const totalAmount = itemsForInsert.reduce((sum, it) => sum.add(it.totalCost), new Decimal(0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const created = await prisma.$transaction(async (tx) => {
      let poNumber = providedPoNumber?.trim();
      
      if (!poNumber) {
        poNumber = generatePONumber(targetBranchId);
      }
      
      const existing = await tx.purchaseOrder.findUnique({ where: { organizationId_poNumber: { organizationId: orgId, poNumber } } });
      const finalPoNumber = existing ? `${poNumber}-${crypto.randomBytes(2).toString("hex").toUpperCase()}` : poNumber;

      const po = await tx.purchaseOrder.create({
        data: {
          organizationId: orgId,
          branchId: targetBranchId,
          vendorId,
          poNumber: finalPoNumber,
          status: finalStatus, 
          totalAmount,
          currency: currency ?? "NGN",
          expectedDate,
          notes: notes ?? null,
          createdById: user.id,
          approvedById: finalStatus === POStatus.ISSUED ? user.id : undefined,
          items: {
            create: itemsForInsert.map((it) => ({
              productId: it.productId,
              quantityOrdered: it.quantityOrdered,
              unitCost: it.unitCost,
              totalCost: it.totalCost,
            })),
          },
        },
        include: {
          vendor: { select: { name: true } },
          items: { include: { product: { select: { name: true, sku: true } } } },
        },
      });

      // Audit Log explicitly supplies a blank `from` object to prevent mapping errors
      const log = await createAuditLog(tx, {
        action: `CREATE_PO_${finalStatus}`,
        resource: Resource.PROCUREMENT,
        resourceId: po.id,
        organizationId: orgId,
        branchId: targetBranchId,
        actorId: user.id,
        actorRole: user.role,
        severity: Severity.MEDIUM,
        description: `Created PO ${po.poNumber} (${finalStatus}) for ${po.vendor?.name}`,
        changes: { 
          from: {}, 
          to: { poId: po.id, total: totalAmount.toString(), vendor: po.vendor?.name, status: finalStatus, currency: currency ?? "NGN" } 
        },
        requestId,
        ipAddress,
        deviceInfo,
      });

      if (finalStatus === POStatus.ISSUED) {
        await notifyManagement(
          tx,
          orgId,
          targetBranchId,
          "Purchase Order Issued",
          `PO ${po.poNumber} was created and issued to ${po.vendor?.name}. Total: ${currency ?? "NGN"} ${totalAmount.toFixed(2)}`,
          log.id
        );
      }

      return po;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 15000 
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    console.error("[PO_POST_ERROR]", err);
    return NextResponse.json({ error: "An unexpected database error occurred while trying to save the Purchase Order." }, { status: 500 });
  }
}