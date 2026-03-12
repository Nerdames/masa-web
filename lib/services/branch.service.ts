import prisma from "@/lib/prisma";
import { Role } from "@prisma/client";

export const BranchService = {
  // Get all active branches with personnel counts
  async getAll(organizationId: string) {
    return await prisma.branch.findMany({
      where: { organizationId, deletedAt: null },
      include: { _count: { select: { personnel: true } } },
      orderBy: { name: "asc" },
    });
  },

  // Create a new branch with initial assignments
  async create(organizationId: string, userId: string, data: { name: string; location?: string; personnel?: { personnelId: string; role: Role }[] }) {
    return await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          name: data.name,
          location: data.location,
          organizationId,
        },
      });

      if (data.personnel?.length) {
        await tx.branchAssignment.createMany({
          data: data.personnel.map(p => ({
            branchId: branch.id,
            personnelId: p.personnelId,
            role: p.role,
          })),
        });
      }
      
      await tx.activityLog.create({
        data: { organizationId, branchId: branch.id, personnelId: userId, action: "BRANCH_CREATED", critical: true },
      });
      return branch;
    });
  },

  // Soft delete and reassign staff
  async softDeleteAndReassign(organizationId: string, userId: string, branchId: string, newBranchId?: string) {
    return await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({ where: { id: branchId, organizationId } });
      if (!branch) throw new Error("Branch not found");

      // Reset personnel primary branch if they were linked here
      await tx.authorizedPersonnel.updateMany({
        where: { branchId, organizationId },
        data: { branchId: newBranchId || null },
      });

      // Soft delete branch
      const deletedBranch = await tx.branch.update({
        where: { id: branchId },
        data: { deletedAt: new Date(), active: false },
      });

      await tx.activityLog.create({
        data: { organizationId, branchId, personnelId: userId, action: "BRANCH_DELETED", critical: true },
      });
      return deletedBranch;
    });
  }
};