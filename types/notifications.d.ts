import type { NotificationType } from "./enums";

/* ---------------------------------------------
 * Notification
 * Mirrors Prisma Notification model
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

  /**
   * Prisma: Json?
   * Stores personnelIds who have read the notification
   */
  readBy?: string[] | null;

  createdAt: Date;
}
