import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

interface SuppliersQuery {
  page?: string;
  pageSize?: string;
  search?: string;
}

// -----------------------------------------------------------------------------
// GET SUPPLIERS
// -----------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.organizationId || !session.user.branchId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = session.user.organizationId;
    const branchId = session.user.branchId;

    const params = Object.fromEntries(
      req.nextUrl.searchParams.entries()
    ) as SuppliersQuery;

    const page = Math.max(Number(params.page ?? 1), 1);
    const pageSize = Math.max(Number(params.pageSize ?? 10), 1);
    const search = params.search?.trim();

    const where: Prisma.SupplierWhereInput = {
      organizationId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [total, suppliers] = await Promise.all([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          branchProducts: {
            where: { branchId },
            select: { id: true },
          },
        },
      }),
    ]);

    return NextResponse.json({
      data: suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        phone: s.phone,
        address: s.address,
        hasProductsInBranch: s.branchProducts.length > 0,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("GET suppliers failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch suppliers" },
      { status: 500 }
    );
  }
}

// -----------------------------------------------------------------------------
// CREATE SUPPLIER
// -----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: {
      name?: string;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
    } = await req.json();

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json(
        { error: "Supplier name is required" },
        { status: 400 }
      );
    }

    const supplier = await prisma.supplier.create({
      data: {
        organizationId: session.user.organizationId,
        name,
        email: body.email ?? null,
        phone: body.phone ?? null,
        address: body.address ?? null,
      },
    });

    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "Supplier already exists in this organization" },
          { status: 409 }
        );
      }
    }

    console.error("CREATE supplier failed:", error);
    return NextResponse.json(
      { error: "Failed to create supplier" },
      { status: 500 }
    );
  }
}

// -----------------------------------------------------------------------------
// UPDATE SUPPLIER
// -----------------------------------------------------------------------------
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: {
      id?: string;
      name?: string;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
    } = await req.json();

    if (!body.id) {
      return NextResponse.json(
        { error: "Supplier ID required" },
        { status: 400 }
      );
    }

    // Ensure supplier belongs to organization
    const existing = await prisma.supplier.findFirst({
      where: {
        id: body.id,
        organizationId: session.user.organizationId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Supplier not found" },
        { status: 404 }
      );
    }

    const updateData: Prisma.SupplierUpdateInput = {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.address !== undefined && { address: body.address }),
    };

    const supplier = await prisma.supplier.update({
      where: { id: body.id },
      data: updateData,
    });

    return NextResponse.json(supplier);
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "Supplier already exists in this organization" },
          { status: 409 }
        );
      }

      if (error.code === "P2025") {
        return NextResponse.json(
          { error: "Supplier not found" },
          { status: 404 }
        );
      }
    }

    console.error("UPDATE supplier failed:", error);
    return NextResponse.json(
      { error: "Failed to update supplier" },
      { status: 500 }
    );
  }
}

// -----------------------------------------------------------------------------
// DELETE SUPPLIER
// -----------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Supplier ID required" },
        { status: 400 }
      );
    }

    // Ensure supplier belongs to organization
    const supplier = await prisma.supplier.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
    });

    if (!supplier) {
      return NextResponse.json(
        { error: "Supplier not found" },
        { status: 404 }
      );
    }

    // Prevent delete if linked to products
    const linkedProducts = await prisma.branchProduct.count({
      where: {
        supplierId: id,
        organizationId: session.user.organizationId,
      },
    });

    if (linkedProducts > 0) {
      return NextResponse.json(
        { error: "Cannot delete supplier with linked products" },
        { status: 409 }
      );
    }

    await prisma.supplier.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Supplier deleted" });
  } catch (error) {
    console.error("DELETE supplier failed:", error);
    return NextResponse.json(
      { error: "Failed to delete supplier" },
      { status: 500 }
    );
  }
}
