import prisma from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher";
import { NotificationType, Prisma } from "@prisma/client";

/* -------------------------------------------------- */
/* TYPES */
/* -------------------------------------------------- */

interface CreateNotificationParams {
  title: string;
  message: string;
  type: NotificationType;

  organizationId: string;
  recipientIds: string[];

  approvalId?: string | null;
  branchId?: string | null;

  metadata?: Prisma.JsonValue;

  silent?: boolean; // prevent realtime push
}

/* -------------------------------------------------- */
/* CONFIG */
/* -------------------------------------------------- */

const MAX_RECIPIENTS = 1000;
const MAX_TITLE_LENGTH = 250;
const MAX_MESSAGE_LENGTH = 4000;
const BATCH_SIZE = 200;

/* -------------------------------------------------- */
/* CREATE NOTIFICATION
/* -------------------------------------------------- */

export async function createNotification({
  title,
  message,
  type,
  organizationId,
  recipientIds,
  approvalId,
  branchId,
  silent = false,
}: CreateNotificationParams) {
  /* ---------------- Validation ---------------- */

  if (!organizationId) {
    throw new Error("organizationId is required");
  }

  if (!title || title.trim().length === 0) {
    throw new Error("title is required");
  }

  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`title must be <= ${MAX_TITLE_LENGTH}`);
  }

  if (!message || message.trim().length === 0) {
    throw new Error("message is required");
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`message must be <= ${MAX_MESSAGE_LENGTH}`);
  }

  if (!Array.isArray(recipientIds)) {
    throw new Error("recipientIds must be an array");
  }

  /* ---------------- Deduplicate Recipients ---------------- */

  const uniqueRecipientIds = Array.from(
    new Set(recipientIds.filter(Boolean))
  );

  if (uniqueRecipientIds.length === 0) return null;

  if (uniqueRecipientIds.length > MAX_RECIPIENTS) {
    throw new Error(`Too many recipients (max ${MAX_RECIPIENTS})`);
  }

  /* ---------------- Filter by Notification Settings ---------------- */

  const allowedRecipients = await prisma.authorizedPersonnel.findMany({
    where: {
      id: { in: uniqueRecipientIds },
      organizationId,
      NotificationSetting: {
        none: {
          notificationType: type,
          enabled: false,
        },
      },
    },
    select: { id: true },
  });

  const finalRecipientIds = allowedRecipients.map((u) => u.id);

  if (finalRecipientIds.length === 0) {
    return null;
  }

  /* --------------------------------------------------
     TRANSACTION
  -------------------------------------------------- */

  try {
    const notification = await prisma.$transaction(async (tx) => {
      const created = await tx.notification.create({
        data: {
          title: title.trim(),
          message: message.trim(),
          type,

          organizationId,
          branchId: branchId ?? null,

          approvalId: approvalId ?? null,
        },
      });

      /* ---------------- Insert Recipients ---------------- */

      for (let i = 0; i < finalRecipientIds.length; i += BATCH_SIZE) {
        const batch = finalRecipientIds
          .slice(i, i + BATCH_SIZE)
          .map((personnelId) => ({
            notificationId: created.id,
            personnelId,
          }));

        await tx.notificationRecipient.createMany({
          data: batch,
          skipDuplicates: true,
        });
      }

      return created;
    });

    /* ---------------- Recipient Count ---------------- */

    const recipientCount = await prisma.notificationRecipient.count({
      where: {
        notificationId: notification.id,
      },
    });

    /* --------------------------------------------------
       REALTIME BROADCAST
    -------------------------------------------------- */

    if (!silent) {
      try {
        await pusherServer.trigger(
          `org-${organizationId}`,
          "notification:new",
          {
            id: notification.id,
            title: notification.title,
            message: notification.message,
            type: notification.type,

            approvalId: notification.approvalId ?? null,
            branchId: notification.branchId ?? null,

            createdAt: notification.createdAt,

            recipientCount,
          }
        );
      } catch (err) {
        console.error(
          "[createNotification][PUSH_ERROR]",
          err
        );
      }
    }

    /* --------------------------------------------------
       RETURN SUMMARY
    -------------------------------------------------- */

    return {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      type: notification.type,

      approvalId: notification.approvalId ?? null,
      branchId: notification.branchId ?? null,

      createdAt: notification.createdAt,

      recipientCount,
    };
  } catch (err) {
    console.error("[createNotification]", err);

    throw new Error(
      err instanceof Error
        ? err.message
        : "Failed to create notification"
    );
  }
}