"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
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
  LockOpen,
  CheckCircle,
  Info,
  Package,
  RefreshCw,
  Inbox,
  Loader2,
  CheckCheck,
  ChevronDown,
  ArrowRight,
  LucideIcon,
  Receipt
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
  type: NotificationType;
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

// Aligned strictly with the updated Prisma NotificationType Enum
const TYPE_CONFIG: Record<string, { icon: LucideIcon; bg: string }> = {
  SECURITY: { icon: ShieldAlert, bg: "bg-red-500" },
  SYSTEM: { icon: Settings, bg: "bg-slate-600" },
  APPROVAL: { icon: LockOpen, bg: "bg-amber-500" },
  SUCCESS: { icon: CheckCircle, bg: "bg-emerald-500" },
  INFO: { icon: Info, bg: "bg-blue-500" },
  INVENTORY: { icon: Package, bg: "bg-purple-500" },
  TRANSACTIONAL: { icon: Receipt, bg: "bg-indigo-500" },
};

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
   * Fixed: Relies strictly on the `read` flag to allow dismissal of stale snapshots.
   */
  const activeNotifications = useMemo(() => {
    return (data?.notifications ?? []).filter((n) => !n.read);
  }, [data]);

  const unreadCount = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!session?.user?.id || !session?.user?.organizationId) return;
    const pusher = getPusherClient();
    
    // User-specific channel for targeted alerts
    const userChannel = pusher.subscribe(`user-${session.user.id}`);
    // Org-wide channel for shared task resolutions (e.g., another admin approves a request)
    const orgChannel = pusher.subscribe(`org-${session.user.organizationId}`);

    const sync = () => mutate();
    
    userChannel.bind("new-alert", sync);
    userChannel.bind("notifications-read", sync);
    orgChannel.bind("approval-resolved", sync); // Prevents stale "ringing" across clients

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
    
    // Optimistic UI: Immediately clear all from the bell visually
    mutate({ ...data, notifications: [], unreadCount: 0 }, false);

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      mutate(); // Sync true state
    } catch (err) {
      mutate(previousData, false); // Revert on failure
    }
  };

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors outline-none group">
          <Bell
            className={`w-5 h-5 transition-colors ${
              unreadCount > 0 ? "text-blue-600 animate-[bell-ring_2s_infinite]" : "text-slate-400 group-hover:text-slate-900"
            }`}
          />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2.5 flex h-2.5 w-2.5">
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border-2 border-white" />
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="w-[calc(100vw-24px)] sm:w-[420px] max-h-[85vh] sm:max-h-[80vh] bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden z-[100] outline-none flex flex-col animate-in fade-in zoom-in-95 duration-200"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {/* Operational Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 text-slate-900 shrink-0">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-tight">Operational Buffer</h3>
              <p className="text-[10px] text-slate-500 font-medium italic">Unresolved Actions & Alerts</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleMarkAllInformationalRead}
                className="text-[10px] font-bold text-blue-600 hover:underline uppercase transition-all"
              >
                Clear Logs
              </button>
              <button onClick={() => mutate()} disabled={isValidating} className="text-slate-400 hover:text-slate-700 transition-colors">
                <RefreshCw className={`w-4 h-4 ${isValidating ? "animate-spin text-blue-500" : ""}`} />
              </button>
            </div>
          </div>

          {/* Buffer List */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <AnimatePresence initial={false} mode="popLayout">
              {activeNotifications.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-16 flex flex-col items-center opacity-40">
                  <Inbox className="w-10 h-10 mb-3 text-slate-400" />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Buffer Empty</p>
                </motion.div>
              ) : (
                activeNotifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    n={n}
                    onResolved={() => mutate()}
                    onNavigate={(path) => {
                      setOpen(false);
                      router.push(path);
                    }}
                  />
                ))
              )}
            </AnimatePresence>
          </div>

          {/* Redirect to Persistent Feed */}
          <div className="p-3 bg-white border-t border-slate-100 shrink-0">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/notifications");
              }}
              className="w-full py-3 sm:py-2.5 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 transition-all flex items-center justify-center gap-2 group"
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
   ITEM COMPONENT (ACCORDION & OPERATIONAL ACTIONS)
   ========================================================================== */

function NotificationItem({
  n,
  onResolved,
  onNavigate,
}: {
  n: Notification;
  onResolved: () => void;
  onNavigate: (p: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.INFO;
  const IconComponent = config.icon;
  const isApproval = n.context?.type === "APPROVAL";

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

  const handleDecision = async (e: React.MouseEvent, status: "APPROVED" | "REJECTED") => {
    e.stopPropagation();
    setLoading(true);
    try {
      // 1. Execute the business logic decision
      const res = await fetch(`/api/approvals/${n.context?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }), 
      });
      
      if (!res.ok) throw new Error("Resolution failed");

      // 2. Mark the local notification as read to instantly clear it from the buffer
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id, read: true }),
      });

      onResolved();
    } catch (err) {
      console.error("[NotificationItem] Decision failure", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className={`group border-b border-slate-50 p-4 transition-colors hover:bg-slate-50/80 ${
        !n.read ? "bg-white" : "bg-slate-50/40"
      }`}
    >
      <div className="flex gap-4">
        <div className={`w-8 h-8 shrink-0 rounded-xl ${config.bg} flex items-center justify-center text-white shadow-sm`}>
          <IconComponent className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-0.5">
            <span className="text-[12px] font-bold text-slate-900 truncate pr-2">{n.title}</span>
            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
              {formatDistanceToNowStrict(new Date(n.createdAt))}
            </span>
          </div>

          <p className={`text-[12px] text-slate-600 leading-snug ${isExpanded ? "" : "line-clamp-2"}`}>
            {n.message}
          </p>

          <div className="mt-3 flex items-center justify-between">
            {isApproval ? (
              <div className="flex gap-2">
                <button
                  disabled={loading}
                  onClick={(e) => handleDecision(e, "APPROVED")}
                  className="px-3.5 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg hover:bg-slate-800 transition-all flex items-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Authorize"}
                </button>
                <button
                  disabled={loading}
                  onClick={(e) => handleDecision(e, "REJECTED")}
                  className="px-3.5 py-1.5 bg-white border border-slate-200 text-slate-600 text-[10px] font-bold rounded-lg hover:bg-slate-50 hover:text-red-600 hover:border-red-200 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  Decline
                </button>
              </div>
            ) : (
              <button
                onClick={handleMarkRead}
                className="text-[10px] font-bold text-slate-400 hover:text-blue-600 flex items-center gap-1 uppercase tracking-tighter transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark as Read
              </button>
            )}

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-7 h-7 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors"
              aria-label="Toggle details"
            >
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                  isExpanded ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    <span className="text-[10px] text-slate-500 font-medium capitalize">
                      Scope: {n.actionTrigger?.toLowerCase().replace(/_/g, " ") || "system alert"}
                    </span>
                  </div>
                  
                  {n.context?.actor && (
                    <div className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded-md border border-slate-100">
                      Originator: <span className="font-bold text-slate-700">{n.context.actor.name}</span> ({n.context.ip})
                    </div>
                  )}
                  
                  <button
                    onClick={() => onNavigate(isApproval ? `/approvals/${n.context?.id}` : `/notifications`)}
                    className="text-[10px] font-bold text-blue-600 text-left hover:text-blue-700 hover:underline mt-1 w-fit"
                  >
                    Inspect Full Audit Trace
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}