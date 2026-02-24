"use server";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { CustomerType, Prisma, SaleStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import dayjs from "dayjs";

/* =========================================================
   Helpers
========================================================= */

function safeNumber(value: number | null | undefined): number {
  return Number(value ?? 0);
}

type Segment = "VIP" | "LOYAL" | "REGULAR" | "NEW" | "AT_RISK";

/* =========================================================
   GET — Dashboard Customers
========================================================= */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId || !session.user.role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { organizationId, branchId, isOrgOwner } = session.user;

    const params = req.nextUrl.searchParams;

    const page = Math.max(Number(params.get("page") ?? 1), 1);
    const limit = Math.max(Number(params.get("limit") ?? 20), 1);
    const skip = (page - 1) * limit;

    const search = params.get("search")?.trim();
    const type = params.get("type") as CustomerType | "ALL" | null;
    const from = params.get("from");
    const to = params.get("to");

    const dateFilter =
      from && to
        ? {
            createdAt: {
              gte: new Date(from),
              lte: new Date(to),
            },
          }
        : {};

    const where: Prisma.CustomerWhereInput = {
      organizationId,
      deletedAt: null,
      ...(type && type !== "ALL" && { type }),
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
          sales: {
            where: {
              organizationId,
              status: SaleStatus.COMPLETED,
              deletedAt: null,
              ...(isOrgOwner ? {} : { branchId }),
              ...dateFilter,
            },
            select: {
              total: true,
              createdAt: true,
            },
          },
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

    /* ============================
       Compute Analytics
    ============================ */

    const processed = customers.map((c) => {
      const totalSpent = c.sales.reduce(
        (sum, sale) => sum + safeNumber(sale.total),
        0
      );

      const totalOrders = c._count.orders;

      const salesDates = c.sales.map((s) => s.createdAt);

      const lastPurchaseAt =
        salesDates.length > 0
          ? salesDates.sort((a, b) => b.getTime() - a.getTime())[0]
          : null;

      const firstPurchaseAt =
        salesDates.length > 0
          ? salesDates.sort((a, b) => a.getTime() - b.getTime())[0]
          : null;

      const recencyInDays = lastPurchaseAt
        ? dayjs().diff(dayjs(lastPurchaseAt), "day")
        : 999;

      const averageOrderValue =
        totalOrders > 0 ? totalSpent / totalOrders : 0;

      return {
        id: c.id,
        name: c.name,
        type: c.type,
        email: c.email,
        phone: c.phone,
        totalSpent,
        totalOrders,
        averageOrderValue,
        recencyInDays,
        lastPurchaseAt,
        firstPurchaseAt,
        performanceScore: 0,
        segment: "REGULAR" as Segment,
        createdAt: c.createdAt,
      };
    });

    /* ============================
       Normalize Scoring (RFM)
       40% Monetary
       30% Frequency
       30% Recency (inverse)
    ============================ */

    const maxSpent = Math.max(...processed.map((c) => c.totalSpent), 1);
    const maxOrders = Math.max(...processed.map((c) => c.totalOrders), 1);
    const maxRecency = Math.max(...processed.map((c) => c.recencyInDays), 1);

    processed.forEach((c) => {
      const monetaryScore = (c.totalSpent / maxSpent) * 40;
      const frequencyScore = (c.totalOrders / maxOrders) * 30;
      const recencyScore =
        ((maxRecency - c.recencyInDays) / maxRecency) * 30;

      const score = Math.round(
        monetaryScore + frequencyScore + recencyScore
      );

      c.performanceScore = score;

      // Segmentation
      if (score >= 80) c.segment = "VIP";
      else if (score >= 60) c.segment = "LOYAL";
      else if (score >= 40) c.segment = "REGULAR";
      else if (c.recencyInDays < 30) c.segment = "NEW";
      else c.segment = "AT_RISK";
    });

    /* ============================
       Leaders
    ============================ */

    const sorted = [...processed].sort(
      (a, b) => b.performanceScore - a.performanceScore
    );

    const topCustomer = sorted[0] ?? null;

    const highestSpendingCustomer =
      [...processed].sort((a, b) => b.totalSpent - a.totalSpent)[0] ?? null;

    const mostFrequentCustomer =
      [...processed].sort((a, b) => b.totalOrders - a.totalOrders)[0] ?? null;

    const totalRevenue = processed.reduce(
      (sum, c) => sum + c.totalSpent,
      0
    );

    return NextResponse.json({
      summary: {
        totalCustomers: total,
        totalRevenue,
        averageCustomerValue:
          total > 0 ? totalRevenue / total : 0,
        topCustomer,
        highestSpendingCustomer,
        mostFrequentCustomer,
      },
      leaderboard: sorted.slice(0, 10),
      customers: sorted,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("CUSTOMER DASHBOARD ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load customer dashboard" },
      { status: 500 }
    );
  }
}

/* =========================================================
   POST — Create Customer
========================================================= */

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (
      !session?.user?.organizationId ||
      (session.user.role !== "ADMIN" && !session.user.isOrgOwner)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const organizationId = session.user.organizationId;

    const body: {
      name?: string;
      type?: CustomerType;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
    } = await req.json();

    if (!body.name || !body.type) {
      return NextResponse.json(
        { error: "Name and type are required" },
        { status: 400 }
      );
    }

    const customer = await prisma.customer.create({
      data: {
        organizationId,
        name: body.name.trim(),
        type: body.type,
        email: body.email ?? null,
        phone: body.phone ?? null,
        address: body.address ?? null,
      },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Customer already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create customer" },
      { status: 500 }
    );
  }
}

/* =========================================================
   PATCH — Update Customer
========================================================= */

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (
      !session?.user?.organizationId ||
      (session.user.role !== "ADMIN" && !session.user.isOrgOwner)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const organizationId = session.user.organizationId;

    const body: {
      id?: string;
      name?: string;
      type?: CustomerType;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
    } = await req.json();

    if (!body.id) {
      return NextResponse.json(
        { error: "Customer ID required" },
        { status: 400 }
      );
    }

    const existing = await prisma.customer.findFirst({
      where: { id: body.id, organizationId, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    const updated = await prisma.customer.update({
      where: { id: body.id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.address !== undefined && { address: body.address }),
      },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "Failed to update customer" },
      { status: 500 }
    );
  }
}

/* =========================================================
   DELETE — Soft Delete
========================================================= */

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (
      !session?.user?.organizationId ||
      (session.user.role !== "ADMIN" && !session.user.isOrgOwner)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const organizationId = session.user.organizationId;
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Customer ID required" },
        { status: 400 }
      );
    }

    const existing = await prisma.customer.findFirst({
      where: { id, organizationId, deletedAt: null },
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
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    if (
      existing._count.orders > 0 ||
      existing._count.invoices > 0 ||
      existing._count.sales > 0
    ) {
      return NextResponse.json(
        { error: "Customer has existing transactions" },
        { status: 409 }
      );
    }

    await prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({
      message: "Customer deleted successfully",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete customer" },
      { status: 500 }
    );
  }
}