import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Customer, CustomerType, Prisma } from "@prisma/client";

interface GetParams {
  search?: string;
  type?: CustomerType | "ALL";
  page?: string;
  perPage?: string;
  organizationId?: string;
}

export async function GET(req: NextRequest) {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries()) as GetParams;
    const { search, type, page = "1", perPage = "12", organizationId } = params;

    if (!organizationId) {
      return NextResponse.json({ customers: [], total: 0 });
    }

    const pageNum = parseInt(page, 10);
    const perPageNum = parseInt(perPage, 10);

    // ✅ Use Prisma.CustomerWhereInput for proper typing
    const where: Prisma.CustomerWhereInput = { organizationId };

    if (type && type !== "ALL") {
      where.type = type;
    }

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
    });

    return NextResponse.json({ customers, total });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ customers: [], total: 0 }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: Pick<Customer, "name" | "email" | "phone" | "type" | "organizationId"> = await req.json();

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

export async function PATCH(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Customer ID required" }, { status: 400 });
    }

    const body: Partial<Omit<Customer, "id" | "createdAt" | "updatedAt">> = await req.json();

    const customer = await prisma.customer.update({ where: { id }, data: body });
    return NextResponse.json(customer);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Customer ID required" }, { status: 400 });
    }

    await prisma.customer.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}
