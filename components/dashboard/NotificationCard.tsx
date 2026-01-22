"use client";

import { FC } from "react";

export interface Notification {
  id: string;
  title?: string;
  message: string;
  read: boolean;
  type?: "info" | "success" | "warning" | "alert";
  userId?: string;
  createdAt: string;
}

interface NotificationCardProps {
  notification: Notification;
  onMarkRead?: (id: string) => void;
}

const NotificationCard: FC<NotificationCardProps> = ({ notification, onMarkRead }) => {
  // Determine background color based on type
  const getBgColor = (): string => {
    switch (notification.type) {
      case "alert":
        return "bg-red-500";
      case "success":
        return "bg-green-600";
      case "warning":
        return "bg-yellow-500";
      default:
        return "bg-blue-600";
    }
  };

  // Icon based on notification type
  const getIcon = () => {
    switch (notification.type) {
      case "alert":
        return <i className="bx bx-error"></i>;
      case "warning":
        return <i className="bx bx-error-circle"></i>;
      case "success":
        return <i className="bx bx-check"></i>;
      default:
        return <i className="bx bx-info-circle"></i>;
    }
  };

  return (
    <li
      className={`flex justify-between items-start p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition ${
        notification.read ? "opacity-70" : "bg-gray-50"
      }`}
    >
      {/* Left Icon + Message */}
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 flex items-center justify-center rounded-full text-white text-lg ${getBgColor()}`}
        >
          {getIcon()}
        </div>

        <div className="flex flex-col">
          {notification.title && (
            <span className={`text-sm font-semibold ${notification.read ? "text-gray-600" : "text-black"}`}>
              {notification.title}
            </span>
          )}
          <span className={`text-sm ${notification.read ? "text-gray-600" : "text-black font-medium"}`}>
            {notification.message}
          </span>
          <span className="text-xs text-gray-400">
            {new Date(notification.createdAt).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Mark as Read */}
      {!notification.read && onMarkRead && (
        <button
          onClick={() => onMarkRead(notification.id)}
          className="text-gray-400 hover:text-black transition p-1"
          title="Mark as read"
        >
          <i className="bx bx-check text-lg"></i>
        </button>
      )}
    </li>
  );
};

export default NotificationCard;
