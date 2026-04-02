"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { getPusherClient } from "@/core/lib/pusher";
import { formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { NotificationType } from "@prisma/client";
import "boxicons/css/boxicons.min.css";

/* -------------------------------------------------- */
/* TYPES & CONFIG (Mirrored from AlertProvider) */
/* -------------------------------------------------- */

export interface Notification {
  id: string;
  read: boolean;
  title: string;
  message: string;
  type: NotificationType;
  createdAt: string;
  actionTrigger?: string;
  approvalId?: string; 
  entityId?: string;   
}

const TYPE_CONFIG: Record<NotificationType, { icon: string; bg: string }> = {
  SECURITY: { icon: "bx-shield-quarter", bg: "bg-red-500" },
  SYSTEM: { icon: "bx-cog", bg: "bg-slate-600" },
  APPROVAL: { icon: "bx-lock-open", bg: "bg-amber-500" },
  APPROVAL_DECISION: { icon: "bx-git-commit", bg: "bg-indigo-500" },
  SUCCESS: { icon: "bx-check-circle", bg: "bg-emerald-500" },
  WARNING: { icon: "bx-error", bg: "bg-orange-500" },
  INFO: { icon: "bx-info-circle", bg: "bg-blue-500" },
  INVENTORY: { icon: "bx-package", bg: "bg-purple-500" },
  TRANSACTIONAL: { icon: "bx-receipt", bg: "bg-emerald-600" },
};

/* -------------------------------------------------- */
/* HELPERS */
/* -------------------------------------------------- */

function groupNotifications(notifications: Notification[]) {
  const groups: Record<string, Notification[]> = { Today: [], Yesterday: [], Earlier: [] };
  notifications.forEach((n) => {
    const d = new Date(n.createdAt);
    if (isToday(d)) groups.Today.push(n);
    else if (isYesterday(d)) groups.Yesterday.push(n);
    else groups.Earlier.push(n);
  });
  return Object.entries(groups).filter(([_, items]) => items.length > 0);
}

/* -------------------------------------------------- */
/* MAIN COMPONENT */
/* -------------------------------------------------- */

export function NotificationsBell() {
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { data, mutate, isValidating } = useSWR<{ notifications: Notification[] }>(
    "/api/notifications?limit=20",
    (url) => fetch(url).then((res) => res.json())
  );

  const notifications = useMemo(() => data?.notifications ?? [], [data]);
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const grouped = useMemo(() => groupNotifications(notifications), [notifications]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`user-${session.user.id}`);
    const sync = () => mutate();
    channel.bind("new-alert", sync);
    channel.bind("notifications-read", sync);
    return () => { pusher.unsubscribe(`user-${session.user.id}`); };
  }, [session?.user?.id, mutate]);

  const handleMarkAllRead = async () => {
    setLoading(true);
    mutate({ notifications: notifications.map(n => ({ ...n, read: true })) }, false);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    setLoading(false);
    mutate();
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.read) {
      mutate({ notifications: notifications.map(x => x.id === n.id ? { ...x, read: true } : x) }, false);
      fetch(`/api/notifications/${n.id}`, { 
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }) 
      });
    }
    setOpen(false);
    router.push(n.entityId ? `/dashboard/context/${n.entityId}` : '/notifications');
  };

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          className={`relative flex w-9 h-9 items-center justify-center rounded-xl transition-all duration-300 outline-none
            ${open ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 shadow-inner" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"}
          `}
        >
          <i className={`bx bx-bell text-xl ${unreadCount > 0 ? "text-blue-500 animate-[bell-ring_1s_infinite]" : ""}`} />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500 border border-white dark:border-[#18181b]"></span>
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="w-[380px] bg-white dark:bg-[#18181b] border border-black/5 dark:border-white/10 shadow-2xl rounded-2xl overflow-hidden z-[100] outline-none"
          asChild
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.3 }}
          >
            {/* Header - Matching Alert Group Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
              <div className="flex items-center gap-2">
                <i className="bx bxs-bell text-blue-500 text-xs" />
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Notifications • {unreadCount} New
                </span>
              </div>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead} disabled={loading} className="text-[10px] font-bold text-blue-600 hover:text-blue-700 disabled:opacity-50 transition-colors uppercase tracking-tight">
                    Mark All Read
                  </button>
                )}
                <button onClick={() => mutate()} className={`text-slate-400 hover:text-slate-600 ${isValidating ? "animate-spin" : ""}`}>
                  <i className="bx bx-refresh text-lg" />
                </button>
              </div>
            </div>

            {/* Notification List */}
            <div className="max-h-[480px] overflow-y-auto overscroll-contain">
              <AnimatePresence mode="popLayout">
                {grouped.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 flex flex-col items-center justify-center text-center opacity-60">
                    <div className="w-12 h-12 bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-4">
                      <i className="bx bx-bell-off text-2xl text-slate-300" />
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-widest">All Clear</p>
                    <p className="text-[11px] text-slate-500 mt-1">No pending updates found</p>
                  </motion.div>
                ) : (
                  grouped.map(([label, items]) => (
                    <div key={label}>
                      <div className="px-5 py-2.5 bg-slate-50 dark:bg-white/5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest sticky top-0 z-10 backdrop-blur-md border-y border-black/5 dark:border-white/5">
                        {label}
                      </div>
                      {items.map((n) => (
                        <NotificationItem 
                          key={n.id} 
                          notification={n} 
                          onClick={() => handleNotificationClick(n)}
                          onActionComplete={() => mutate()} 
                        />
                      ))}
                    </div>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-black/5 dark:border-white/5 bg-slate-50/30 dark:bg-white/5">
              <button
                onClick={() => { setOpen(false); router.push("/notifications"); }}
                className="w-full py-2.5 rounded-xl bg-white dark:bg-[#202023] border border-black/5 dark:border-white/5 text-[11px] font-bold text-slate-500 hover:text-blue-500 dark:hover:text-white transition-all shadow-sm flex items-center justify-center gap-2"
              >
                View Full Activity History
                <i className="bx bx-right-arrow-alt text-lg" />
              </button>
            </div>
          </motion.div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/* -------------------------------------------------- */
/* ITEM COMPONENT (Matches AlertProvider PushItem style) */
/* -------------------------------------------------- */

function NotificationItem({ 
  notification: n, 
  onClick,
  onActionComplete 
}: { 
  notification: Notification; 
  onClick: () => void;
  onActionComplete: () => void; 
}) {
  const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.INFO;
  const [actingOn, setActingOn] = useState<"approve" | "reject" | null>(null);

  const handleAction = async (e: React.MouseEvent, type: "approve" | "reject") => {
    e.stopPropagation();
    setActingOn(type);
    try {
      await fetch(`/api/approvals/${n.approvalId}/${type}`, { method: "POST" });
      onActionComplete();
    } catch {
    } finally {
      setActingOn(null);
    }
  };

  return (
    <motion.div
      layout
      onClick={onClick}
      className={`relative px-5 py-4 border-b border-black/5 dark:border-white/5 cursor-pointer transition-all group 
        ${!n.read ? "bg-blue-50/40 dark:bg-blue-500/5" : "bg-white dark:bg-transparent hover:bg-slate-50 dark:hover:bg-white/5"}
      `}
    >
      <div className="flex gap-4">
        {/* Mirroring the Alert icon-box */}
        <div className={`w-9 h-9 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0 shadow-sm transition-transform group-hover:scale-105`}>
          <i className={`bx ${config.icon} text-white text-lg`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-0.5">
            <span className={`text-[12px] truncate pr-4 ${!n.read ? "font-bold text-slate-900 dark:text-white" : "font-semibold text-slate-500 dark:text-slate-400"}`}>
              {n.title}
            </span>
            <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap mt-0.5 uppercase tracking-tighter">
              {formatDistanceToNowStrict(new Date(n.createdAt))}
            </span>
          </div>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2">{n.message}</p>

          {/* Quick Actions */}
          {n.type === "APPROVAL" && !n.read && n.approvalId && (
            <div className="flex gap-2 mt-3">
              <button 
                disabled={actingOn !== null}
                onClick={(e) => handleAction(e, "approve")}
                className="px-4 py-1.5 bg-emerald-500 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-600 transition-colors shadow-sm disabled:opacity-50 min-w-[70px]"
              >
                {actingOn === "approve" ? <i className="bx bx-loader-alt animate-spin text-sm" /> : "Approve"}
              </button>
              <button 
                disabled={actingOn !== null}
                onClick={(e) => handleAction(e, "reject")}
                className="px-4 py-1.5 bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 text-slate-600 dark:text-slate-300 text-[10px] font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50 min-w-[70px]"
              >
                {actingOn === "reject" ? <i className="bx bx-loader-alt animate-spin text-sm" /> : "Reject"}
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Unread Accent Bar */}
      {!n.read && (
        <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-500 rounded-r-full shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
      )}
    </motion.div>
  );
}