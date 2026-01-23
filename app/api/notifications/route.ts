import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getToken } from "next-auth/jwt";

const secret = process.env.NEXTAUTH_SECRET as string;

/* --------------------------------
   GET — Fetch notifications
--------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (!token || !token.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unread") === "true";

    const notifications = await prisma.notification.findMany({
      where: {
        organizationId: token.organizationId,
        ...(unreadOnly ? { read: false } : {}),
        OR: [
          { personnelId: token.sub ?? undefined },
          { branchId: token.branchId ?? undefined },
          { branchId: null, personnelId: null }, // org-wide
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(notifications);
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

/* --------------------------------
   POST — Create notification
--------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (!token || !["DEV", "ADMIN", "MANAGER"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    if (!body.title || !body.message) {
      return NextResponse.json(
        { error: "Title and message are required" },
        { status: 400 }
      );
    }

    // Enforce schema logic
    if (body.branchId && body.personnelId) {
      return NextResponse.json(
        { error: "Notification cannot target both branch and personnel" },
        { status: 400 }
      );
    }

    const notification = await prisma.notification.create({
      data: {
        organizationId: token.organizationId!,
        branchId: body.branchId ?? null,
        personnelId: body.personnelId ?? null,
        type: body.type ?? "INFO",
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
   PATCH — Mark as read (single or multiple)
--------------------------------- */
export async function PATCH(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (!token || !token.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    let ids: string[] = [];

    // Support single id or multiple ids
    if (typeof body.id === "string") {
      ids = [body.id];
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      ids = body.ids;
    } else {
      return NextResponse.json(
        { error: "Notification ID(s) required" },
        { status: 400 }
      );
    }

    const updated = await prisma.notification.updateMany({
      where: {
        id: { in: ids },
        organizationId: token.organizationId,
        OR: [
          { personnelId: token.sub ?? undefined },
          { branchId: token.branchId ?? undefined },
          { branchId: null, personnelId: null },
        ],
      },
      data: { read: true },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Notification(s) not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, updatedCount: updated.count });
  } catch (error) {
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to update notification(s)" }, { status: 500 });
  }
}
