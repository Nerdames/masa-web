import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import { authorize, RESOURCES } from "@/core/lib/permission"; // Adjust path to your permission file
import { PermissionAction } from "@prisma/client";
import { getPurchaseOrdersData, createPurchaseOrder } from "@/modules/inventory/po-actions";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.expired) {
      return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId") || session.user.branchId;
    const organizationId = session.user.organizationId;

    if (!branchId) return NextResponse.json({ error: "Branch Context Required" }, { status: 400 });

    // Permissions check [cite: 4190, 3937]
    const authCheck = authorize({
      role: session.user.role,
      isOrgOwner: session.user.isOrgOwner,
      resource: RESOURCES.PROCUREMENT,
      action: PermissionAction.READ
    });

    if (!authCheck.allowed) {
      return NextResponse.json({ error: "Forbidden: Read Access Denied" }, { status: 403 });
    }

    const data = await getPurchaseOrdersData(branchId, organizationId);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[API_PO_GET_ERROR]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.expired) {
      return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 401 });
    }

    // Permissions check [cite: 4190, 3937]
    const authCheck = authorize({
      role: session.user.role,
      isOrgOwner: session.user.isOrgOwner,
      resource: RESOURCES.PROCUREMENT,
      action: PermissionAction.CREATE
    });

    if (!authCheck.allowed) {
      return NextResponse.json({ error: "Forbidden: Create Access Denied" }, { status: 403 });
    }

    const body = await req.json();
    
    // Force organization and branch from secure session context
    const orderPayload = {
      ...body,
      organizationId: session.user.organizationId,
      branchId: session.user.branchId || body.branchId,
    };

    const result = await createPurchaseOrder(orderPayload, session.user.id, session.user.role);

    return NextResponse.json({ success: true, po: result }, { status: 201 });
  } catch (error: any) {
    console.error("[API_PO_POST_FAILURE]:", error);
    return NextResponse.json({ error: error.message || "Internal Protocol Failure" }, { status: 500 });
  }
}