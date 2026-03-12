import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const categoryId = params.id;

    // 1. Check for active dependencies (Products or Expenses)
    const activeProducts = await prisma.product.count({
      where: { categoryId, organizationId: session.user.organizationId },
    });

    const activeExpenses = await prisma.expense.count({
      where: { categoryId, organizationId: session.user.organizationId },
    });

    if (activeProducts > 0 || activeExpenses > 0) {
      return NextResponse.json(
        { error: "Cannot delete category: it is still linked to products or expenses." },
        { status: 400 }
      );
    }

    // 2. Perform Soft Delete
    const deletedCategory = await prisma.category.update({
      where: { id: categoryId },
      data: {
        deletedAt: new Date(),
        updatedById: session.user.id,
      },
    });

    return NextResponse.json({ message: "Category deleted successfully", data: deletedCategory });
  } catch (err: unknown) {
    console.error("DELETE Category API Error:", err);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}