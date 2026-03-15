import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher";

/* -------------------------------------------------- */
/* GET USER NOTIFICATIONS */
/* -------------------------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const cursor = searchParams.get("cursor");
    const personnelId = session.user.id;

    /* Fetch notifications with optional cursor */
    const recipientEntries = await prisma.notificationRecipient.findMany({
      where: { personnelId, notification: { deletedAt: null } },
      include: {
        notification: {
          include: {
            approval: {
              include: {
                requester: { select: { id: true, name: true, role: true, email: true } },
                approver: { select: { id: true, name: true, role: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });

    /* Collect IDs for related logs */
    const approvalIds = recipientEntries.map((e) => e.notification.approvalId).filter(Boolean) as string[];
    const notificationIds = recipientEntries.map((e) => e.notificationId);

    /* Fetch related activity logs */
    const logs = await prisma.activityLog.findMany({
      where: {
        deletedAt: null,
        OR: [
          { approvalId: { in: approvalIds.length ? approvalIds : ["none"] } },
          { metadata: { path: ["notificationId"], array_contains: notificationIds } },
        ],
      },
      include: { personnel: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });

    /* Index logs for fast lookup */
    const logsByApproval = new Map<string, typeof logs>();
    const logsByNotification = new Map<string, typeof logs>();
    for (const log of logs) {
      if (log.approvalId) {
        if (!logsByApproval.has(log.approvalId)) logsByApproval.set(log.approvalId, []);
        logsByApproval.get(log.approvalId)!.push(log);
      }
      const meta = log.metadata as Record<string, any> | null;
      if (meta?.notificationId) {
        if (!logsByNotification.has(meta.notificationId)) logsByNotification.set(meta.notificationId, []);
        logsByNotification.get(meta.notificationId)!.push(log);
      }
    }

    /* Map notifications to frontend-ready structure */
    const notifications = recipientEntries.map((entry) => {
      const n = entry.notification;
      const approvalLogs = n.approvalId ? logsByApproval.get(n.approvalId) ?? [] : [];
      const notificationLogs = logsByNotification.get(n.id) ?? [];
      const relevantLogs = [...approvalLogs, ...notificationLogs];
      const firstLog = relevantLogs[0];
      const meta = (firstLog?.metadata as Record<string, any>) ?? {};

      return {
        id: n.id,
        type: n.type,
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
        logs: relevantLogs.map((l) => ({
          id: l.id,
          action: l.action,
          critical: l.critical,
          createdAt: l.createdAt,
          time: l.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          personnel: l.personnel,
          metadata: l.metadata ?? {},
        })),
        context: {
          ip: meta?.ipAddress ?? "Internal System",
          device: meta?.deviceInfo ?? "Server",
        },
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
    console.error("Notification fetch error:", error);
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

      // Trigger Pusher event for frontend to refresh
      try {
        await pusherServer.trigger(`user-${personnelId}`, "notifications-read", { type: "all" });
      } catch (err) {
        console.error("[PATCH][PUSHER_ERROR]", err);
      }

      return NextResponse.json({ success: true, updated: "all", count: updatedCount.count });
    }

    /* -------------------------------
       SINGLE NOTIFICATION UPDATE
    ------------------------------- */
    if (!id || typeof read !== "boolean") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const updated = await prisma.notificationRecipient.update({
      where: { notificationId_personnelId: { notificationId: id, personnelId } },
      data: { read },
      select: { id: true, read: true, updatedAt: true },
    });

    // Trigger Pusher event for this single notification
    try {
      await pusherServer.trigger(`user-${personnelId}`, "notifications-read", {
        type: "single",
        id: updated.id,
        read: updated.read,
      });
    } catch (err) {
      console.error("[PATCH][PUSHER_ERROR]", err);
    }

    return NextResponse.json({ success: true, notification: updated });
  } catch (error) {
    console.error("Notification update error:", error);
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}