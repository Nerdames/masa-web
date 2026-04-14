// File: src/modules/inventory/actions.ts
"use server";

import prisma from "@/core/lib/prisma";
import { Role, Severity, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

/* -------------------------
   Types & Utilities
------------------------- */
export type PaginatedResult<T> = {
  items: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
};

export interface FortressInventoryItem {
  id: string;
  branchId: string;
  productId: string;
  stock: number;
  stockVersion: number;
  reorderLevel: number;
  safetyStock: number;
  lastSoldAt: Date | null;
  lastRestockedAt: Date | null;
  vendorId: string | null;
  sellingPrice: number;
  costPrice: number;
  uomId: string | null;
  deletedAt: Date | null;
  product: {
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    category: { id: string; name: string } | null;
    uom: { id: string; name: string; abbreviation: string } | null;
  };
}

export interface FortressLedgerLog {
  id: string;
  action: string;
  actorId: string;
  actorRole: Role | null;
  severity: Severity;
  description: string;
  metadata: any;
  targetId: string | null;
  targetType: string | null;
  createdAt: Date;
  hash: string | null; 
}

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

function decimalToNumber(value: Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value.toString());
}

/* -------------------------
   Inventory Paging Logic
------------------------- */
export async function getFortressInventoryPaged(
  branchId: string,
  opts?: { limit?: number; cursor?: string; search?: string }
): Promise<PaginatedResult<FortressInventoryItem>> {
  if (!branchId) throw new Error("Branch ID required");

  const pageSize = Math.min(opts?.limit ?? 50, 500);
  const decoded = decodeCursor(opts?.cursor);
  
  const searchFilter: Prisma.BranchProductWhereInput = opts?.search
    ? {
        product: {
          OR: [
            { name: { contains: opts.search, mode: "insensitive" } },
            { sku: { contains: opts.search, mode: "insensitive" } },
          ],
        },
      }
    : {};

  const where: Prisma.BranchProductWhereInput = {
    branchId,
    deletedAt: null,
    ...searchFilter,
  };

  const items = await prisma.branchProduct.findMany({
    where,
    orderBy: [{ product: { name: "asc" } }, { id: "asc" }],
    take: pageSize + 1,
    ...(decoded?.id ? { cursor: { id: decoded.id }, skip: 1 } : {}),
    include: {
      product: {
        include: {
          category: { select: { id: true, name: true } },
          uom: { select: { id: true, name: true, abbreviation: true } },
        },
      },
    },
  });

  const hasMore = items.length > pageSize;
  const pageItems = hasMore ? items.slice(0, pageSize) : items;

  const mapped: FortressInventoryItem[] = pageItems.map((it) => ({
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
    sellingPrice: decimalToNumber(it.sellingPrice),
    costPrice: decimalToNumber(it.costPrice ?? it.product.costPrice),
    uomId: it.uomId ?? it.product.uomId,
    deletedAt: it.deletedAt,
    product: it.product,
  }));

  return {
    items: mapped,
    nextCursor: hasMore ? encodeCursor({ id: mapped[mapped.length - 1].id }) : null,
    prevCursor: mapped.length ? encodeCursor({ id: mapped[0].id }) : null,
    hasMore,
  };
}

/* -------------------------
   Forensic Ledger Paging
------------------------- */
export async function getFortressLedgerPaged(
  branchId: string,
  opts?: { limit?: number; cursor?: string }
): Promise<PaginatedResult<FortressLedgerLog>> {
  if (!branchId) throw new Error("Branch ID required");

  const pageSize = Math.min(opts?.limit ?? 50, 1000);
  const decoded = decodeCursor(opts?.cursor);

  // Filter logs relevant to the inventory/stock fortress
  const where: Prisma.ActivityLogWhereInput = {
    branchId,
    targetType: { in: ["STOCK", "PRODUCT", "STOCK_ADJUST", "STOCK_TRANSFER", "GRN"] }
  };

  const logs = await prisma.activityLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    ...(decoded?.id ? { cursor: { id: decoded.id }, skip: 1 } : {}),
  });

  const hasMore = logs.length > pageSize;
  const pageLogs = hasMore ? logs.slice(0, pageSize) : logs;

  const mapped: FortressLedgerLog[] = pageLogs.map((l) => ({
    id: l.id,
    action: l.action,
    actorId: l.actorId ?? "SYSTEM",
    actorRole: l.actorRole as Role,
    severity: l.severity as Severity,
    description: l.description,
    metadata: l.metadata,
    targetId: l.targetId,
    targetType: l.targetType,
    createdAt: l.createdAt,
    hash: l.hash,
  }));

  return {
    items: mapped,
    nextCursor: hasMore ? encodeCursor({ id: mapped[mapped.length - 1].id }) : null,
    prevCursor: mapped.length ? encodeCursor({ id: mapped[0].id }) : null,
    hasMore,
  };
}