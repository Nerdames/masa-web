import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const oldCategoryId = params.id;
    const { targetCategoryId } = await req.json();

    if (oldCategoryId === targetCategoryId) {
      return NextResponse.json({ error: "Cannot merge category into itself" }, { status: 400 });
    }

    // Atomic transaction for data migration
    await prisma.$transaction(async (tx) => {
      // 1. Move all products
      await tx.product.updateMany({
        where: { categoryId: oldCategoryId, organizationId: session.user.organizationId },
        data: { categoryId: targetCategoryId },
      });

      // 2. Move all expenses
      await tx.expense.updateMany({
        where: { categoryId: oldCategoryId, organizationId: session.user.organizationId },
        data: { categoryId: targetCategoryId },
      });

      // 3. Soft delete the old category
      await tx.category.update({
        where: { id: oldCategoryId },
        data: { 
          deletedAt: new Date(),
          updatedById: session.user.id 
        },
      });
    });

    return NextResponse.json({ message: "Category merged and deleted successfully" });
  } catch (err: unknown) {
    console.error("MERGE Category API Error:", err);
    return NextResponse.json({ error: "Failed to merge category" }, { status: 500 });
  }
}