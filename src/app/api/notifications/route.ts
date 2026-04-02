import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { pusherServer } from "@/core/lib/pusher";
import { Role, NotificationType, CriticalAction } from "@prisma/client";

/* -------------------------------------------------- */
/* GET: FETCH USER NOTIFICATIONS (PAGINATED)          */
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

    // Fetch notifications via the recipient join table
    const recipientEntries = await prisma.notificationRecipient.findMany({
      where: { 
        personnelId, 
        notification: { deletedAt: null } 
      },
      include: {
        notification: {
          include: {
            approval: {
              include: {
                requester: { select: { id: true, name: true, role: true, email: true } },
                approver: { select: { id: true, name: true, role: true } },
              },
            },
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

    // Map to a structure that frontend components (Drawer/Toasts) can use instantly
    const notifications = recipientEntries.map((entry) => {
      const n = entry.notification;

      return {
        id: n.id,
        recipientEntryId: entry.id, // For specific row targeting if needed
        type: n.type,
        actionTrigger: n.actionTrigger, 
        title: n.title,
        message: n.message,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        read: entry.read,
        // Polymorphic context for "Approve/Reject" or "Undo" UIs
        context: n.approval ? {
          type: "APPROVAL",
          id: n.approval.id,
          actionType: n.approval.actionType,
          status: n.approval.status,
          requester: n.approval.requester,
          approver: n.approval.approver,
        } : n.activity ? {
          type: "ACTIVITY",
          id: n.activity.id,
          action: n.activity.action,
          critical: n.activity.critical,
          metadata: n.activity.metadata, // Contains old/new values for "Undo" logic
          personnel: n.activity.personnel,
          time: n.activity.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          ip: n.activity.ipAddress ?? "Internal System",
          device: n.activity.deviceInfo ?? "Server",
        } : null,
      };
    });

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
/* POST: CREATE & DISPATCH NEW NOTIFICATION          */
/* -------------------------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { 
      type, title, message, branchId, 
      actionTrigger, activityLogId, approvalId, 
      kind = "PUSH" 
    } = body;
    
    const organizationId = session.user.organizationId;

    // 1. Identify valid recipients (Admins, Owners, or Branch Managers)
    const recipients = await prisma.authorizedPersonnel.findMany({
      where: {
        organizationId,
        disabled: false,
        isLocked: false,
        OR: [
          { role: Role.ADMIN },
          { isOrgOwner: true },
          branchId ? { role: Role.MANAGER, branchId } : {},
        ],
        NOT: { id: session.user.id } // Do not notify the user who performed the action
      },
      select: { id: true },
    });

    if (recipients.length === 0) {
      return NextResponse.json({ success: true, message: "No recipients found" });
    }

    // 2. Create the notification and join records atomically
    const notification = await prisma.notification.create({
      data: {
        organizationId,
        branchId,
        type: type as NotificationType,
        title,
        message,
        actionTrigger: actionTrigger as CriticalAction,
        activityLogId,
        approvalId,
        recipients: {
          create: recipients.map((r) => ({
            personnelId: r.id,
          })),
        },
      },
    });

    // 3. Dispatch Live Payload for MASAAlertProvider
    const alertPayload = {
      id: notification.id,
      kind,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      actionTrigger: notification.actionTrigger,
      approvalId: notification.approvalId, // Presence of this triggers "Accept/Reject" UI
      activityId: notification.activityLogId, // Presence of this triggers "Undo/View" UI
      createdAt: Date.now(),
    };

    // Parallel broadcast to all active recipient channels
    await Promise.allSettled(
      recipients.map((r) =>
        pusherServer.trigger(`user-${r.id}`, "new-alert", alertPayload)
      )
    );

    return NextResponse.json({ 
      success: true, 
      notificationId: notification.id, 
      dispatchedTo: recipients.length 
    });
  } catch (error) {
    console.error("[CREATE_NOTIFICATION_ERROR]:", error);
    return NextResponse.json({ error: "Failed to dispatch notification" }, { status: 500 });
  }
}

/* -------------------------------------------------- */
/* PATCH: UPDATE READ STATUS (SINGLE OR ALL)         */
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

    // Handle Bulk "Mark as Read"
    if (markAll === true) {
      await prisma.notificationRecipient.updateMany({
        where: { personnelId, read: false },
        data: { read: true },
      });

      await pusherServer.trigger(`user-${personnelId}`, "notifications-read", { type: "all" });
      return NextResponse.json({ success: true, updated: "all" });
    }

    // Handle Single Notification Update
    if (!id || typeof read !== "boolean") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Uses the strict compound unique index from your schema
    const updated = await prisma.notificationRecipient.update({
      where: { 
        notificationId_personnelId: { 
          notificationId: id, 
          personnelId 
        } 
      },
      data: { read },
    });

    await pusherServer.trigger(`user-${personnelId}`, "notifications-read", {
      type: "single",
      id: id,
      read: updated.read,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[UPDATE_NOTIFICATION_ERROR]:", error);
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}