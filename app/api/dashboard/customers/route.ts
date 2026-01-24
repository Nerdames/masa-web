import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { CustomerType, Prisma } from "@prisma/client";

/* --------------------------
 * Types
 * ------------------------- */
interface GetParams {
  search?: string;
  type?: CustomerType | "ALL";
  page?: string;
  perPage?: string;
  organizationId?: string;
}

interface CreateCustomerInput {
  name: string;
  type: CustomerType;
  organizationId: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

interface UpdateCustomerInput {
  name?: string;
  type?: CustomerType;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

interface BulkDeleteBody {
  ids: string[];
}

/* --------------------------
 * GET: List customers
 * ------------------------- */
export async function GET(req: NextRequest) {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries()) as GetParams;
    const { search, type, page = "1", perPage = "12", organizationId } = params;

    if (!organizationId) {
      return NextResponse.json({ customers: [], total: 0 });
    }

    const pageNum = parseInt(page, 10);
    const perPageNum = parseInt(perPage, 10);

    const where: Prisma.CustomerWhereInput = { organizationId };

    if (type && type !== "ALL") where.type = type;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    const total = await prisma.customer.count({ where });

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * perPageNum,
      take: perPageNum,
      include: {
        organization: true,
        orders: true,
        sales: true,
        tags: true,
        groups: true,
      },
    });

    return NextResponse.json({ customers, total });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ customers: [], total: 0 }, { status: 500 });
  }
}

/* --------------------------
 * POST: Create customer
 * ------------------------- */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateCustomerInput;

    const { name, type, organizationId } = body;
    if (!name || !type || !organizationId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const customer = await prisma.customer.create({ data: body });
    return NextResponse.json(customer);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}

/* --------------------------
 * PATCH: Update customer
 * ------------------------- */
export async function PATCH(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Customer ID required" }, { status: 400 });

    const body = (await req.json()) as UpdateCustomerInput;

    const customer = await prisma.customer.update({ where: { id }, data: body });
    return NextResponse.json(customer);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}

/* --------------------------
 * DELETE: Bulk delete customers
 * ------------------------- */
export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json()) as BulkDeleteBody;

    if (!body?.ids?.length) {
      return NextResponse.json({ error: "No customer IDs provided" }, { status: 400 });
    }

    const deleteResult = await prisma.customer.deleteMany({
      where: { id: { in: body.ids } },
    });

    return NextResponse.json({ success: true, deletedCount: deleteResult.count });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete customers" }, { status: 500 });
  }
}
