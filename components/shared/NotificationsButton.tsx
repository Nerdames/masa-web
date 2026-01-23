"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useMemo, useState } from "react";

interface Notification {
  id: string;
  read: boolean;
  title: string;
  message: string;
}

const fetcher = async (url: string): Promise<{ notifications: Notification[] }> => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return { notifications: [] };
  return res.json();
};

export function NotificationsButton() {
  const router = useRouter();
  const { data, mutate, isValidating } = useSWR<{ notifications: Notification[] }>(
    "/api/notifications",
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: true }
  );

  // Stable notifications array
  const notifications = useMemo(() => data?.notifications ?? [], [data]);

  // Count of unread notifications
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  // Show latest 10 notifications
  const latest = useMemo(() => notifications.slice(0, 10), [notifications]);

  const [loadingMarkAll, setLoadingMarkAll] = useState(false);

  // Mark a single notification as read
  const handleClick = async (notification: Notification) => {
    // Optimistic UI
    mutate(
      { notifications: notifications.map((n) => (n.id === notification.id ? { ...n, read: true } : n)) },
      false
    );

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notification.id }),
      });
    } catch (err) {
      console.error("Failed to mark notification as read", err);
    }

    router.push("/dashboard/notifications");
    mutate(); // Revalidate
  };

  // Optimized “Mark All as Read” handler
  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setLoadingMarkAll(true);

    // Optimistic UI
    mutate(
      { notifications: notifications.map((n) => ({ ...n, read: true })) },
      false
    );

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unreadIds }),
      });
    } catch (err) {
      console.error("Failed to mark all notifications as read", err);
    } finally {
      setLoadingMarkAll(false);
      mutate(); // Revalidate
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="relative w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition cursor-pointer">
          <i className="bx bx-bell text-[18px] text-gray-800" />
          <span
            className={`absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full transform transition-all duration-300 ease-out
              ${unreadCount === 0 ? "scale-0 opacity-0" : "scale-100 opacity-100 animate-pulse"}`}
          />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content
        align="end"
        sideOffset={6}
        className="bg-white border border-gray-200 rounded shadow-lg w-80 z-50 flex flex-col max-h-96"
      >
        {/* Header with refresh and mark all */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
          <span className="text-xs font-medium text-gray-600">Notifications</span>
          <div className="flex gap-2 items-center">
            {unreadCount > 0 && (
              <button
                className={`text-gray-500 hover:text-gray-700 text-xs transition ${
                  loadingMarkAll ? "cursor-not-allowed opacity-50" : ""
                }`}
                onClick={handleMarkAllRead}
                disabled={loadingMarkAll}
              >
                Mark all read
              </button>
            )}
            <button
              className={`text-gray-500 hover:text-gray-700 transition ${
                isValidating ? "animate-spin" : ""
              }`}
              onClick={() => mutate()}
            >
              <i className="bx bx-refresh text-[16px]" />
            </button>
          </div>
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto">
          {latest.length === 0 ? (
            <div className="text-sm text-gray-500 px-3 py-2">No notifications</div>
          ) : (
            latest.map((n) => (
              <DropdownMenu.Item asChild key={n.id}>
                <button
                  className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 flex flex-col gap-0.5 ${
                    !n.read ? "bg-gray-50 font-semibold" : ""
                  }`}
                  onClick={() => handleClick(n)}
                >
                  <span>{n.title}</span>
                  <span className="text-xs text-gray-500">{n.message}</span>
                </button>
              </DropdownMenu.Item>
            ))
          )}
        </div>

        {/* View all at bottom */}
        <div className="border-t border-gray-200 mt-2">
          <DropdownMenu.Item asChild>
            <button
              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 font-medium"
              onClick={() => router.push("/dashboard/notifications")}
            >
              View all notifications
            </button>
          </DropdownMenu.Item>
        </div>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
