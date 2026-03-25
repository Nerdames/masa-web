import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Check for session and organization access
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch only active categories
    const categories = await prisma.category.findMany({
      where: { 
        organizationId: session.user.organizationId,
        deletedAt: null, // Filter out soft-deleted categories
      },
      orderBy: { name: "asc" },
      select: { 
        id: true, 
        name: true,
        description: true,
        createdAt: true 
      },
    });

    return NextResponse.json({ data: categories });
  } catch (err: unknown) {
    console.error("Categories API Error:", err);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Authorization: Ensure user belongs to an organization
    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, description } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 });
    }

    // Create category with audit fields
    const newCategory = await prisma.category.create({
      data: {
        name,
        description,
        organizationId: session.user.organizationId,
        createdById: session.user.id, // Audit trail: who created this?
      },
    });

    return NextResponse.json({ data: newCategory }, { status: 201 });
  } catch (err: unknown) {
    console.error("POST Category API Error:", err);
    
    // Prisma unique constraint violation (name already exists in org)
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
    }

    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}