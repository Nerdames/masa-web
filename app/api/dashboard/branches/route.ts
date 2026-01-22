// app/api/dashboard/branches/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Branch } from "@/types";

interface BranchResponse {
  data: Branch[];
}

export async function GET(req: NextRequest) {
  try {
    // ---------------- Session ----------------
    const session = await getServerSession(authOptions);
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized or organization not assigned" },
        { status: 401 }
      );
    }

    const organizationId = session.user.organizationId;

    // ---------------- Fetch branches ----------------
    const branches = await prisma.branch.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: "asc" },
    });

    // ---------------- Map response ----------------
    const data: Branch[] = branches.map((b) => ({
      id: b.id,
      organizationId: b.organizationId,
      name: b.name,
      code: b.code,
      address: b.address ?? null,
      phone: b.phone ?? null,
      email: b.email ?? null,
      deletedAt: b.deletedAt?.toISOString() ?? null,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      organization: undefined, // optional placeholder
      customers: [],
      personnel: [],
      stockMovements: [],
    }));

    const response: BranchResponse = { data };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Dashboard Branches API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch branches" },
      { status: 500 }
    );
  }
}
