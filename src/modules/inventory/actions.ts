// src/modules/inventory/actions.ts
"use server";

import prisma from "@/core/lib/prisma";
import { Role, Severity } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

/* -------------------------
   Cursor helpers (base64 JSON)
   ------------------------- */
function encodeCursor(payload: Record<string, any>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}
function decodeCursor(cursor?: string): Record<string, any> | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/* -------------------------
   Decimal conversion helper
   ------------------------- */
function decimalToNumber(value: Decimal | null | undefined): number {
  if (value === null || value === undefined) return 0;
  try {
    return Number(value.toString());
  } catch {
    return parseFloat(value.toString());
  }
}

/* -------------------------
   Paginated result type
   ------------------------- */
export type PaginatedResult<T> = {
  items: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
};

/* -------------------------
   getFortressInventoryPaged
   - Cursor: { id }
   - Order: product.name asc, id asc
   ------------------------- */
export async function getFortressInventoryPaged(
  branchId: string,
  opts?: {
    limit?: number;
    cursor?: string;
    since?: Date;
  }
): Promise<PaginatedResult<any>> {
  if (!branchId) throw new Error("branchId is required");
  const pageSize = Math.min(opts?.limit ?? 50, 500);
  const decoded = decodeCursor(opts?.cursor);
  const decodedId = decoded?.id ?? null;

  const where: any = { branchId, deletedAt: null, ...(opts?.since ? { updatedAt: { gte: opts.since } } : {}) };

  const items = await prisma.branchProduct.findMany({
    where,
    orderBy: [
      { product: { name: "asc" } },
      { id: "asc" },
    ],
    take: pageSize + 1,
    ...(decodedId ? { cursor: { id: decodedId }, skip: 1 } : {}),
    select: {
      id: true,
      branchId: true,
      productId: true,
      stock: true,
      stockVersion: true,
      reorderLevel: true,
      safetyStock: true,
      lastSoldAt: true,
      lastRestockedAt: true,
      vendorId: true,
      sellingPrice: true,
      costPrice: true,
      uomId: true,
      deletedAt: true,
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          barcode: true,
          category: { select: { id: true, name: true } },
          uom: { select: { id: true, name: true, abbreviation: true } },
        },
      },
    },
  });

  const hasMore = items.length > pageSize;
  const pageItems = hasMore ? items.slice(0, pageSize) : items;

  const nextCursor = hasMore ? encodeCursor({ id: pageItems[pageItems.length - 1].id }) : null;
  const prevCursor = pageItems.length ? encodeCursor({ id: pageItems[0].id }) : null;

  const mapped = pageItems.map((it) => ({
    id: it.id,
    branchId: it.branchId,
    productId: it.productId,
    stock: it.stock,
    stockVersion: it.stockVersion,
    reorderLevel: it.reorderLevel,
    safetyStock: it.safetyStock ?? 0,
    lastSoldAt: it.lastSoldAt,
    lastRestockedAt: it.lastRestockedAt,
    vendorId: it.vendorId,
    sellingPrice: decimalToNumber(it.sellingPrice as any),
    costPrice: decimalToNumber(it.costPrice as any),
    uomId: it.uomId,
    deletedAt: it.deletedAt,
    product: {
      id: it.product.id,
      name: it.product.name,
      sku: it.product.sku,
      barcode: it.product.barcode,
      category: it.product.category ? { id: it.product.category.id, name: it.product.category.name } : null,
      uom: it.product.uom ? { id: it.product.uom.id, name: it.product.uom.name, abbreviation: it.product.uom.abbreviation } : null,
    },
  }));

  return { items: mapped, nextCursor, prevCursor, hasMore };
}

/* -------------------------
   getFortressLedgerPaged
   - Cursor: { id, createdAt }
   - Order: createdAt desc, id desc
   ------------------------- */
export async function getFortressLedgerPaged(
  branchId: string,
  opts?: {
    limit?: number;
    cursor?: string;
    since?: Date;
  }
): Promise<PaginatedResult<any>> {
  if (!branchId) throw new Error("branchId is required");
  const pageSize = Math.min(opts?.limit ?? 50, 1000);
  const decoded = decodeCursor(opts?.cursor);
  const decodedId = decoded?.id ?? null;

  const where: any = { branchId, deletedAt: null, ...(opts?.since ? { createdAt: { gte: opts.since } } : {}) };

  const logs = await prisma.activityLog.findMany({
    where,
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take: pageSize + 1,
    ...(decodedId ? { cursor: { id: decodedId }, skip: 1 } : {}),
    select: {
      id: true,
      action: true,
      actorId: true,
      actorRole: true,
      severity: true,
      description: true,
      metadata: true,
      createdAt: true,
      approvalRequestId: true,
      stockMovementId: true,
    },
  });

  const hasMore = logs.length > pageSize;
  const pageLogs = hasMore ? logs.slice(0, pageSize) : logs;

  const nextCursor = hasMore ? encodeCursor({ id: pageLogs[pageLogs.length - 1].id, createdAt: pageLogs[pageLogs.length - 1].createdAt }) : null;
  const prevCursor = pageLogs.length ? encodeCursor({ id: pageLogs[0].id, createdAt: pageLogs[0].createdAt }) : null;

  const mapped = pageLogs.map((l) => ({
    id: l.id,
    action: l.action,
    actorId: l.actorId,
    actorRole: (l.actorRole as Role) ?? null,
    severity: (l.severity as Severity) ?? null,
    description: l.description,
    metadata: l.metadata ?? null,
    approvalRequestId: l.approvalRequestId ?? null,
    stockMovementId: l.stockMovementId ?? null,
    createdAt: l.createdAt,
  }));

  return { items: mapped, nextCursor, prevCursor, hasMore };
}

/* -------------------------
   Backwards-compatible wrappers
   - Export the original names your UI expects.
   - These call the paged versions with sensible defaults.
   ------------------------- */

/**
 * Backwards-compatible: returns the first page (limit default 1000) of inventory.
 * Kept for callers that expect getFortressInventory.
 */
export async function getFortressInventory(branchId: string) {
  const res = await getFortressInventoryPaged(branchId, { limit: 1000 });
  return res.items;
}

/**
 * Backwards-compatible: returns the latest 50 ledger entries.
 * Kept for callers that expect getFortressLedger.
 */
export async function getFortressLedger(branchId: string) {
  const res = await getFortressLedgerPaged(branchId, { limit: 50 });
  return res.items;
}
