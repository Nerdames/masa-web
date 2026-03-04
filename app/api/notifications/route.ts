import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getToken } from "next-auth/jwt";
import { Role, NotificationType, Prisma } from "@prisma/client";

const secret = process.env.NEXTAUTH_SECRET as string;

/* --------------------------------
   GET — Fetch notifications
   Logic: Returns notifications where the user is a recipient.
--------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret });

    if (!token || !token.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unread") === "true";
    const personnelId = token.sub as string;

    const notifications = await prisma.notification.findMany({
      where: {
        organizationId: token.organizationId as string,
        recipients: {
          some: {
            personnelId: personnelId,
            ...(unreadOnly ? { readAt: null } : {}),
          },
        },
      },
      include: {
        // Include recipient data to check read status on the frontend
        recipients: {
          where: { personnelId },
          select: { readAt: true },
        },
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
   Logic: Creates a notification and links it to specific recipients.
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
      recipientIds?: string[]; // Array of Personnel IDs
      sourceId?: string;
      sourceType?: string;
      metadata?: Prisma.InputJsonValue;
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
        sourceId: body.sourceId,
        sourceType: body.sourceType,
        metadata: body.metadata,
        // Automatically create the join table entries for each recipient
        recipients: {
          createMany: {
            data: body.recipientIds.map((id) => ({
              personnelId: id,
            })),
          },
        },
      },
    });

    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    console.error("POST /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}

/* --------------------------------
   PATCH — Mark as read
   Logic: Updates the 'readAt' timestamp in the join table.
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

    if (targetIds.length === 0) {
      return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
    }

    // We update the Recipient record, not the Notification record
    const updated = await prisma.notificationRecipient.updateMany({
      where: {
        personnelId: personnelId,
        notificationId: { in: targetIds },
        readAt: null, // Only update if not already read
      },
      data: {
        readAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, count: updated.count });
  } catch (error) {
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}