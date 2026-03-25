import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const categoryId = params.id;

    // Perform restoration by nulling deletedAt
    const restoredCategory = await prisma.category.update({
      where: { 
        id: categoryId,
        organizationId: session.user.organizationId 
      },
      data: {
        deletedAt: null,
        updatedById: session.user.id,
      },
    });

    return NextResponse.json({ 
      message: "Category restored successfully", 
      data: restoredCategory 
    });
  } catch (err: unknown) {
    console.error("RESTORE Category API Error:", err);
    return NextResponse.json({ error: "Failed to restore category" }, { status: 500 });
  }
}