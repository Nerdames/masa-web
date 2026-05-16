"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { getPusherClient } from "@/core/lib/pusher";
import { formatDistanceToNowStrict } from "date-fns";
import { NotificationType } from "@prisma/client";
import {
  Bell,
  ShieldAlert,
  Settings,
  LockKeyholeOpen,
  CheckCircle2,
  AlertTriangle,
  Info,
  Package,
  RefreshCw,
  Inbox,
  ArrowRight,
  LucideIcon,
  Receipt,
  CheckCheck
} from "lucide-react";

/* ==========================================================================
   TYPES & CONFIG
   ========================================================================== */

export interface Notification {
  id: string;
  recipientEntryId?: string;
  read: boolean;
  title: string;
  message: string;
  type: NotificationType | "SUCCESS" | "WARNING";
  createdAt: string;
  actionTrigger?: string;
  context?: {
    type: "APPROVAL" | "ACTIVITY" | "VOID_REQUEST";
    id: string;
    status?: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
    actionType?: string;
    requesterName?: string;
    actor?: { name: string };
    ip?: string;
  } | null;
}

const TYPE_CONFIG: Record<string, { icon: LucideIcon; bg: string }> = {
  SECURITY: { icon: ShieldAlert, bg: "bg-red-500" },
  SYSTEM: { icon: Settings, bg: "bg-slate-600" },
  APPROVAL: { icon: LockKeyholeOpen, bg: "bg-amber-500" },
  SUCCESS: { icon: CheckCircle2, bg: "bg-emerald-500" },
  WARNING: { icon: AlertTriangle, bg: "bg-orange-500" },
  INFO: { icon: Info, bg: "bg-blue-500" },
  INVENTORY: { icon: Package, bg: "bg-purple-500" },
  TRANSACTIONAL: { icon: Receipt, bg: "bg-emerald-600" },
};

function getRelativeTime(timestamp: string): string {
  const diffInMins = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
  if (diffInMins < 1) return "Now";
  if (diffInMins < 60) return `${diffInMins}m`;
  if (diffInMins < 1440) return `${Math.floor(diffInMins / 60)}h`;
  return `${Math.floor(diffInMins / 1440)}d`;
}

/* ==========================================================================
   MAIN COMPONENT
   ========================================================================== */

export function NotificationsBell() {
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  const { data, mutate, isValidating } = useSWR<{ notifications: Notification[]; unreadCount: number }>(
    session?.user?.id ? "/api/notifications?limit=20" : null,
    (url) => fetch(url).then((res) => res.json()),
    { revalidateOnFocus: false, revalidateOnReconnect: true }
  );

  /**
   * OPERATIONAL FILTER:
   * The bell only displays items requiring immediate attention.
   */
  const activeNotifications = useMemo(() => {
    return (data?.notifications ?? []).filter((n) => !n.read);
  }, [data]);

  const unreadCount = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!session?.user?.id || !session?.user?.organizationId) return;
    const pusher = getPusherClient();

    const userChannel = pusher.subscribe(`user-${session.user.id}`);
    const orgChannel = pusher.subscribe(`org-${session.user.organizationId}`);

    const sync = () => mutate();

    userChannel.bind("new-alert", sync);
    userChannel.bind("notifications-read", sync);
    orgChannel.bind("approval-resolved", sync);

    return () => {
      userChannel.unbind_all();
      orgChannel.unbind_all();
      pusher.unsubscribe(`user-${session.user.id}`);
      pusher.unsubscribe(`org-${session.user.organizationId}`);
    };
  }, [session?.user?.id, session?.user?.organizationId, mutate]);

  const handleMarkAllInformationalRead = async () => {
    if (!data) return;
    const previousData = data;

    // Optimistic UI update
    mutate({ ...data, notifications: [], unreadCount: 0 }, false);

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      mutate();
    } catch (err) {
      mutate(previousData, false);
    }
  };

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors outline-none group">
          <Bell
            className={`w-5 h-5 transition-colors ${
              unreadCount > 0 ? "text-blue-600 dark:text-blue-400 animate-[bell-ring_2s_infinite]" : "text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white"
            }`}
          />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2.5 flex h-2.5 w-2.5">
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border-2 border-white dark:border-[#18181b]" />
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="w-[calc(100vw-24px)] sm:w-[420px] max-h-[85vh] sm:max-h-[80vh] bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/10 shadow-2xl rounded-2xl overflow-hidden z-[100] outline-none flex flex-col animate-in fade-in zoom-in-95 duration-200"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {/* Operational Header */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50/50 dark:bg-white/5 text-slate-900 dark:text-white shrink-0">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-tight">System Alerts</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium italic">Unresolved Notifications</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleMarkAllInformationalRead}
                className="text-[10px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 uppercase transition-all"
              >
                Clear All
              </button>
              <button onClick={() => mutate()} disabled={isValidating} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">
                <RefreshCw className={`w-4 h-4 ${isValidating ? "animate-spin text-blue-500" : ""}`} />
              </button>
            </div>
          </div>

          {/* Buffer List */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-2">
            <AnimatePresence initial={false} mode="popLayout">
              {activeNotifications.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-16 flex flex-col items-center opacity-40">
                  <Inbox className="w-10 h-10 mb-3 text-slate-400 dark:text-slate-500" />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">All Caught Up</p>
                </motion.div>
              ) : (
                activeNotifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    n={n}
                    onResolved={() => mutate()}
                    onNavigate={() => {
                      setOpen(false);
                      router.push(`/notifications`);
                    }}
                  />
                ))
              )}
            </AnimatePresence>
          </div>

          {/* Redirect to Persistent Feed */}
          <div className="p-3 bg-white dark:bg-[#18181b] border-t border-slate-100 dark:border-white/5 shrink-0">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/notifications");
              }}
              className="w-full py-3 sm:py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white active:bg-slate-100 dark:active:bg-white/10 transition-all flex items-center justify-center gap-2 group"
            >
              Access Full Activity Terminal 
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/* ==========================================================================
   ITEM COMPONENT (ACCORDION & ROUTING)
   ========================================================================== */

function NotificationItem({
  n,
  onResolved,
  onNavigate,
}: {
  n: Notification;
  onResolved: () => void;
  onNavigate: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  
  const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.INFO;
  const IconComponent = config.icon;

  const handleMarkRead = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent routing when marking as read
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id, read: true }),
      });
      onResolved();
    } catch (err) {
      console.error("[NotificationItem] Failed to mark read", err);
    }
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent routing when toggling details
    setIsExpanded(!isExpanded);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={onNavigate}
      className="group bg-white dark:bg-[#202023] p-3 rounded-xl border border-transparent hover:border-black/5 dark:hover:border-white/10 mb-1.5 last:mb-0 cursor-pointer transition-colors shadow-sm shadow-black/5 dark:shadow-none"
    >
      <div className="flex gap-3">
        <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${config.bg} shadow-sm`}>
          <IconComponent className="w-4 h-4 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-0.5">
            <span className="text-[12px] font-semibold text-slate-900 dark:text-white truncate pr-2">
              {n.title}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
              {getRelativeTime(n.createdAt)}
            </span>
          </div>

          <p
            ref={textRef}
            className={`text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed ${isExpanded ? "" : "line-clamp-1"}`}
          >
            {n.message}
          </p>

          <AnimatePresence>
            {isExpanded && n.context && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/5 flex flex-col gap-2">
                  {n.actionTrigger && (
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium capitalize">
                        Scope: {n.actionTrigger.toLowerCase().replace(/_/g, " ")}
                      </span>
                    </div>
                  )}

                  {n.context.actor && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/5 p-2 rounded-md border border-slate-100 dark:border-white/5">
                      Originator: <span className="font-bold text-slate-700 dark:text-slate-300">{n.context.actor.name}</span> {n.context.ip ? `(${n.context.ip})` : ""}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-2.5 flex items-center gap-3">
            <button
              onClick={handleMarkRead}
              className="text-[10px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline flex items-center gap-1 transition-colors"
            >
              <CheckCheck className="w-3 h-3" /> Mark Read
            </button>
            <button
              onClick={handleToggleExpand}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              {isExpanded ? "Show Less" : "Details"}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}