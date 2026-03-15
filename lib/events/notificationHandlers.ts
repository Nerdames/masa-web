import prisma from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { eventBus } from "./eventBus";
import { EVENTS } from "./events";

/* -------------------------------- */
/* APPROVAL REQUESTED */
/* -------------------------------- */

eventBus.on(EVENTS.APPROVAL_REQUESTED, async (payload) => {
  const { approvalId, organizationId, branchId, actionType } = payload;

  const managers = await prisma.authorizedPersonnel.findMany({
    where: {
      organizationId,
      active: true,
      OR: [
        { role: "ADMIN" },
        { role: "MANAGER" }
      ]
    },
    select: { id: true }
  });

  const recipientIds = managers.map((u) => u.id);

  await createNotification({
    title: "Approval required",
    message: `A ${actionType} request requires approval.`,
    type: "APPROVAL_REQUIRED",
    organizationId,
    branchId,
    approvalId,
    recipientIds
  });
});

/* -------------------------------- */
/* APPROVAL DECISION */
/* -------------------------------- */

eventBus.on(EVENTS.APPROVAL_DECIDED, async (payload) => {
  const { approvalId, requesterId, status, organizationId } = payload;

  await createNotification({
    title: "Approval decision",
    message: `Your request was ${status}.`,
    type: "APPROVAL_DECISION",
    organizationId,
    approvalId,
    recipientIds: [requesterId]
  });
});

/* -------------------------------- */
/* SECURITY ALERT */
/* -------------------------------- */

eventBus.on(EVENTS.SECURITY_ALERT, async (payload) => {
  const { organizationId, message } = payload;

  const admins = await prisma.authorizedPersonnel.findMany({
    where: {
      organizationId,
      role: "ADMIN",
      active: true
    },
    select: { id: true }
  });

  const recipientIds = admins.map((u) => u.id);

  await createNotification({
    title: "Security alert",
    message,
    type: "WARNING",
    organizationId,
    recipientIds
  });
});