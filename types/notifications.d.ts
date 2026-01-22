import type { NotificationType } from "./enums";

/* ---------------------------------------------
 * Notification
 * ------------------------------------------- */
export interface Notification {
  id: string;
  organizationId: string;
  branchId?: string | null;
  personnelId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}
