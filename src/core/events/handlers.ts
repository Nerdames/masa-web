import prisma from "@/core/lib/prisma";
import { pusherServer } from "@/core/lib/pusher";
import { Role, NotificationType } from "@prisma/client";
import { EventPayloads } from "./types";

/**
 * Ensures standard payload structure across the entire application so the 
 * frontend MASAAlertProvider handles real-time alerts without crashing.
 */
const buildAlertPayload = (notification: any, kind = "PUSH") => ({
  id: notification.id,
  kind,
  type: notification.type,
  title: notification.title,
  message: notification.message,
  actionTrigger: notification.actionTrigger,
  approvalId: notification.approvalId,
  activityId: notification.activityLogId,
  createdAt: Date.now(),
});

export async function handleApprovalRequested(payload: EventPayloads["approval.requested"]) {
  try {
    const eligiblePersonnel = await prisma.authorizedPersonnel.findMany({
      where: {
        organizationId: payload.organizationId,
        disabled: false,
        isLocked: false,
        OR: [
          { role: Role.ADMIN },
          { isOrgOwner: true },
          { role: Role.MANAGER, branchId: payload.branchId },
        ],
        NOT: { id: payload.requesterId }
      },
      select: { id: true }
    });

    if (eligiblePersonnel.length === 0) return;

    const notification = await prisma.notification.create({
      data: {
        organizationId: payload.organizationId,
        branchId: payload.branchId,
        type: payload.notificationType,
        actionTrigger: payload.actionType,
        approvalId: payload.approvalId,
        title: payload.title,
        message: payload.message,
        recipients: {
          create: eligiblePersonnel.map((p) => ({ personnelId: p.id })),
        },
      },
    });

    const alertPayload = buildAlertPayload(notification);

    await Promise.allSettled(
      eligiblePersonnel.map((p) => 
        pusherServer.trigger(`user-${p.id}`, "new-alert", alertPayload)
      )
    );
  } catch (error) {
    console.error("[EventBus] handleApprovalRequested failed:", error);
  }
}

export async function handleApprovalResolved(payload: EventPayloads["approval.resolved"]) {
  try {
    const statusLabel = payload.status === "APPROVED" ? "Granted" : "Declined";
    
    const notification = await prisma.notification.create({
      data: {
        organizationId: payload.organizationId,
        branchId: payload.branchId,
        type: payload.notificationType,
        actionTrigger: payload.actionType,
        approvalId: payload.approvalId,
        title: `Approval ${statusLabel}`,
        message: `Your request for ${payload.actionType.replace(/_/g, " ")} was ${payload.status.toLowerCase()}.`,
        recipients: {
          create: { personnelId: payload.requesterId },
        },
      },
    });

    const alertPayload = buildAlertPayload(notification, "IN_APP");

    await pusherServer.trigger(`user-${payload.requesterId}`, "new-alert", alertPayload);
  } catch (error) {
    console.error("[EventBus] handleApprovalResolved failed:", error);
  }
}

export async function handleSecurityAlert(payload: EventPayloads["security.alert"]) {
  try {
    const authority = await prisma.authorizedPersonnel.findMany({
      where: {
        organizationId: payload.organizationId,
        disabled: false,
        isLocked: false,
        OR: [{ role: Role.ADMIN }, { isOrgOwner: true }],
      },
      select: { id: true }
    });

    if (authority.length === 0) return;

    const notification = await prisma.notification.create({
      data: {
        organizationId: payload.organizationId,
        branchId: payload.branchId,
        type: NotificationType.SECURITY,
        actionTrigger: payload.actionTrigger,
        activityLogId: payload.activityLogId,
        title: payload.title,
        message: payload.message,
        recipients: {
          create: authority.map((p) => ({ personnelId: p.id })),
        },
      },
    });

    const alertPayload = buildAlertPayload(notification, "URGENT");

    await Promise.allSettled(
      authority.map((p) => 
        pusherServer.trigger(`user-${p.id}`, "new-alert", alertPayload)
      )
    );
  } catch (error) {
    console.error("[EventBus] handleSecurityAlert failed:", error);
  }
}

export async function handleInventoryAlert(payload: EventPayloads["inventory.alert"]) {
  try {
    const personnel = await prisma.authorizedPersonnel.findMany({
      where: {
        organizationId: payload.organizationId,
        branchId: payload.branchId,
        disabled: false,
        isLocked: false,
        role: { in: [Role.INVENTORY, Role.MANAGER, Role.ADMIN] },
      },
      select: { id: true }
    });

    if (personnel.length === 0) return;

    const notification = await prisma.notification.create({
      data: {
        organizationId: payload.organizationId,
        branchId: payload.branchId,
        type: NotificationType.INVENTORY,
        title: payload.title,
        message: payload.message,
        recipients: {
          create: personnel.map((p) => ({ personnelId: p.id })),
        },
      },
    });

    const alertPayload = buildAlertPayload(notification, "IN_APP");

    await Promise.allSettled(
      personnel.map((p) => 
        pusherServer.trigger(`user-${p.id}`, "new-alert", alertPayload)
      )
    );
  } catch (error) {
    console.error("[EventBus] handleInventoryAlert failed:", error);
  }
}