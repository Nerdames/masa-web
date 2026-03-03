import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getToken } from "next-auth/jwt";
import { Role, NotificationType } from "@prisma/client";

const secret = process.env.NEXTAUTH_SECRET as string;

/* --------------------------------
   GET — Fetch notifications
   Logic: Returns notifications for the specific user, 
   their specific role, their branch, or org-wide.
--------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (!token || !token.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unread") === "true";
    
    // User context from token
    const personnelId = token.sub as string;
    const organizationId = token.organizationId as string;
    const branchId = token.branchId as string | null;
    const userRole = token.role as Role;

    const notifications = await prisma.notification.findMany({
      where: {
        organizationId,
        ...(unreadOnly ? { read: false } : {}),
        OR: [
          { personnelId },                      // Direct: Sent to me
          { targetRole: userRole },             // Directed: Sent to my Role (e.g. DEV/ADMIN)
          { 
            branchId: branchId ?? undefined, 
            personnelId: null, 
            targetRole: null 
          },                                    // Scoped: Branch-wide
          { 
            branchId: null, 
            personnelId: null, 
            targetRole: null 
          },                                    // Scoped: Org-wide
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(notifications);
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/* --------------------------------
   POST — Create notification
   Logic: Used by system actions (like Approval Requests) 
   or manually by high-level roles.
--------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    // Restrict manual notification creation to specific roles
    if (!token || !["DEV", "ADMIN", "MANAGER"].includes(token.role as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    // Validation
    if (!body.title || !body.message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const notification = await prisma.notification.create({
      data: {
        organizationId: token.organizationId as string,
        branchId: body.branchId || null,
        personnelId: body.personnelId || null,
        targetRole: (body.targetRole as Role) || null,
        type: (body.type as NotificationType) || NotificationType.INFO,
        title: body.title,
        message: body.message,
      },
    });

    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    console.error("POST /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }
}

/* --------------------------------
   PATCH — Mark as read
   Logic: Updates status. For Role-based notifications,
   you can optionally extend this to update the 'readBy' Json field.
--------------------------------- */
export async function PATCH(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (!token || !token.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const personnelId = token.sub as string;
    const userRole = token.role as Role;
    
    let ids: string[] = [];
    if (body.id) ids = [body.id];
    else if (Array.isArray(body.ids)) ids = body.ids;

    if (ids.length === 0) {
      return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
    }

    // Security check: Only mark as read if the user is a valid recipient
    const updated = await prisma.notification.updateMany({
      where: {
        id: { in: ids },
        organizationId: token.organizationId as string,
        OR: [
          { personnelId },
          { targetRole: userRole },
          { branchId: token.branchId as string },
          { branchId: null, personnelId: null, targetRole: null }
        ]
      },
      data: { read: true },
    });

    return NextResponse.json({ success: true, count: updated.count });
  } catch (error) {
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}