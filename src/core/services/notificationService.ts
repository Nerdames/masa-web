// src/core/services/notificationService.ts
import prisma from "@/core/lib/prisma";
import { pusherServer } from "@/core/lib/pusher";
import { NotificationType, CriticalAction } from "@prisma/client";

interface CreateNotificationParams {
  title: string;
  message: string;
  type: NotificationType;
  organizationId: string;
  recipientIds: string[];
  branchId?: string | null;
  approvalId?: string | null;
  activityLogId?: string | null;
  actionTrigger?: CriticalAction;
  silent?: boolean;
}

const BATCH_SIZE = 100;

/**
 * Production-grade notification creator with batching and Pusher integration.
 */
export async function createNotification({
  title,
  message,
  type,
  organizationId,
  recipientIds,
  branchId,
  approvalId,
  activityLogId,
  actionTrigger,
  silent = false,
}: CreateNotificationParams) {
  // 1. Deduplicate & Validate
  const uniqueRecipients = Array.from(new Set(recipientIds.filter(Boolean)));
  if (uniqueRecipients.length === 0) return null;

  try {
    return await prisma.$transaction(async (tx) => {
      // 2. Create the Notification Record
      const notification = await tx.notification.create({
        data: {
          organizationId,
          branchId: branchId ?? null,
          type,
          title: title.trim(),
          message: message.trim(),
          approvalId,
          activityLogId,
          actionTrigger,
        },
      });

      // 3. Batch Insert Recipients
      for (let i = 0; i < uniqueRecipients.length; i += BATCH_SIZE) {
        const batch = uniqueRecipients.slice(i, i + BATCH_SIZE).map((id) => ({
          notificationId: notification.id,
          personnelId: id,
        }));
        await tx.notificationRecipient.createMany({ data: batch });
      }

      // 4. Trigger Real-time Broadcast
      if (!silent) {
        await pusherServer.trigger(`org-${organizationId}`, "notification:new", {
          id: notification.id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          createdAt: notification.createdAt,
        });
      }

      return notification;
    });
  } catch (error) {
    console.error("[NotificationService] Failed to create notification:", error);
    throw error;
  }
}