// src/core/events/types.ts
import { CriticalAction, NotificationType } from "@prisma/client";

export type EventPayloads = {
  "approval.requested": {
    organizationId: string;
    branchId?: string | null;
    approvalId: string;
    requesterId: string;
    actionType: CriticalAction;
    notificationType: NotificationType; // Now included
    title: string;
    message: string;
  };
  "approval.resolved": {
    organizationId: string;
    branchId?: string | null;
    approvalId: string;
    requesterId: string;
    approverId: string;
    status: "APPROVED" | "REJECTED";
    actionType: CriticalAction;
    notificationType: NotificationType;
  };
  "security.alert": {
    organizationId: string;
    branchId?: string | null;
    personnelId?: string;
    activityLogId?: string;
    actionTrigger?: CriticalAction;
    notificationType: NotificationType;
    title: string;
    message: string;
  };
  "inventory.alert": {
    organizationId: string;
    branchId: string;
    productId: string;
    branchProductId: string;
    notificationType: NotificationType;
    title: string;
    message: string;
  };
};

export type AppEvent = keyof EventPayloads;