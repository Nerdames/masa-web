import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { CustomerType, Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

interface BuyersQuery {
  page?: string;
  limit?: string;
  search?: string;
}

// ---------------------------------------------
// GET: List all BUYER customers
// ---------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = Object.fromEntries(
      req.nextUrl.searchParams.entries()
    ) as BuyersQuery;

    const page = Math.max(Number(params.page ?? 1), 1);
    const limit = Math.max(Number(params.limit ?? 20), 1);
    const search = params.search?.trim();

    const skip = (page - 1) * limit;

    const where: Prisma.CustomerWhereInput = {
      organizationId: session.user.organizationId,
      type: CustomerType.BUYER,
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              orders: true,
              invoices: true,
              sales: true,
            },
          },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    return NextResponse.json({
      data: customers.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        address: c.address,
        orderCount: c._count.orders,
        invoiceCount: c._count.invoices,
        salesCount: c._count.sales,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET BUYERS ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch buyers" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------
// POST: Create a BUYER
// ---------------------------------------------
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
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const buyer = await prisma.customer.create({
      data: {
        organizationId: session.user.organizationId,
        name,
        email: body.email ?? null,
        phone: body.phone ?? null,
        address: body.address ?? null,
        type: CustomerType.BUYER,
      },
    });

    return NextResponse.json(
      {
        id: buyer.id,
        name: buyer.name,
        email: buyer.email,
        phone: buyer.phone,
        address: buyer.address,
        createdAt: buyer.createdAt.toISOString(),
        updatedAt: buyer.updatedAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "Customer already exists in this organization" },
          { status: 409 }
        );
      }
    }

    console.error("CREATE BUYER ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create buyer" },
      { status: 500 }
    );
  }
}


// ---------------------------------------------
// PUT: Update BUYER
// ---------------------------------------------
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
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    // Ensure buyer exists and belongs to org
    const existing = await prisma.customer.findFirst({
      where: {
        id: body.id,
        organizationId: session.user.organizationId,
        type: CustomerType.BUYER,
        deletedAt: null,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Buyer not found" },
        { status: 404 }
      );
    }

    const updateData: Prisma.CustomerUpdateInput = {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.address !== undefined && { address: body.address }),
    };

    const updated = await prisma.customer.update({
      where: { id: body.id },
      data: updateData,
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      address: updated.address,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "Customer already exists in this organization" },
          { status: 409 }
        );
      }

      if (error.code === "P2025") {
        return NextResponse.json(
          { error: "Buyer not found" },
          { status: 404 }
        );
      }
    }

    console.error("UPDATE BUYER ERROR:", error);
    return NextResponse.json(
      { error: "Failed to update buyer" },
      { status: 500 }
    );
  }
}


// ---------------------------------------------
// DELETE: Soft Delete BUYER
// ---------------------------------------------
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    // Ensure buyer exists
    const existing = await prisma.customer.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
        type: CustomerType.BUYER,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            orders: true,
            invoices: true,
            sales: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Buyer not found" },
        { status: 404 }
      );
    }

    // 🔥 Optional safety: Prevent delete if financially active
    if (
      existing._count.orders > 0 ||
      existing._count.invoices > 0 ||
      existing._count.sales > 0
    ) {
      return NextResponse.json(
        { error: "Cannot delete buyer with existing transactions" },
        { status: 409 }
      );
    }

    await prisma.customer.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    return NextResponse.json({ message: "Buyer deleted successfully" });
  } catch (error) {
    console.error("DELETE BUYER ERROR:", error);
    return NextResponse.json(
      { error: "Failed to delete buyer" },
      { status: 500 }
    );
  }
}
