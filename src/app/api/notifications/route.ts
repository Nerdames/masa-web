// src/app/api/notifications/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { pusherServer } from "@/core/lib/pusher";

/* -------------------------------------------------- */
/* GET USER NOTIFICATIONS */
/* -------------------------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Ensure the user is authenticated and the ID is resolved [cite: 13, 270]
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const cursor = searchParams.get("cursor");
    const personnelId = session.user.id;

    /* Fetch notifications with optimized direct relations */
    const recipientEntries = await prisma.notificationRecipient.findMany({
      where: { personnelId, notification: { deletedAt: null } },
      include: {
        notification: {
          include: {
            // Leverage direct ApprovalRequest relation 
            approval: {
              include: {
                requester: { select: { id: true, name: true, role: true, email: true } },
                approver: { select: { id: true, name: true, role: true } },
              },
            },
            // Leverage direct ActivityLog relation 
            activity: {
              include: { 
                personnel: { select: { id: true, name: true } } 
              }
            }
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });

    /* Map notifications to a clean frontend-ready structure */
    const notifications = recipientEntries.map((entry) => {
      const n = entry.notification;

      return {
        id: n.id,
        type: n.type,
        actionTrigger: n.actionTrigger,
        title: n.title,
        message: n.message,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        read: entry.read,
        approval: n.approval
          ? {
              id: n.approval.id,
              actionType: n.approval.actionType,
              status: n.approval.status,
              requester: n.approval.requester,
              approver: n.approval.approver,
              createdAt: n.approval.createdAt,
            }
          : null,
        activity: n.activity
          ? {
              id: n.activity.id,
              action: n.activity.action,
              critical: n.activity.critical,
              createdAt: n.activity.createdAt,
              time: n.activity.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              personnel: n.activity.personnel,
              context: {
                ip: n.activity.ipAddress ?? "Internal System",
                device: n.activity.deviceInfo ?? "Server",
              }
            }
          : null,
      };
    });

    /* Count unread notifications */
    const unreadCount = await prisma.notificationRecipient.count({
      where: { personnelId, read: false, notification: { deletedAt: null } },
    });

    return NextResponse.json({
      notifications,
      pagination: {
        nextCursor: recipientEntries.length === limit
          ? recipientEntries[recipientEntries.length - 1].id
          : null,
      },
      unreadCount,
      count: notifications.length,
    });
  } catch (error) {
    console.error("[GET_NOTIFICATIONS_ERROR]:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

/* -------------------------------------------------- */
/* UPDATE READ STATUS (SINGLE OR ALL) WITH PUSHER */
/* -------------------------------------------------- */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, read, markAll } = body;
    const personnelId = session.user.id;

    /* -------------------------------
       MARK ALL AS READ
    ------------------------------- */
    if (markAll === true) {
      const updatedCount = await prisma.notificationRecipient.updateMany({
        where: { personnelId, read: false },
        data: { read: true },
      });

      // Trigger Pusher event on the user-specific channel
      try {
        await pusherServer.trigger(`user-${personnelId}`, "notifications-read", { type: "all" });
      } catch (err) {
        console.error("[PATCH_NOTIFICATIONS][PUSHER_ERROR]", err);
      }

      return NextResponse.json({ success: true, updated: "all", count: updatedCount.count });
    }

    /* -------------------------------
       SINGLE NOTIFICATION UPDATE
    ------------------------------- */
    if (!id || typeof read !== "boolean") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Utilize the unique compound index defined in the schema [cite: 1508]
    const updated = await prisma.notificationRecipient.update({
      where: { notificationId_personnelId: { notificationId: id, personnelId } },
      data: { read },
      select: { id: true, read: true, updatedAt: true },
    });

    // Trigger Pusher event for this specific read state
    try {
      await pusherServer.trigger(`user-${personnelId}`, "notifications-read", {
        type: "single",
        id: updated.id,
        read: updated.read,
      });
    } catch (err) {
      console.error("[PATCH_NOTIFICATIONS][PUSHER_ERROR]", err);
    }

    return NextResponse.json({ success: true, notification: updated });
  } catch (error) {
    console.error("[UPDATE_NOTIFICATION_ERROR]:", error);
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}