/**
 * src/app/api/notifications/route.ts
 * * ENTERPRISE-GRADE NOTIFICATIONS API
 * Fortified with:
 * 1. O(1) Memory Cache Authorization (via auth.ts)
 * 2. Hierarchical Role Validations (via permission.ts)
 * 3. Cryptographic Forensic Auditing (via audit.ts)
 * 4. ACID-Compliant Transactions & Strict Payload Validation
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import prisma from "@/core/lib/prisma";
import { pusherServer } from "@/core/lib/pusher";
import { createAuditLog } from "@/core/lib/audit";
import { ROLE_WEIGHT } from "@/core/lib/permission";
import { 
  Role, 
  NotificationType, 
  CriticalAction, 
  Severity, 
  Resource} from "@prisma/client";
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* UTILITIES & SCHEMAS                                                        */
/* -------------------------------------------------------------------------- */

// Extract IP and Device Info for Forensic Auditing
function getRequestMetadata(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";
  const deviceInfo = req.headers.get("user-agent") || "Unknown Device";
  return { ipAddress, deviceInfo };
}

const postSchema = z.object({
  type: z.nativeEnum(NotificationType),
  title: z.string().min(1, "Title is required"),
  message: z.string().min(1, "Message is required"),
  branchId: z.string().optional().nullable(),
  actionTrigger: z.nativeEnum(CriticalAction).optional().nullable(),
  activityLogId: z.string().optional().nullable(),
  approvalId: z.string().optional().nullable(),
  kind: z.string().default("PUSH"),
});

const patchSchema = z.object({
  id: z.string().optional(),
  read: z.boolean().optional(),
  markAll: z.boolean().optional(),
}).refine(data => data.markAll || (data.id && typeof data.read === "boolean"), {
  message: "Must provide either markAll=true, or both an ID and read status",
});

/* -------------------------------------------------------------------------- */
/* GET: FETCH NOTIFICATIONS (PAGINATED & DEDUPLICATED)                        */
/* -------------------------------------------------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const cursor = searchParams.get("cursor");
    const personnelId = session.user.id;

    const filterType = searchParams.get("type");
    const filterRead = searchParams.get("read");
    const filterSearch = searchParams.get("search");

    const baseWhere: any = {
      personnelId,
      notification: { deletedAt: null }
    };

    if (filterRead !== null) baseWhere.read = filterRead === "true";
    if (filterType && filterType !== "ALL") baseWhere.notification.type = filterType;
    if (filterSearch) {
      baseWhere.notification.OR = [
        { title: { contains: filterSearch, mode: "insensitive" } },
        { message: { contains: filterSearch, mode: "insensitive" } }
      ];
    }

    const recipientEntries = await prisma.notificationRecipient.findMany({
      where: baseWhere,
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

    // Production Safeguard: Deduplicate by recipientEntryId to prevent frontend memory leaks
    const seenIds = new Set();
    const notifications = recipientEntries
      .filter((entry) => {
        if (seenIds.has(entry.id)) return false;
        seenIds.add(entry.id);
        return true;
      })
      .map((entry) => {
        const n = entry.notification;
        return {
          id: n.id,
          recipientEntryId: entry.id,
          type: n.type,
          actionTrigger: n.actionTrigger, 
          title: n.title,
          message: n.message,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
          read: entry.read,
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
            metadata: n.activity.metadata,
            actor: n.activity.personnel,
            time: n.activity.createdAt.toISOString(),
            ip: n.activity.ipAddress ?? "System",
          } : null,
        };
      });

    const unreadCount = await prisma.notificationRecipient.count({
      where: { personnelId, read: false, notification: { deletedAt: null } },
    });

    return NextResponse.json({
      notifications,
      pagination: { 
        nextCursor: recipientEntries.length === limit ? recipientEntries[recipientEntries.length - 1].id : null 
      },
      unreadCount,
    });
  } catch (error) {
    console.error("[GET_NOTIFICATIONS_ERROR]:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* POST: CREATE & BROADCAST (PUSHER)                                          */
/* -------------------------------------------------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 1. RBAC Validation: Only Managers and above can execute manual global broadcasts
    const userWeight = ROLE_WEIGHT[session.user.role as Role] || 0;
    const managerWeight = ROLE_WEIGHT[Role.MANAGER];
    
    if (userWeight < managerWeight && !session.user.isOrgOwner) {
      return NextResponse.json({ error: "Insufficient privileges to broadcast notifications" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload", details: parsed.error.format() }, { status: 400 });

    const { type, title, message, branchId, actionTrigger, activityLogId, approvalId, kind } = parsed.data;
    const { organizationId, id: actorId, role: actorRole } = session.user;
    const { ipAddress, deviceInfo } = getRequestMetadata(req);

    // 2. Identify Targets
    const recipients = await prisma.authorizedPersonnel.findMany({
      where: {
        organizationId,
        disabled: false,
        isLocked: false,
        OR: [
          { role: Role.ADMIN },
          { role: Role.AUDITOR },
          { isOrgOwner: true },
          branchId ? { role: Role.MANAGER, branchId } : {},
        ],
        NOT: { id: actorId } // Don't notify the sender
      },
      select: { id: true },
    });

    if (!recipients.length) return NextResponse.json({ success: true, message: "No valid targets found" });

    // 3. ACID Transaction: Create Notification, Map Recipients, & Log Forensic Audit
    const notification = await prisma.$transaction(async (tx) => {
      const newNotif = await tx.notification.create({
        data: {
          organizationId,
          branchId,
          type,
          title,
          message,
          actionTrigger,
          activityLogId,
          approvalId,
          recipients: {
            create: recipients.map((r) => ({ personnelId: r.id })),
          },
        },
      });

      await createAuditLog(tx, {
        action: "BROADCAST_NOTIFICATION",
        resource: Resource.SETTINGS,
        resourceId: newNotif.id,
        organizationId,
        branchId,
        actorId,
        actorRole: actorRole as Role,
        severity: Severity.MEDIUM,
        critical: false,
        description: `Broadcasted ${type} notification to ${recipients.length} recipients.`,
        ipAddress,
        deviceInfo,
        metadata: { title, targetCount: recipients.length },
      });

      return newNotif;
    });

    // 4. Dispatch WebSocket Events
    const alertPayload = {
      id: notification.id,
      kind,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      actionTrigger: notification.actionTrigger,
      approvalId: notification.approvalId,
      activityId: notification.activityLogId,
      createdAt: Date.now(),
    };

    await Promise.allSettled(recipients.map((r) => pusherServer.trigger(`user-${r.id}`, "new-alert", alertPayload)));

    return NextResponse.json({ success: true, notificationId: notification.id, dispatchedTo: recipients.length });
  } catch (error) {
    console.error("[POST_NOTIFICATION_ERROR]:", error);
    return NextResponse.json({ error: "Broadcast failed" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* PATCH: UPDATE READ STATUS                                                  */
/* -------------------------------------------------------------------------- */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload", details: parsed.error.format() }, { status: 400 });

    const { id, read, markAll } = parsed.data;
    const { id: personnelId, organizationId, role: actorRole } = session.user;
    const { ipAddress, deviceInfo } = getRequestMetadata(req);

    await prisma.$transaction(async (tx) => {
      if (markAll) {
        await tx.notificationRecipient.updateMany({
          where: { personnelId, read: false },
          data: { read: true },
        });

        await createAuditLog(tx, {
          action: "MARK_ALL_NOTIFICATIONS_READ",
          resource: Resource.PERSONNEL,
          resourceId: personnelId,
          organizationId,
          actorId: personnelId,
          actorRole: actorRole as Role,
          severity: Severity.LOW,
          description: "User marked all pending notifications as read.",
          ipAddress,
          deviceInfo,
        });

      } else if (id && read !== undefined) {
        /**
         * Optimized Atomic Update:
         * Handles both 'recipientEntryId' or 'notificationId' in a single query 
         * using the personnelId as a strict security boundary to prevent IDOR.
         */
        await tx.notificationRecipient.updateMany({
          where: {
            personnelId,
            OR: [
              { id: id },
              { notificationId: id }
            ]
          },
          data: { read },
        });

        // Skip forensic logging for individual reads to prevent database bloat, 
        // as individual reads are usually considered low-value operational noise.
      }
    });

    if (markAll) {
      await pusherServer.trigger(`user-${personnelId}`, "notifications-read", { type: "all" });
      return NextResponse.json({ success: true, updated: "all" });
    } else {
      await pusherServer.trigger(`user-${personnelId}`, "notifications-read", { type: "single", id, read });
      return NextResponse.json({ success: true });
    }

  } catch (error) {
    console.error("[PATCH_NOTIFICATION_ERROR]:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}