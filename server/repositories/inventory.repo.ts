import prisma from "@/lib/prisma";
import { Prisma, OrderStatus, SaleStatus } from "@prisma/client";

export async function findBranchProducts(params: {
  organizationId: string;
  branchId: string;
  search?: string;
  page: number;
  pageSize: number;
  sort?: string;
}) {
  const { organizationId, branchId, search, page, pageSize, sort } = params;

  let orderBy: Prisma.ProductOrderByWithRelationInput = {
    createdAt: "desc",
  };

  if (sort === "az") orderBy = { name: "asc" };

  const where: Prisma.ProductWhereInput = {
    organizationId,
    deletedAt: null,
    branches: { some: { branchId, organizationId } },
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
        { category: { name: { contains: search, mode: "insensitive" } } },
      ],
    }),
  };

  return Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy,
      include: {
        category: true,
        branches: {
          where: { branchId, organizationId },
          include: {
            vendor: true,
            orderItems: {
              where: {
                order: {
                  status: { in: [OrderStatus.DRAFT, OrderStatus.SUBMITTED] },
                  deletedAt: null,
                  organizationId,
                },
              },
            },
            sales: {
              where: {
                status: SaleStatus.COMPLETED,
                deletedAt: null,
                organizationId,
              },
            },
            stockMoves: {
              take: 5,
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    }),
  ]);
}