"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useMemo, useState, useEffect } from "react";
import { Tooltip } from "@/components/feedback/Tooltip";
import { useSession } from "next-auth/react";
import { getPusherClient } from "@/lib/pusher";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  read: boolean;
  title: string;
  message: string;
  type: "SECURITY" | "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  createdAt: string;
  approvalId?: string;
}

interface Props {
  onUnreadChange?: (count: number) => void;
}

const fetcher = async (url: string): Promise<{ notifications: Notification[] }> => {
  const res = await fetch(url);
  if (!res.ok) return { notifications: [] };
  return res.json();
};

const TYPE_CONFIG = {
  SECURITY: { icon: "bx-shield-quarter", color: "text-red-600", bg: "bg-red-50" },
  WARNING: { icon: "bx-error", color: "text-amber-600", bg: "bg-amber-50" },
  SUCCESS: { icon: "bx-check-circle", color: "text-emerald-600", bg: "bg-emerald-50" },
  ERROR: { icon: "bx-x-circle", color: "text-rose-600", bg: "bg-rose-50" },
  INFO: { icon: "bx-info-circle", color: "text-blue-600", bg: "bg-blue-50" },
};

export function NotificationsBell({ onUnreadChange }: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const { data, mutate, isValidating } = useSWR<{ notifications: Notification[] }>(
    "/api/notifications",
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: true }
  );

  const notifications = useMemo(() => data?.notifications ?? [], [data]);
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  useEffect(() => {
    if (!session?.user?.organizationId) return;

    const pusher = getPusherClient();
    const channel = pusher.subscribe(`org-${session.user.organizationId}`);
    const handleUpdate = () => mutate();

    channel.bind("critical-alert", handleUpdate);
    channel.bind("new-notification", handleUpdate);

    return () => {
      pusher.unsubscribe(`org-${session.user.organizationId}`);
    };
  }, [session?.user?.organizationId, mutate]);

  useEffect(() => {
    onUnreadChange?.(unreadCount);
  }, [unreadCount, onUnreadChange]);

  const latest = useMemo(() => notifications.slice(0, 8), [notifications]);
  const [loadingMarkAll, setLoadingMarkAll] = useState(false);

  const handleMarkRead = async (id: string, approvalId?: string) => {
    mutate(
      { notifications: notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) },
      false
    );

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch (err) {
      console.error("Sync error:", err);
    }

    if (approvalId) {
      router.push(`/dashboard/notifications?selected=${id}`);
    } else {
      router.push(`/dashboard/notifications?selected=${id}`);
    }
  };

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setLoadingMarkAll(true);
    mutate({ notifications: notifications.map((n) => ({ ...n, read: true })) }, false);

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unreadIds }),
      });
    } finally {
      setLoadingMarkAll(false);
      mutate();
    }
  };

  return (
    <DropdownMenu.Root>
      <Tooltip side="bottom" content={unreadCount > 0 ? `${unreadCount} unread alerts` : "Notifications"}>
        <DropdownMenu.Trigger asChild>
          <button className="relative w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-slate-200 transition-all group outline-none focus:ring-2 focus:ring-blue-500/20">
            <i className={`bx bx-bell text-lg transition-colors ${unreadCount > 0 ? "text-blue-600" : "text-slate-500 group-hover:text-slate-700"}`} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white animate-pulse" />
            )}
          </button>
        </DropdownMenu.Trigger>
      </Tooltip>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="w-[380px] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden z-[100] animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Security Feed</h3>
              <p className="text-[11px] text-slate-500 font-bold">{unreadCount} pending alerts</p>
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  disabled={loadingMarkAll}
                  className="p-1.5 rounded-md hover:bg-white text-slate-400 hover:text-blue-600 transition-colors"
                  title="Clear all"
                >
                  <i className="bx bx-check-double text-xl" />
                </button>
              )}
              <button
                onClick={() => mutate()}
                className={`p-1.5 rounded-md hover:bg-white text-slate-400 hover:text-slate-600 transition-all ${isValidating ? "animate-spin text-blue-500" : ""}`}
              >
                <i className="bx bx-refresh text-xl" />
              </button>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto overflow-x-hidden custom-scrollbar">
            {latest.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-300">
                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                  <i className="bx bx-notification-off text-2xl" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest">No Recent Activity</p>
              </div>
            ) : (
              latest.map((n) => {
                const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.INFO;
                return (
                  <DropdownMenu.Item
                    key={n.id}
                    className={`group px-5 py-4 flex gap-4 cursor-pointer outline-none transition-colors border-b border-slate-50 last:border-0 ${!n.read ? "bg-blue-50/20 hover:bg-blue-50/40" : "hover:bg-slate-50"}`}
                    onSelect={(e) => {
                      e.preventDefault(); 
                      handleMarkRead(n.id, n.approvalId);
                    }}
                  >
                    <div className={`flex-shrink-0 w-9 h-9 rounded-xl ${config.bg} flex items-center justify-center shadow-sm`}>
                      <i className={`bx ${config.icon} text-lg ${config.color}`} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-0.5">
                        <span className={`text-[13px] font-bold truncate ${!n.read ? "text-slate-900" : "text-slate-600"}`}>
                          {n.title}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap ml-2">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-[12px] text-slate-500 line-clamp-2 leading-snug font-medium">
                        {n.message}
                      </p>
                      
                      {n.approvalId && !n.read && (
                        <div className="mt-2.5 flex items-center gap-1.5 text-[9px] font-black uppercase text-amber-600 tracking-widest bg-amber-50 w-fit px-2 py-0.5 rounded-md">
                          <i className="bx bxs-lock-open animate-pulse" />
                          Auth Required
                        </div>
                      )}
                    </div>
                  </DropdownMenu.Item>
                );
              })
            )}
          </div>

          <div className="p-3 bg-slate-50 border-t border-slate-100">
            <button
              onClick={() => router.push("/dashboard/notifications")}
              className="w-full py-2 rounded-lg bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm"
            >
              View Analysis Dashboard
            </button>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}