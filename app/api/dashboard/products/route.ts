import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { 
  getBranchInventory, 
  createBranchInventory, 
  deleteBranchInventory 
} from "@/lib/services/inventory.service";

/**
 * GET: Fetch paginated and filtered inventory for the current branch.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId || !session.user.branchId) {
      return NextResponse.json(
        { error: "Unauthorized: Missing organization or branch context." }, 
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.max(1, Number(searchParams.get("pageSize") ?? 50));
    const search = searchParams.get("search") || undefined;
    const sort = searchParams.get("sort") || undefined;
    const categoryId = searchParams.get("categoryId") || undefined;

    const response = await getBranchInventory({
      organizationId: session.user.organizationId,
      branchId: session.user.branchId,
      page,
      pageSize,
      search,
      sort,
      categoryId,
    });

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("[INVENTORY_GET_ERROR]:", error);
    return NextResponse.json(
      { error: "Failed to fetch inventory records." },
      { status: 500 }
    );
  }
}

/**
 * POST: Create a global product record (if new) and link it to the branch inventory.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.organizationId || !session.user.branchId) {
      return NextResponse.json(
        { error: "Unauthorized: Active session required." }, 
        { status: 401 }
      );
    }

    const body = await req.json();

    const result = await createBranchInventory({
      ...body,
      organizationId: session.user.organizationId,
      branchId: session.user.branchId,
      personnelId: session.user.id,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error("[INVENTORY_POST_ERROR]:", error);
    const message = error instanceof Error ? error.message : "Failed to create inventory item.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE: Bulk soft-delete inventory records explicitly scoped to the branch.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.organizationId || !session?.user?.branchId) {
      return NextResponse.json(
        { error: "Unauthorized: Organization & Branch context required." }, 
        { status: 401 }
      );
    }

    const body = await req.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Bad Request: No item identifiers provided for deletion." }, 
        { status: 400 }
      );
    }

    // Passes both org and branch IDs to ensure a user cannot delete another branch's items
    await deleteBranchInventory(ids, session.user.organizationId, session.user.branchId);
    
    return NextResponse.json({ 
      success: true, 
      message: `${ids.length} items successfully removed.` 
    });
  } catch (error: unknown) {
    console.error("[INVENTORY_DELETE_ERROR]:", error);
    return NextResponse.json(
      { error: "Bulk deletion process failed." }, 
      { status: 500 }
    );
  }
}