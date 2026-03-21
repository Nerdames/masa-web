import prisma from "@/lib/prisma";
import { Prisma, StockMovementType } from "@prisma/client";

/**
 * GET: Fetch paginated branch inventory with audit metadata
 */
export async function getBranchInventory(params: {
  organizationId: string;
  branchId: string;
  page: number;
  pageSize: number;
  search?: string;
  sort?: string;
  categoryId?: string;
}) {
  const { organizationId, branchId, page, pageSize, search, sort, categoryId } = params;
  const skip = (page - 1) * pageSize;

  const where: Prisma.BranchProductWhereInput = {
    organizationId,
    branchId,
    deletedAt: null,
    product: {
      deletedAt: null,
      ...(categoryId && { categoryId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
        ],
      }),
    },
  };

  const [total, items] = await prisma.$transaction([
    prisma.branchProduct.count({ where }),
    prisma.branchProduct.findMany({
      where,
      skip,
      take: pageSize,
      include: {
        product: { include: { category: true } },
        vendor: { select: { id: true, name: true } }, // Included for the Edit Modal
      },
      orderBy: { id: "desc" },
    }),
  ]);

  // Transform to match InventoryItem interface & prevent serialization issues
  const formattedItems = items.map((item) => {
    const stock = item.stock || 0;
    const reorderLevel = item.reorderLevel || 0;
    
    let stockLevel: 'In Stock' | 'Low Stock' | 'Out of Stock' = 'In Stock';
    if (stock <= 0) stockLevel = 'Out of Stock';
    else if (stock <= reorderLevel) stockLevel = 'Low Stock';

    return {
      id: item.id,
      productId: item.productId,
      name: item.product.name,
      sku: item.product.sku,
      category: item.product.category?.name || "Uncategorized",
      categoryId: item.product.categoryId,
      stock: item.stock,
      stockVersion: item.stockVersion, // CRITICAL for the Adjust Modal
      stockLevel,
      sellingPrice: Number(item.sellingPrice || 0),
      costPrice: Number(item.costPrice || 0),
      reorderLevel: item.reorderLevel,
      vendorId: item.vendorId,
      vendorName: item.vendor?.name,
      unit: item.unit || "pcs",
      dateAdded: item.product.createdAt.toISOString(),
      lastRestockedAt: item.lastRestockedAt?.toISOString() || null,
    };
  });

  return {
    data: formattedItems,
    meta: {
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize) || 1,
    },
  };
}

// ... createBranchInventory and deleteBranchInventory remain the same

/**
 * POST: Create/Upsert Global Product, Create Branch Instance, and Log Stock Movement
 */
export async function createBranchInventory(data: {
  organizationId: string;
  branchId: string;
  name: string;
  sku: string;
  categoryId: string;
  stock: number;
  costPrice: number;
  sellingPrice: number;
  reorderLevel: number;
  vendorId?: string;
  personnelId?: string; // Passed from session for auditing
}) {
  return await prisma.$transaction(async (tx) => {
    // 1. Upsert global product for the organization
    const product = await tx.product.upsert({
      where: {
        organizationId_sku: {
          organizationId: data.organizationId,
          sku: data.sku,
        },
      },
      update: { name: data.name, categoryId: data.categoryId },
      create: {
        organizationId: data.organizationId,
        name: data.name,
        sku: data.sku,
        categoryId: data.categoryId,
        costPrice: new Prisma.Decimal(data.costPrice),
      },
    });

    // 2. Create branch-specific inventory record
    const branchProduct = await tx.branchProduct.create({
      data: {
        organizationId: data.organizationId,
        branchId: data.branchId,
        productId: product.id,
        vendorId: data.vendorId,
        stock: data.stock,
        costPrice: new Prisma.Decimal(data.costPrice),
        sellingPrice: new Prisma.Decimal(data.sellingPrice),
        reorderLevel: data.reorderLevel,
        lastRestockedAt: data.stock > 0 ? new Date() : null,
      },
    });

    // 3. Automate Stock Movement audit log if initial stock is > 0
    if (data.stock > 0) {
      await tx.stockMovement.create({
        data: {
          organizationId: data.organizationId,
          branchId: data.branchId,
          branchProductId: branchProduct.id,
          productId: product.id,
          type: StockMovementType.IN,
          quantity: data.stock,
          unitCost: new Prisma.Decimal(data.costPrice),
          totalCost: new Prisma.Decimal(data.costPrice * data.stock),
          reason: "Initial Stock Registration",
          handledById: data.personnelId,
        }
      });
    }

    return branchProduct;
  });
}

/**
 * DELETE: Bulk soft-delete enforcing branch-level isolation
 */
export async function deleteBranchInventory(ids: string[], organizationId: string, branchId: string) {
  return await prisma.branchProduct.updateMany({
    where: {
      id: { in: ids },
      organizationId,
      branchId, 
    },
    data: {
      deletedAt: new Date(),
    },
  });
}