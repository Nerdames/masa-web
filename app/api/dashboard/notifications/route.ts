import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getToken } from "next-auth/jwt";
import type { NotificationType } from "@/types/enums";

const secret = process.env.NEXTAUTH_SECRET as string;

export interface NotificationResponse {
  id: string;
  organizationId: string;
  personnelId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationsApiResponse {
  notifications: NotificationResponse[];
  totalCount: number;
}

// --------------------------
// GET — Fetch notifications
// --------------------------
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !["DEV", "ADMIN", "MANAGER", "SALES"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = token.organizationId;
    if (!orgId && token.role !== "DEV") {
      return NextResponse.json({ notifications: [], totalCount: 0 });
    }

    const notifications = await prisma.notification.findMany({
      where: token.role === "DEV" ? {} : { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      include: { personnel: true },
    });

    const serialized: NotificationResponse[] = notifications.map((n) => ({
      id: n.id,
      organizationId: n.organizationId,
      personnelId: n.personnelId ?? null,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    }));

    return NextResponse.json({ notifications: serialized, totalCount: serialized.length });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json(
      { notifications: [], totalCount: 0, error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

// --------------------------
// POST — Create notification
// --------------------------
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !["DEV", "ADMIN", "MANAGER"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title, message, type, personnelId } = await req.json();
    if (!title || !message) {
      return NextResponse.json({ error: "Title and message required" }, { status: 400 });
    }

    const organizationId = token.organizationId ?? undefined;
    if (!organizationId && token.role !== "DEV") {
      return NextResponse.json({ error: "Organization required" }, { status: 400 });
    }

    const notification = await prisma.notification.create({
      data: {
        title,
        message,
        type: type ?? "INFO",
        organizationId: organizationId ?? "",
        personnelId: personnelId ?? null,
      },
    });

    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    console.error("POST /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }
}

// --------------------------
// PUT — Update notification (mark read/unread or mark all read)
// --------------------------
export async function PUT(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !["DEV", "ADMIN", "MANAGER"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    if (body.all) {
      const orgId = token.organizationId ?? undefined;
      const updated = await prisma.notification.updateMany({
        where: token.role === "DEV" ? {} : { organizationId: orgId, read: false },
        data: { read: true },
      });
      return NextResponse.json({ success: true, updatedCount: updated.count });
    }

    const { id, read } = body;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const notification = await prisma.notification.update({
      where: { id },
      data: { read },
    });

    return NextResponse.json(notification);
  } catch (error) {
    console.error("PUT /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}

// --------------------------
// DELETE — Remove notification
// --------------------------
export async function DELETE(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });
    if (!token || !["DEV", "ADMIN"].includes(token.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    await prisma.notification.delete({ where: { id } });
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("DELETE /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to delete notification" }, { status: 500 });
  }
}
