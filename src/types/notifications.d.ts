import type { NotificationType, CriticalAction } from "./enums";

/* ---------------------------------------------
 * Notification
 * Mirrors Prisma Notification model [cite: 1577-1582]
 * ------------------------------------------- */
export interface Notification {
  id: string;
  organizationId: string;
  branchId?: string | null;

  type: NotificationType;
  
  /**
   * Links to the specific action that triggered this notification [cite: 1578]
   */
  actionTrigger?: CriticalAction | null;
  
  /**
   * References to associated activity logs or approval requests 
   */
  activityLogId?: string | null;
  approvalId?: string | null;

  title: string;
  message: string;

  /**
   * Note: In the Prisma schema, 'read' status and 'personnelId' 
   * are handled via the NotificationRecipient join table.
   * If you are flattening this for a frontend view:
   */
  read?: boolean; 
  
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

/**
 * Join table mirroring the NotificationRecipient model 
 */
export interface NotificationRecipient {
  id: string;
  notificationId: string;
  personnelId: string;
  read: boolean; // Default is false 
  createdAt: Date;
  updatedAt: Date;
}