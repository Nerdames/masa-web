"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { getPusherClient } from "@/core/lib/pusher";
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
        <button className="relative w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-md hover:bg-slate-50 border border-transparent transition-colors outline-none group">
          <Bell
            className={`w-3.5 h-3.5 transition-colors ${
              unreadCount > 0 ? "text-blue-600 animate-[bell-ring_2s_infinite]" : "text-slate-400 group-hover:text-slate-600"
            }`}
          />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-1 w-1">
              <span className="relative inline-flex rounded-full h-1 w-1 bg-red-500 border border-white" />
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="w-60 max-h-[70vh] bg-white border border-slate-200 shadow-xl rounded-lg overflow-hidden z-[100] outline-none flex flex-col animate-in fade-in zoom-in-95 duration-150"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {/* Operational Header */}
          <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 text-slate-900 shrink-0">
            <div>
              <h3 className="text-[9px] font-normal uppercase tracking-wider text-slate-400">Alerts</h3>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleMarkAllInformationalRead}
                className="text-[9px] font-normal text-blue-500 hover:font-medium hover:text-blue-600 uppercase transition-all"
              >
                Clear All
              </button>
              <button onClick={() => mutate()} disabled={isValidating} className="text-slate-300 hover:text-slate-500 transition-colors">
                <RefreshCw className={`w-2.5 h-2.5 ${isValidating ? "animate-spin text-blue-500" : ""}`} />
              </button>
            </div>
          </div>

          {/* Buffer List */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-1 bg-white">
            <AnimatePresence initial={false} mode="popLayout">
              {activeNotifications.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-6 flex flex-col items-center opacity-40">
                  <Inbox className="w-5 h-5 mb-1 text-slate-300" />
                  <p className="text-[8.5px] font-normal uppercase tracking-wider text-slate-400">All Caught Up</p>
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
          <div className="p-1 bg-white border-t border-slate-100 shrink-0">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/notifications");
              }}
              className="w-full py-1 rounded border border-slate-200 text-[9px] font-normal text-slate-400 hover:bg-slate-50 hover:font-medium hover:text-slate-700 transition-all flex items-center justify-center gap-0.5 group"
            >
              Activity Terminal 
              <ArrowRight className="w-2.5 h-2.5 group-hover:translate-x-0.5 transition-transform" />
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
    e.stopPropagation();
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
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      onClick={onNavigate}
      className="group bg-white p-1.5 rounded border border-transparent hover:border-slate-100 mb-1 last:mb-0 cursor-pointer transition-colors"
    >
      <div className="flex gap-2">
        <div className={`w-5.5 h-5.5 rounded flex-shrink-0 flex items-center justify-center ${config.bg}`}>
          <IconComponent className="w-3 h-3 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-0.5">
            <span className="text-[10px] font-normal text-slate-800 group-hover:font-medium truncate pr-1">
              {n.title}
            </span>
            <span className="text-[8px] text-slate-400 whitespace-nowrap">
              {getRelativeTime(n.createdAt)}
            </span>
          </div>

          <p
            ref={textRef}
            className={`text-[9.5px] text-slate-500 leading-normal ${isExpanded ? "" : "line-clamp-1"}`}
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
                <div className="mt-1 pt-1 border-t border-slate-100 flex flex-col gap-0.5">
                  {n.actionTrigger && (
                    <div className="flex items-center gap-1">
                      <div className="w-1 h-1 rounded-full bg-slate-300" />
                      <span className="text-[8.5px] text-slate-400 font-normal capitalize">
                        Scope: {n.actionTrigger.toLowerCase().replace(/_/g, " ")}
                      </span>
                    </div>
                  )}

                  {n.context.actor && (
                    <div className="text-[8.5px] text-slate-400 bg-slate-50/80 p-1 rounded border border-slate-100">
                      By: <span className="text-slate-500">{n.context.actor.name}</span> {n.context.ip ? `(${n.context.ip})` : ""}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={handleMarkRead}
              className="text-[8.5px] font-normal text-blue-500 hover:font-medium hover:underline flex items-center gap-0.5 transition-colors"
            >
              <CheckCheck className="w-2.5 h-2.5" /> Read
            </button>
            <button
              onClick={handleToggleExpand}
              className="text-[8.5px] font-normal text-slate-400 hover:font-medium hover:text-slate-500 transition-colors"
            >
              {isExpanded ? "Less" : "Details"}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}