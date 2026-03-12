import prisma from "@/lib/prisma";

export const CategoryService = {
  // Find all active categories for an org
  async getAll(organizationId: string) {
    return await prisma.category.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  // Create a new category
  async create(organizationId: string, userId: string, data: { name: string; description?: string }) {
    return await prisma.category.create({
      data: {
        name: data.name,
        description: data.description,
        organizationId,
        createdById: userId,
      },
    });
  },

  // Merge categories and soft-delete the old one
  async mergeAndDelete(organizationId: string, userId: string, oldId: string, targetId: string) {
    return await prisma.$transaction(async (tx) => {
      // 1. Move all products
      await tx.product.updateMany({
        where: { categoryId: oldId, organizationId },
        data: { categoryId: targetId, updatedById: userId },
      });

      // 2. Move all expenses
      await tx.expense.updateMany({
        where: { categoryId: oldId, organizationId },
        data: { categoryId: targetId, updatedById: userId },
      });

      // 3. Soft delete the old category
      return await tx.category.update({
        where: { id: oldId, organizationId },
        data: { 
          deletedAt: new Date(), 
          updatedById: userId 
        },
      });
    });
  },

  // Restore a deleted category
  async restore(organizationId: string, userId: string, id: string) {
    return await prisma.category.update({
      where: { id, organizationId },
      data: { 
        deletedAt: null, 
        updatedById: userId 
      },
    });
  }
};