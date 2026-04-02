import { CriticalAction, NotificationType } from "@prisma/client";

export type EventPayloads = {
  "approval.requested": {
    organizationId: string;
    branchId?: string | null;
    approvalId: string;
    requesterId: string;
    actionType: CriticalAction;
    notificationType: NotificationType;
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
    activityLogId: string;
    actionTrigger: CriticalAction;
    title: string;
    message: string;
  };
  "inventory.alert": {
    organizationId: string;
    branchId: string; // Branch is required for inventory
    productId: string;
    branchProductId: string;
    title: string;
    message: string;
  };
};

export type AppEvent = keyof EventPayloads;