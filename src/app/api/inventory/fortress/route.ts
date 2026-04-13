// src/app/api/inventory/fortress/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { getFortressInventoryPaged, getFortressLedgerPaged } from "@/modules/inventory/actions";
import { Role } from "@prisma/client";

/**
 * PRODUCTION SECURITY: Verifies session validity and branch access.
 * Implements isolation to prevent cross-branch data leaks.
 */
async function authorizeRequest(
  user: any, 
  branchId: string, 
  resource: "INVENTORY" | "LEDGER"
): Promise<boolean> {
  // 1. Session integrity check
  if (!user?.id || user.disabled || user.locked || user.expired) return false;

  // 2. Resolve target branch to verify ownership
  const branch = await prisma.branch.findUnique({ 
    where: { id: branchId }, 
    select: { organizationId: true } 
  });
  if (!branch || branch.organizationId !== user.organizationId) return false;

  // 3. Admin/Owner Bypass: Org Owners and Admins have global visibility
  if (user.isOrgOwner || user.role === Role.ADMIN) return true;

  // 4. Branch Isolation: Verify the user is explicitly assigned to this branch
  if (user.branchId !== branchId) return false;

  // 5. Role-based granular check
  const READ_ROLES: Role[] = [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.AUDITOR];
  if (READ_ROLES.includes(user.role)) return true;

  // 6. Final Permission Table Check (for custom roles)
  const hasPermission = await prisma.permission.findFirst({
    where: {
      organizationId: user.organizationId,
      role: user.role,
      action: "READ",
      resource,
    },
  });

  return !!hasPermission;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Security Kill-Switch: Immediate rejection for expired or invalid sessions
    if (!session?.user || session.user.expired) {
      return NextResponse.json(
        { error: "SESSION_EXPIRED", message: "Your session has timed out." }, 
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId");
    if (!branchId) return NextResponse.json({ error: "Missing branchId" }, { status: 400 });

    const type = searchParams.get("type") === "ledger" ? "ledger" : "inventory";
    const limit = Math.max(1, Math.min(1000, parseInt(searchParams.get("limit") || "50")));
    const cursor = searchParams.get("cursor") || undefined;
    const sinceParam = searchParams.get("since");
    const since = sinceParam ? new Date(sinceParam) : undefined;

    // Execute multi-layered authorization
    const isAuthorized = await authorizeRequest(
      session.user,
      branchId,
      type === "ledger" ? "LEDGER" : "INVENTORY"
    );

    if (!isAuthorized) {
      console.warn(`[SECURITY_ALERT] Forbidden ${type} access attempt by ${session.user.id} on branch ${branchId}`);
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    const data = type === "ledger"
      ? await getFortressLedgerPaged(branchId, { limit, cursor, since })
      : await getFortressInventoryPaged(branchId, { limit, cursor, since });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[FORTRESS_API_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}