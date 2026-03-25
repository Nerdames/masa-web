"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useMemo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip } from "@/core/components/feedback/Tooltip";
import { useSession } from "next-auth/react";
import { getPusherClient } from "@/core/lib/pusher";
import { formatDistanceToNowStrict } from "date-fns";
import { NotificationType } from "@prisma/client";
import "boxicons/css/boxicons.min.css";

/* -------------------------------------------------- */
/* TYPES & CONFIG */
/* -------------------------------------------------- */

interface Notification {
  id: string;
  read: boolean;
  title: string;
  message: string;
  type: NotificationType;
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

const TYPE_CONFIG: Record<NotificationType, { icon: string; color: string; bg: string; solidBg: string; label: string }> = {
  SECURITY: { icon: "bx-shield-quarter", color: "text-red-600", bg: "bg-red-50", solidBg: "bg-red-500", label: "Security" },
  SYSTEM: { icon: "bx-cog", color: "text-slate-600", bg: "bg-slate-50", solidBg: "bg-slate-500", label: "System" },
  APPROVAL: { icon: "bx-lock-open", color: "text-amber-600", bg: "bg-amber-50", solidBg: "bg-amber-500", label: "Approvals" },
  APPROVAL_DECISION: { icon: "bx-git-commit", color: "text-indigo-600", bg: "bg-indigo-50", solidBg: "bg-indigo-500", label: "Decisions" },
  SUCCESS: { icon: "bx-check-circle", color: "text-emerald-600", bg: "bg-emerald-50", solidBg: "bg-emerald-500", label: "Success" },
  WARNING: { icon: "bx-error", color: "text-orange-600", bg: "bg-orange-50", solidBg: "bg-orange-500", label: "Warnings" },
  INFO: { icon: "bx-info-circle", color: "text-blue-600", bg: "bg-blue-50", solidBg: "bg-blue-500", label: "Updates" },
  INVENTORY: { icon: "bx-package", color: "text-purple-600", bg: "bg-purple-50", solidBg: "bg-purple-500", label: "Inventory" },
  TRANSACTIONAL: { icon: "bx-receipt", color: "text-emerald-600", bg: "bg-emerald-50", solidBg: "bg-emerald-500", label: "Transactions" },
};

function formatTime(dateStr: string) {
  try {
    return formatDistanceToNowStrict(new Date(dateStr))
      .replace(/ seconds?/, "s")
      .replace(/ minutes?/, "m")
      .replace(/ hours?/, "h")
      .replace(/ days?/, "d");
  } catch (e) {
    return "now";
  }
}

/* -------------------------------------------------- */
/* COMPONENT */
/* -------------------------------------------------- */

export function NotificationsBell({ onUnreadChange }: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [loadingMarkAll, setLoadingMarkAll] = useState(false);
  
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onUnreadChangeRef = useRef(onUnreadChange);
  const lastNotifiedCount = useRef<number | null>(null);

  useEffect(() => {
    onUnreadChangeRef.current = onUnreadChange;
  }, [onUnreadChange]);

  const { data, mutate, isValidating } = useSWR<{ notifications: Notification[] }>(
    "/api/notifications",
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: true }
  );

  const notifications = useMemo(() => data?.notifications ?? [], [data]);
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const grouped = useMemo(() => {
    return notifications.reduce((acc, n) => {
      if (!acc[n.type]) acc[n.type] = [];
      acc[n.type].push(n);
      return acc;
    }, {} as Record<string, Notification[]>);
  }, [notifications]);

  // Handle Real-time updates
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
    if (onUnreadChangeRef.current && unreadCount !== lastNotifiedCount.current) {
      lastNotifiedCount.current = unreadCount;
      onUnreadChangeRef.current(unreadCount);
    }
  }, [unreadCount]);

  const handleMouseEnter = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  };

  const handleMouseLeave = () => {
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, 1200);
  };

  const handleMarkRead = async (id: string) => {
    mutate(
      { notifications: notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) },
      false
    );
    setOpen(false);
    
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch (err) {
      console.error("Sync error:", err);
    }
    router.push(`/dashboard/notifications?selected=${id}`);
  };

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setLoadingMarkAll(true);
    mutate(
      { notifications: notifications.map((n) => ({ ...n, read: true })) },
      false
    );

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
    <DropdownMenu.Root 
      open={open} 
      onOpenChange={(v) => { 
        setOpen(v); 
        if (!v) setExpandedGroup(null); 
      }}
    >
      {/* FIX: Wrap the DropdownMenu.Trigger in the Tooltip safely.
        By placing the trigger inside the Tooltip but ensuring the Tooltip itself 
        doesn't directly hijack the button's focus events (using an intermediate span if needed, 
        or relying on Radix's standard composition). 
        If `Tooltip` is a custom component, separating them is the safest route.
      */}
        <span>
          <DropdownMenu.Trigger asChild>
            <button className="relative w-9 h-9 rounded-[12px] bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-all group outline-none focus:ring-2 focus:ring-blue-500/20">
              <i className={`bx bx-bell text-xl transition-colors ${unreadCount > 0 ? "text-blue-600" : "text-slate-500 group-hover:text-slate-700"}`} />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
              )}
            </button>
          </DropdownMenu.Trigger>
        </span>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={12}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          asChild
        >
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-[380px] bg-white rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-100 flex flex-col overflow-hidden z-[100] outline-none"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
              <div className="flex-1">
                {expandedGroup ? (
                  <button onClick={() => setExpandedGroup(null)} className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 transition-colors group">
                    <div className="w-5 h-5 rounded-full bg-slate-200/50 flex items-center justify-center group-hover:bg-slate-200 transition-colors">
                      <i className="bx bx-chevron-left text-sm" />
                    </div>
                    Back to Feed
                  </button>
                ) : (
                  <>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Security Feed</h3>
                    <p className="text-[12px] text-slate-600 font-bold">{unreadCount} pending alerts</p>
                  </>
                )}
              </div>

              {!expandedGroup && (
                <div className="flex items-center gap-1.5">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      disabled={loadingMarkAll}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white text-slate-400 hover:text-blue-600 transition-colors"
                      title="Clear all"
                    >
                      <i className="bx bx-check-double text-xl" />
                    </button>
                  )}
                  <button
                    onClick={() => mutate()}
                    className={`w-8 h-8 flex items-center justify-center rounded-full hover:bg-white text-slate-400 hover:text-slate-600 transition-all ${isValidating ? "animate-spin text-blue-500" : ""}`}
                  >
                    <i className="bx bx-refresh text-xl" />
                  </button>
                </div>
              )}
            </div>

            {/* Content Area */}
            <div className="h-[420px] overflow-y-auto overflow-x-hidden custom-scrollbar bg-slate-50/30">
              <AnimatePresence mode="wait">
                {Object.keys(grouped).length === 0 ? (
                  <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-20 flex flex-col items-center justify-center text-slate-300">
                    <div className="w-14 h-14 rounded-[18px] bg-slate-50 flex items-center justify-center mb-4">
                      <i className="bx bx-notification-off text-3xl" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.15em]">No Recent Activity</p>
                  </motion.div>
                ) : expandedGroup ? (
                  <motion.div 
                    key="list" 
                    initial={{ opacity: 0, x: 20 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    exit={{ opacity: 0, x: -20 }} 
                    transition={{ ease: "circOut", duration: 0.25 }}
                    className="flex flex-col p-3"
                  >
                    <div className="mb-2 px-3 pt-2 flex items-center gap-2">
                      <div className={`w-1.5 h-3.5 rounded-full ${TYPE_CONFIG[expandedGroup as NotificationType].solidBg}`} />
                      <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                        {TYPE_CONFIG[expandedGroup as NotificationType].label} ({grouped[expandedGroup].length})
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      {grouped[expandedGroup].map((n) => (
                        <div 
                          key={n.id} 
                          onClick={() => handleMarkRead(n.id)}
                          className="group py-3 px-4 bg-white border border-slate-100 hover:border-blue-200 transition-colors cursor-pointer rounded-[14px] shadow-sm"
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span className={`text-[13px] font-bold ${!n.read ? "text-slate-900" : "text-slate-600"}`}>
                              {n.title}
                            </span>
                            <span className={`text-[10px] font-bold uppercase mt-0.5 ${!n.read ? "text-blue-500" : "text-slate-400"}`}>
                              {formatTime(n.createdAt)}
                            </span>
                          </div>
                          <p className="text-[12px] text-slate-500 line-clamp-2 leading-relaxed">
                            {n.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="groups" 
                    initial={{ opacity: 0, x: -20 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    exit={{ opacity: 0, x: 20 }} 
                    transition={{ ease: "circOut", duration: 0.25 }}
                    className="flex flex-col gap-5 p-4"
                  >
                    {Object.entries(grouped).map(([type, items]) => {
                      const config = TYPE_CONFIG[type as NotificationType];
                      const latest = items[0];
                      const hasMultiple = items.length > 1;

                      return (
                        <div key={type} className="relative group cursor-pointer" onClick={() => setExpandedGroup(type)}>
                          {hasMultiple && (
                            <>
                              <div className="absolute -bottom-1.5 left-2 right-2 h-6 bg-white border border-slate-200/60 rounded-[16px] z-0 shadow-sm transition-transform group-hover:translate-y-[2px]" />
                              <div className="absolute -bottom-3 left-4 right-4 h-6 bg-slate-50 border border-slate-200/40 rounded-[14px] z-[-1] shadow-sm transition-transform group-hover:translate-y-[4px]" />
                            </>
                          )}
                          
                          <div className="relative z-10 flex gap-4 p-4 bg-white border border-slate-200/80 rounded-[20px] shadow-sm group-hover:border-slate-300 transition-all">
                            <div className={`flex-shrink-0 w-11 h-11 rounded-[14px] ${config.bg} flex items-center justify-center border border-white shadow-sm mt-0.5`}>
                              <i className={`bx ${config.icon} text-2xl ${config.color}`} />
                            </div>

                            <div className="flex-1 min-w-0 pr-2">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                                  {config.label}
                                </span>
                                {hasMultiple && (
                                  <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-md border border-slate-200">
                                    {items.length} Alerts
                                  </span>
                                )}
                              </div>
                              <p className="text-[14px] font-bold text-slate-900 truncate">
                                {latest.title} <span className="text-slate-400 font-medium ml-1">· {formatTime(latest.createdAt)}</span>
                              </p>
                              <p className="text-[13px] text-slate-500 line-clamp-1 truncate mt-0.5 font-medium">
                                {latest.message}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="p-4 bg-white border-t border-slate-100 z-10 relative shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.02)]">
              <button
                onClick={() => { setOpen(false); router.push("/dashboard/notifications"); }}
                className="w-full py-2.5 rounded-[14px] bg-slate-50 border border-slate-200 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-white transition-all shadow-sm"
              >
                View Analysis Dashboard
              </button>
            </div>
          </motion.div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}