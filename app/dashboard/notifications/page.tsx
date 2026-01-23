"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  read: boolean;
  title: string;
  message: string;
  createdAt: string;
}

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((res) => (res.ok ? res.json() : []));

export default function NotificationsPage() {
  const router = useRouter();
  const { data, mutate, isValidating } = useSWR<Notification[]>(
    "/api/notifications",
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: true }
  );

  const [loadingIds, setLoadingIds] = useState<string[]>([]);

  // Stable notifications
  const notifications = useMemo(() => data ?? [], [data]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  // Mark single notification read
  const handleMarkRead = async (id: string) => {
    if (loadingIds.includes(id)) return;
    setLoadingIds((prev) => [...prev, id]);

    mutate(
      notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      false
    );

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch (err) {
      console.error("Failed to mark notification read", err);
    } finally {
      setLoadingIds((prev) => prev.filter((i) => i !== id));
      mutate(); // revalidate
      router.push("/dashboard/notifications"); // optional navigation
    }
  };

  // Skeleton loading cards
  const skeletons = Array.from({ length: 5 });

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold text-gray-800 mb-4">Notifications</h1>

      {(!data || isValidating) && (
        <ul className="space-y-2">
          {skeletons.map((_, i) => (
            <li
              key={i}
              className="p-4 rounded border border-gray-200 bg-gray-50 animate-pulse flex flex-col gap-2"
            >
              <div className="h-4 w-3/4 bg-gray-300 rounded" />
              <div className="h-3 w-full bg-gray-200 rounded" />
              <div className="h-3 w-1/4 bg-gray-200 rounded self-end" />
            </li>
          ))}
        </ul>
      )}

      {!notifications.length && data && (
        <div className="text-gray-500 text-sm p-4 border border-gray-200 rounded bg-gray-50">
          No notifications
        </div>
      )}

      {notifications.length > 0 && (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const isLoading = loadingIds.includes(n.id);
            return (
              <li
                key={n.id}
                className={`p-4 rounded border border-gray-200 cursor-pointer flex flex-col gap-1 transition hover:shadow-md ${
                  !n.read ? "bg-gray-50 font-semibold" : "bg-white"
                } ${isLoading ? "opacity-70 pointer-events-none" : ""}`}
                onClick={() => handleMarkRead(n.id)}
              >
                <div className="flex justify-between items-center">
                  <span className="text-gray-800">{n.title}</span>
                  {!n.read && !isLoading && (
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  )}
                </div>
                <span className="text-gray-500 text-sm">{n.message}</span>
                <span className="text-gray-400 text-xs">
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {unreadCount > 0 && (
        <div className="mt-4 text-gray-600 text-sm">
          {unreadCount} unread {unreadCount === 1 ? "notification" : "notifications"}
        </div>
      )}
    </div>
  );
}
