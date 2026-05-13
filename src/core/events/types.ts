import { 
  CriticalAction, 
  Role, 
  Severity 
} from "@prisma/client";

/**
 * PRODUCTION EVENT PAYLOADS
 * These definitions ensure the EventBus carries all metadata required for:
 * 1. Database persistence (Notifications)
 * 2. Real-time dispatch (Pusher/Toasts)
 * 3. Authority filtering (RBAC)
 */
export type EventPayloads = {
  "approval.requested": {
    organizationId: string;
    branchId?: string | null;
    approvalId: string;
    requesterId: string;
    actionType: CriticalAction;
    requiredRole: Role; // Fixed: Now included for authority filtering
    title: string;
    message: string;
    severity?: Severity;
  };
  "approval.resolved": {
    organizationId: string;
    branchId?: string | null;
    approvalId: string;
    requesterId: string;
    approverId: string;
    status: "APPROVED" | "REJECTED";
    actionType: CriticalAction;
    title: string;
    message: string;
    severity?: Severity;
  };
  "security.alert": {
    organizationId: string;
    branchId?: string | null;
    activityLogId: string;
    actionTrigger: CriticalAction;
    title: string;
    message: string;
    severity: Severity;
  };
  "inventory.alert": {
    organizationId: string;
    branchId: string; // Branch required for inventory context
    productId: string;
    branchProductId: string;
    title: string;
    message: string;
    severity: Severity;
  };
};

export type AppEvent = keyof EventPayloads;