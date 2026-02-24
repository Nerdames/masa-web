import dayjs from "dayjs";
import { Decimal } from "@prisma/client/runtime/library";
import { findBranchProducts } from "../repositories/inventory.repo";
import type { ProductsResponse, InventoryProduct } from "@/types";

const toNumber = (value: number | Decimal | null | undefined) =>
  value instanceof Decimal ? value.toNumber() : Number(value ?? 0);

export async function getBranchInventory(params: {
  organizationId: string;
  branchId: string;
  page: number;
  pageSize: number;
  search?: string;
  sort?: string;
}): Promise<ProductsResponse> {
  const [total, products] = await findBranchProducts(params);

  let totalQuantity = 0;
  let totalValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let hotCount = 0;
  let discontinuedCount = 0;
  let pendingOrdersTotal = 0;

  const oneYearAgo = dayjs().subtract(1, "year");
  const data: InventoryProduct[] = [];

  for (const product of products) {
    const bp = product.branches[0];
    if (!bp) continue;

    const stock = Number(bp.stock ?? 0);
    const reorderLevel = Number(bp.reorderLevel ?? 0);
    const sellingPrice = toNumber(bp.sellingPrice);

    totalQuantity += stock;
    totalValue += stock * sellingPrice;

    const totalSold = bp.sales.reduce(
      (sum, sale) => sum + Number(sale.quantity),
      0
    );

    const pendingOrders = bp.orderItems.reduce(
      (sum, item) => sum + Number(item.quantity),
      0
    );

    pendingOrdersTotal += pendingOrders;

    let tag: InventoryProduct["tag"] = "NORMAL";
    const lastRestocked = bp.lastRestockedAt
      ? dayjs(bp.lastRestockedAt)
      : null;

    if (!lastRestocked || lastRestocked.isBefore(oneYearAgo)) {
      tag = "DISCONTINUED";
      discontinuedCount++;
    } else if (stock <= 0) {
      tag = "OUT_OF_STOCK";
      outOfStockCount++;
    } else if (stock <= reorderLevel) {
      tag = "LOW_STOCK";
      lowStockCount++;
    } else if (stock > reorderLevel * 2) {
      tag = "HOT";
      hotCount++;
    }

    data.push({
      id: product.id,
      organizationId: product.organizationId,
      name: product.name,
      sku: product.sku,
      category: product.category,
      stock,
      sellingPrice,
      pendingOrders,
      totalSold,
      vendor: bp.vendor,
      lastRestockedAt: bp.lastRestockedAt,
      tag,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    } as InventoryProduct);
  }

  return {
    data,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalQuantity,
    totalValue,
    lowStockCount,
    outOfStockCount,
    discontinuedCount,
    hotCount,
    pendingOrders: pendingOrdersTotal,
  };
}