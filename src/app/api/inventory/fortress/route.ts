// src/app/api/inventory/fortress/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import {
  getFortressInventoryPaged,
  getFortressLedgerPaged,
} from "@/modules/inventory/actions";
import { Role } from "@prisma/client";

/**
 * Authenticated, production-ready API route for Fortress inventory & ledger.
 *
 * Query params:
 *  - branchId (required)
 *  - type = "inventory" | "ledger" (default: inventory)
 *  - limit (optional)
 *  - cursor (optional)
 *  - since (optional ISO date)
 *
 * Security:
 *  - Uses next-auth server session (getServerSession + authOptions).
 *  - Validates that the session user belongs to the same organization as the branch.
 *  - Checks role-based allow-list and falls back to granular Permission table.
 *
 * Notes:
 *  - Ensure authOptions exposes user.id, user.role, user.organizationId, user.isOrgOwner in the session.
 *  - This route is read-only and intended to be called from client code via fetch or from server components.
 */

/* -------------------------
   Helper types & constants
   ------------------------- */

type SessionUser = {
  id: string;
  email?: string;
  role?: Role;
  organizationId?: string;
  isOrgOwner?: boolean;
};

const READ_ROLES = [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.AUDITOR];

/* -------------------------
   Authorization helper
   ------------------------- */

async function authorizeSessionUserForBranch(
  user: SessionUser,
  branchId: string,
  resource: "INVENTORY" | "LEDGER"
): Promise<boolean> {
  // Basic session checks
  if (!user?.id || !user.organizationId) return false;

  // Load branch and personnel in parallel
  const [branch, personnel] = await Promise.all([
    prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, organizationId: true },
    }),
    prisma.authorizedPersonnel.findUnique({
      where: { id: user.id },
      select: { id: true, role: true, organizationId: true, branchId: true },
    }),
  ]);

  if (!branch || !personnel) return false;

  // Organization must match
  if (personnel.organizationId !== branch.organizationId) return false;

  // If personnel is assigned to a different branch and not org owner, deny
  if (personnel.branchId && personnel.branchId !== branchId && !user.isOrgOwner) {
    return false;
  }

  // Quick role-based allow
  if (READ_ROLES.includes(personnel.role)) return true;

  // Fallback: check granular Permission table for READ on resource
  const perm = await prisma.permission.findFirst({
    where: {
      organizationId: branch.organizationId,
      role: personnel.role,
      action: "READ",
      resource,
    },
  });

  return !!perm;
}

/* -------------------------
   Route handler
   ------------------------- */

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const qp = url.searchParams;

    const branchId = qp.get("branchId");
    if (!branchId) {
      return NextResponse.json({ error: "branchId query parameter is required" }, { status: 400 });
    }

    const type = (qp.get("type") ?? "inventory").toLowerCase();
    const limitParam = qp.get("limit");
    const cursor = qp.get("cursor") ?? undefined;
    const sinceParam = qp.get("since") ?? undefined;

    const limit = limitParam ? Math.max(1, Math.min(1000, parseInt(limitParam, 10) || 50)) : undefined;
    const since = sinceParam ? new Date(sinceParam) : undefined;
    if (sinceParam && isNaN(since!.getTime())) {
      return NextResponse.json({ error: "Invalid since date" }, { status: 400 });
    }

    // Retrieve server session via next-auth
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Normalize session user shape expected by this route
    const sessionUser: SessionUser = {
      id: (session.user as any).id,
      email: session.user.email,
      role: (session.user as any).role,
      organizationId: (session.user as any).organizationId,
      isOrgOwner: (session.user as any).isOrgOwner ?? false,
    };

    // Authorize caller for requested resource
    const resource = type === "ledger" ? "LEDGER" : "INVENTORY";
    const allowed = await authorizeSessionUserForBranch(sessionUser, branchId, resource);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delegate to paged helpers
    if (type === "inventory") {
      const res = await getFortressInventoryPaged(branchId, {
        limit,
        cursor,
        since,
      });
      return NextResponse.json(res, { status: 200 });
    }

    if (type === "ledger") {
      const res = await getFortressLedgerPaged(branchId, {
        limit,
        cursor,
        since,
      });
      return NextResponse.json(res, { status: 200 });
    }

    return NextResponse.json({ error: `Unsupported type: ${type}` }, { status: 400 });
  } catch (err) {
    // Replace with your structured logger (e.g., pino, winston, datadog)
    // Example: logger.error({ err, route: "/api/inventory/fortress" }, "Fortress API error");
    const message = (err as Error)?.message ?? "Unknown error";
    return NextResponse.json({ error: `Server error: ${message}` }, { status: 500 });
  }
}
