// src/core/events/handlers.ts
import prisma from "@/core/lib/prisma";
import { pusherServer } from "@/core/lib/pusher";
import { Role } from "@prisma/client";
import { EventPayloads } from "./types";

/**
 * Handles generating notifications for new Approval Requests.
 * Targets: ADMIN, AUDITOR, and relevant MANAGERS.
 */
export async function handleApprovalRequested(payload: EventPayloads["approval.requested"]) {
  try {
    const eligiblePersonnel = await prisma.authorizedPersonnel.findMany({
      where: {
        organizationId: payload.organizationId,
        role: { in: [Role.ADMIN, Role.MANAGER, Role.AUDITOR] },
        disabled: false,
        isLocked: false,
        ...(payload.branchId ? {
          OR: [
            { branchId: payload.branchId },
            { role: Role.ADMIN },
            { isOrgOwner: true }
          ]
        } : {})
      },
      select: { id: true }
    });

    if (!eligiblePersonnel.length) return;

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

    await pusherServer.trigger(`org-${payload.organizationId}`, "notification:new", {
      id: notification.id,
      title: notification.title,
      type: notification.type,
    });
  } catch (error) {
    console.error("[EventHandler] handleApprovalRequested failed:", error);
  }
}

/**
 * Handles notifying the requester when their request is Resolved (Approved/Rejected).
 */
export async function handleApprovalResolved(payload: EventPayloads["approval.resolved"]) {
  try {
    const notification = await prisma.notification.create({
      data: {
        organizationId: payload.organizationId,
        branchId: payload.branchId,
        type: payload.notificationType,
        actionTrigger: payload.actionType,
        approvalId: payload.approvalId,
        title: `Request ${payload.status.toLowerCase()}`,
        message: `Your request for ${payload.actionType.replace(/_/g, " ")} has been ${payload.status.toLowerCase()}.`,
        recipients: {
          create: { personnelId: payload.requesterId },
        },
      },
    });

    await pusherServer.trigger(`user-${payload.requesterId}`, "notification:new", {
      id: notification.id,
      title: notification.title,
      status: payload.status,
    });
  } catch (error) {
    console.error("[EventHandler] handleApprovalResolved failed:", error);
  }
}

/**
 * Handles High-Risk Security Alerts.
 * Targets: ADMIN and OrgOwners for immediate intervention.
 */
export async function handleSecurityAlert(payload: EventPayloads["security.alert"]) {
  try {
    const admins = await prisma.authorizedPersonnel.findMany({
      where: {
        organizationId: payload.organizationId,
        role: Role.ADMIN,
        disabled: false,
        isLocked: false,
      },
      select: { id: true }
    });

    if (!admins.length) return;

    const notification = await prisma.notification.create({
      data: {
        organizationId: payload.organizationId,
        branchId: payload.branchId,
        type: payload.notificationType,
        actionTrigger: payload.actionTrigger,
        activityLogId: payload.activityLogId,
        title: payload.title,
        message: payload.message,
        recipients: {
          create: admins.map((p) => ({ personnelId: p.id })),
        },
      },
    });

    await pusherServer.trigger(`org-${payload.organizationId}-admin`, "security:alert", {
      id: notification.id,
      title: notification.title,
    });
  } catch (error) {
    console.error("[EventHandler] handleSecurityAlert failed:", error);
  }
}

/**
 * Handles Inventory Alerts (e.g., Low Stock).
 * Targets: INVENTORY role and branch MANAGERS.
 */
export async function handleInventoryAlert(payload: EventPayloads["inventory.alert"]) {
  try {
    const personnel = await prisma.authorizedPersonnel.findMany({
      where: {
        organizationId: payload.organizationId,
        branchId: payload.branchId,
        role: { in: [Role.INVENTORY, Role.MANAGER, Role.ADMIN] },
        disabled: false,
        isLocked: false,
      },
      select: { id: true }
    });

    if (!personnel.length) return;

    const notification = await prisma.notification.create({
      data: {
        organizationId: payload.organizationId,
        branchId: payload.branchId,
        type: payload.notificationType,
        title: payload.title,
        message: payload.message,
        recipients: {
          create: personnel.map((p) => ({ personnelId: p.id })),
        },
      },
    });

    await pusherServer.trigger(`branch-${payload.branchId}-inventory`, "inventory:alert", {
      id: notification.id,
      title: notification.title,
      productId: payload.productId,
    });
  } catch (error) {
    console.error("[EventHandler] handleInventoryAlert failed:", error);
  }
}