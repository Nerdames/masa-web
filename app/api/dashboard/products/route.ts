import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBranchInventory } from "@/server/services/inventory.service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId || !session.user.branchId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = req.nextUrl.searchParams;

    const response = await getBranchInventory({
      organizationId: session.user.organizationId,
      branchId: session.user.branchId,
      page: Number(params.get("page") ?? 1),
      pageSize: Number(params.get("pageSize") ?? 10),
      search: params.get("search") ?? undefined,
      sort: params.get("sort") ?? undefined,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("GET inventory failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch inventory" },
      { status: 500 }
    );
  }
}