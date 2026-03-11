import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getToken } from "next-auth/jwt";
import { Role, NotificationType, Prisma } from "@prisma/client";

const secret = process.env.NEXTAUTH_SECRET as string;

/* --------------------------------
   GET — Fetch notifications
   Query params supported:
     unread=true
     type=INFO
     branchId=<branchId>
--------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !token.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unread") === "true";
    const typeFilter = url.searchParams.get("type") as NotificationType | null;
    const branchIdFilter = url.searchParams.get("branchId");

    const personnelId = token.sub as string;

    const notifications = await prisma.notification.findMany({
      where: {
        organizationId: token.organizationId as string,
        ...(branchIdFilter ? { branchId: branchIdFilter } : {}),
        ...(typeFilter ? { type: typeFilter } : {}),
        recipients: {
          some: {
            personnelId,
            ...(unreadOnly ? { read: false } : {}),
          },
        },
        deletedAt: null,
      },
      include: {
        recipients: {
          where: { personnelId },
          select: { read: true },
        },
        branch: true,
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
--------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !["DEV", "ADMIN", "MANAGER"].includes(token.role as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: {
      title: string;
      message: string;
      type?: NotificationType;
      branchId?: string;
      recipientIds: string[];
      metadata?: Prisma.InputJsonValue;
      sourceId?: string;
      sourceType?: string;
    } = await req.json();

    if (!body.title || !body.message || !body.recipientIds?.length) {
      return NextResponse.json({ error: "Missing title, message, or recipients" }, { status: 400 });
    }

    const notification = await prisma.notification.create({
      data: {
        organizationId: token.organizationId as string,
        branchId: body.branchId || null,
        type: body.type || NotificationType.INFO,
        title: body.title,
        message: body.message,
        metadata: body.metadata || null,
        recipients: {
          createMany: {
            data: body.recipientIds.map((id) => ({ personnelId: id })),
          },
        },
      },
      include: { recipients: true, branch: true },
    });

    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    console.error("POST /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }
}

/* --------------------------------
   PATCH — Mark notifications as read
--------------------------------- */
export async function PATCH(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !token.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: { id?: string; ids?: string[] } = await req.json();
    const personnelId = token.sub as string;

    const targetIds = body.id ? [body.id] : body.ids || [];
    if (!targetIds.length) {
      return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
    }

    const updated = await prisma.notificationRecipient.updateMany({
      where: {
        notificationId: { in: targetIds },
        personnelId,
        read: false,
      },
      data: { read: true },
    });

    return NextResponse.json({ success: true, count: updated.count });
  } catch (error) {
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

/* --------------------------------
   DELETE — Soft-delete notification
--------------------------------- */
export async function DELETE(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !["DEV", "ADMIN"].includes(token.role as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: { id?: string; ids?: string[] } = await req.json();
    const targetIds = body.id ? [body.id] : body.ids || [];
    if (!targetIds.length) {
      return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
    }

    const deleted = await prisma.notification.updateMany({
      where: { id: { in: targetIds }, organizationId: token.organizationId as string },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true, count: deleted.count });
  } catch (error) {
    console.error("DELETE /api/notifications error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}