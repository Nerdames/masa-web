import prisma from "@/core/lib/prisma";
import { pusherServer } from "@/core/lib/pusher";
import { 
  Role, 
  NotificationType, 
  Severity,
  Notification} from "@prisma/client";
import { ROLE_WEIGHT } from "@/core/lib/permission";
import { EventPayloads } from "./types";

/* -------------------------------------------------------------------------- */
/* TYPES & UTILS                                                              */
/* -------------------------------------------------------------------------- */

// Specific interface to solve the 'any' ESLint error and handle the missing 'severity' in DB
interface NotificationWithSeverity extends Notification {
  severity?: Severity;
}

/**
 * Standardizes the payload for the frontend MASAAlertProvider.
 */
const buildAlertPayload = (
  notification: NotificationWithSeverity, 
  kind: "PUSH" | "IN_APP" | "URGENT" = "PUSH"
) => ({
  id: notification.id,
  kind,
  type: notification.type,
  title: notification.title,
  message: notification.message,
  actionTrigger: notification.actionTrigger,
  approvalId: notification.approvalId,
  activityId: notification.activityLogId,
  severity: notification.severity || Severity.LOW,
  createdAt: notification.createdAt.getTime(),
});

/* -------------------------------------------------------------------------- */
/* CORE HANDLERS                                                              */
/* -------------------------------------------------------------------------- */

/**
 * HANDLE: approval.requested
 */
export async function handleApprovalRequested(payload: EventPayloads["approval.requested"]) {
  try {
    const { organizationId, branchId, requesterId, approvalId, actionType } = payload;

    // 1. Fetch the approval request to get the 'requiredRole' (Source of Truth)
    // This fixes the TS2339 error because requiredRole is not in the event payload
    const request = await prisma.approvalRequest.findUnique({
      where: { id: approvalId },
      select: { requiredRole: true }
    });

    if (!request) return;

    const targetWeight = ROLE_WEIGHT[request.requiredRole] || 0;

    const eligiblePersonnel = await prisma.authorizedPersonnel.findMany({
      where: {
        organizationId,
        disabled: false,
        isLocked: false,
        NOT: { id: requesterId },
        OR: [
          { isOrgOwner: true },
          { 
            role: { in: Object.keys(ROLE_WEIGHT).filter(r => ROLE_WEIGHT[r as Role] >= targetWeight) as Role[] },
            ...(targetWeight < ROLE_WEIGHT.ADMIN ? { branchId } : {}) 
          }
        ]
      },
      select: { id: true }
    });

    if (eligiblePersonnel.length === 0) return;

    // 2. Persist Notification (Removed 'severity' to fix TS2353)
    const notification = await prisma.notification.create({
      data: {
        organizationId,
        branchId,
        type: NotificationType.APPROVAL,
        actionTrigger: actionType,
        approvalId: approvalId,
        title: payload.title || "Authorization Required",
        message: payload.message || `A new ${actionType.toLowerCase().replace(/_/g, ' ')} request requires review.`,
        recipients: {
          create: eligiblePersonnel.map((p) => ({ personnelId: p.id })),
        },
      },
    });

    // 3. Real-time Dispatch (Pass severity manually to the builder)
    const alertPayload = buildAlertPayload({ ...notification, severity: Severity.HIGH }, "PUSH");
    
    await Promise.allSettled(
      eligiblePersonnel.map((p) => 
        pusherServer.trigger(`user-${p.id}`, "new-alert", alertPayload)
      )
    );
  } catch (error) {
    console.error("[EventBus:ApprovalRequested] Failed:", error);
  }
}

/**
 * HANDLE: approval.resolved
 */
export async function handleApprovalResolved(payload: EventPayloads["approval.resolved"]) {
  try {
    const isApproved = payload.status === "APPROVED";
    const statusLabel = isApproved ? "Authorized" : "Declined";
    
    const notification = await prisma.notification.create({
      data: {
        organizationId: payload.organizationId,
        branchId: payload.branchId,
        type: NotificationType.APPROVAL,
        actionTrigger: payload.actionType,
        approvalId: payload.approvalId,
        title: `Protocol ${statusLabel}`,
        message: `Your request for ${payload.actionType.replace(/_/g, " ")} has been ${payload.status.toLowerCase()}.`,
        recipients: {
          create: { personnelId: payload.requesterId },
        },
      },
    });

    const alertPayload = buildAlertPayload(
      { ...notification, severity: isApproved ? Severity.LOW : Severity.MEDIUM }, 
      "IN_APP"
    );
    await pusherServer.trigger(`user-${payload.requesterId}`, "new-alert", alertPayload);
  } catch (error) {
    console.error("[EventBus:ApprovalResolved] Failed:", error);
  }
}

/**
 * HANDLE: security.alert
 */
export async function handleSecurityAlert(payload: EventPayloads["security.alert"]) {
  try {
    const authority = await prisma.authorizedPersonnel.findMany({
      where: {
        organizationId: payload.organizationId,
        disabled: false,
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
        title: `SECURITY: ${payload.title}`,
        message: payload.message,
        recipients: {
          create: authority.map((p) => ({ personnelId: p.id })),
        },
      },
    });

    const alertPayload = buildAlertPayload({ ...notification, severity: Severity.CRITICAL }, "URGENT");

    await Promise.allSettled(
      authority.map((p) => 
        pusherServer.trigger(`user-${p.id}`, "new-alert", alertPayload)
      )
    );
  } catch (error) {
    console.error("[EventBus:SecurityAlert] Failed:", error);
  }
}

/**
 * HANDLE: inventory.alert
 */
export async function handleInventoryAlert(payload: EventPayloads["inventory.alert"]) {
  try {
    const personnel = await prisma.authorizedPersonnel.findMany({
      where: {
        organizationId: payload.organizationId,
        branchId: payload.branchId,
        disabled: false,
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

    const alertPayload = buildAlertPayload({ ...notification, severity: Severity.MEDIUM }, "IN_APP");

    await Promise.allSettled(
      personnel.map((p) => 
        pusherServer.trigger(`user-${p.id}`, "new-alert", alertPayload)
      )
    );
  } catch (error) {
    console.error("[EventBus:InventoryAlert] Failed:", error);
  }
}