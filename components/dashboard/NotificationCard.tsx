"use client";

import { FC, useMemo } from "react";

export type NotificationType =
  | "INFO"
  | "WARNING"
  | "ERROR"
  | "SYSTEM"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_DECISION";

export interface Notification {
  id: string;
  title?: string;
  message: string;
  read: boolean;
  type?: NotificationType;
  createdAt: string;
}

interface NotificationCardProps {
  notification: Notification;
  onMarkRead?: (id: string) => void;
}

const typeStyles: Record<NotificationType, { bg: string; icon: string }> = {
  INFO: { bg: "bg-blue-600", icon: "bx bx-info-circle" },
  WARNING: { bg: "bg-yellow-500", icon: "bx bx-error-circle" },
  ERROR: { bg: "bg-red-500", icon: "bx bx-x-circle" },
  SYSTEM: { bg: "bg-gray-700", icon: "bx bx-cog" },
  APPROVAL_REQUIRED: { bg: "bg-purple-600", icon: "bx bx-time" },
  APPROVAL_DECISION: { bg: "bg-green-600", icon: "bx bx-check" },
};

export const NotificationCard: FC<NotificationCardProps> = ({
  notification,
  onMarkRead,
}) => {
  const type = notification.type ?? "INFO";
  const { bg, icon } = typeStyles[type];

  const formattedDate = useMemo(
    () => new Date(notification.createdAt).toLocaleString(),
    [notification.createdAt]
  );

  return (
    <li
      className={`flex justify-between items-start gap-3 p-3 rounded-lg border border-gray-100 transition
      ${notification.read ? "opacity-70" : "bg-gray-50"}
      hover:bg-gray-100`}
    >
      {/* Icon + Content */}
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 flex items-center justify-center rounded-full text-white text-lg ${bg}`}
        >
          <i className={icon}></i>
        </div>

        <div className="flex flex-col min-w-0">
          {notification.title && (
            <span
              className={`text-sm font-semibold truncate ${
                notification.read ? "text-gray-500" : "text-gray-900"
              }`}
            >
              {notification.title}
            </span>
          )}

          <span
            className={`text-sm truncate ${
              notification.read ? "text-gray-500" : "text-gray-800 font-medium"
            }`}
          >
            {notification.message}
          </span>

          <span className="text-xs text-gray-400 mt-1">{formattedDate}</span>
        </div>
      </div>

      {/* Mark as Read Button */}
      {!notification.read && onMarkRead && (
        <button
          onClick={() => onMarkRead(notification.id)}
          className="flex-shrink-0 text-gray-400 hover:text-gray-900 transition p-1 rounded focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-300"
          aria-label="Mark as read"
        >
          <i className="bx bx-check text-lg"></i>
        </button>
      )}
    </li>
  );
};

/* ---------------- Notification List ---------------- */
interface NotificationListProps {
  notifications?: Notification[];
  loading?: boolean;
  onMarkRead?: (id: string) => void;
}

export const NotificationList: FC<NotificationListProps> = ({
  notifications,
  loading = false,
  onMarkRead,
}) => {
  if (loading) {
    return (
      <div className="flex justify-center items-center h-32 text-gray-500">
        Loading notifications...
      </div>
    );
  }

  if (!notifications || notifications.length === 0) {
    return (
      <div className="flex justify-center items-center h-32 text-gray-400">
        No notifications
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {notifications.map((n) => (
        <NotificationCard
          key={n.id}
          notification={n}
          onMarkRead={onMarkRead}
        />
      ))}
    </ul>
  );
};