import { CriticalAction, NotificationType } from "@prisma/client";

export type AlertKind = "PUSH" | "TOAST";

export interface MASAAlert {
  id: string;
  kind: AlertKind;
  type: NotificationType;
  title: string;
  message: string;
  duration?: number;
  code?: string; 
  approvalId?: string;
  actionType?: CriticalAction;
}

export interface AlertContextType {
  dispatch: (alert: Omit<MASAAlert, "id">) => void;
  processApproval: (id: string, decision: "APPROVED" | "REJECTED") => Promise<void>;
}