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
import "boxicons/css/boxicons.min.css";

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
    status?: string;
    actionType?: string;
    requesterName?: string;
    actor?: { name: string };
    ip?: string;
  } | null;
}

const TYPE_CONFIG: Record<string, { icon: string; bg: string }> = {
  SECURITY: { icon: "bx-shield-quarter", bg: "bg-red-500" },
  SYSTEM: { icon: "bx-cog", bg: "bg-slate-600" },
  APPROVAL: { icon: "bx-lock-open", bg: "bg-amber-500" },
  SUCCESS: { icon: "bx-check-circle", bg: "bg-emerald-500" },
  INFO: { icon: "bx-info-circle", bg: "bg-blue-500" },
  INVENTORY: { icon: "bx-package", bg: "bg-purple-500" },
};

/* ==========================================================================
   MAIN COMPONENT
   ========================================================================== */

export function NotificationsBell() {
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  const { data, mutate, isValidating } = useSWR<{ notifications: Notification[], unreadCount: number }>(
    session?.user?.id ? "/api/notifications?limit=20" : null,
    (url) => fetch(url).then((res) => res.json()),
    { revalidateOnFocus: false, revalidateOnReconnect: true }
  );

  /**
   * OPERATIONAL FILTER: 
   * The bell only displays items requiring immediate attention:
   * 1. Any notification that is unread.
   * 2. Any Approval request that is still 'PENDING' (even if read, it's an open task).
   */
  const activeNotifications = useMemo(() => {
    return (data?.notifications ?? []).filter(n => {
      const isPendingAction = n.context?.type === "APPROVAL" && n.context?.status === "PENDING";
      return !n.read || isPendingAction;
    });
  }, [data]);

  const unreadCount = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!session?.user?.id) return;
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`user-${session.user.id}`);
    
    const sync = () => mutate();
    channel.bind("new-alert", sync);
    channel.bind("notifications-read", sync);
    
    return () => { channel.unbind_all(); pusher.unsubscribe(`user-${session.user.id}`); };
  }, [session?.user?.id, mutate]);

  const handleMarkAllInformationalRead = async () => {
    const previousData = data;
    // Optimistic UI: Only mark items that are NOT pending approvals
    const optimistic = data?.notifications.map(n => 
      n.context?.type === "APPROVAL" ? n : { ...n, read: true }
    ) || [];

    mutate({ ...data!, notifications: optimistic, unreadCount: 0 }, false);

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }), // Server logic handles skipping actions if configured
      });
    } catch (err) {
      mutate(previousData, false);
    }
  };

return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button className="relative w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-all outline-none group">
          <i className={`bx bx-bell text-xl ${unreadCount > 0 ? "text-blue-600 animate-[bell-ring_2s_infinite]" : "text-slate-400 group-hover:text-slate-900"}`} />
          {unreadCount > 0 && (
            <span className="absolute top-2.5 right-2.5 flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500 border border-white" />
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          /* MOBILE FIX: 
             1. Changed w-[400px] to w-[calc(100vw-32px)] for mobile.
             2. Added md:w-[400px] to restore original desktop size.
             3. Added max-h-[85vh] to ensure it doesn't grow past the viewport on small phones.
          */
          className="w-[calc(100vw-32px)] md:w-[400px] max-h-[85vh] bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden z-[100] outline-none flex flex-col animate-in fade-in zoom-in-95 duration-200"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {/* Operational Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 text-slate-900">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-tight">Operational Buffer</h3>
              <p className="text-[10px] text-slate-500 font-medium italic">Unresolved Actions & Alerts</p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleMarkAllInformationalRead}
                className="text-[10px] font-bold text-blue-600 hover:underline uppercase"
              >
                Clear Logs
              </button>
              <button onClick={() => mutate()} className={isValidating ? "animate-spin" : ""}>
                <i className="bx bx-refresh text-lg text-slate-400" />
              </button>
            </div>
          </div>

          {/* Buffer List */}
          {/* MOBILE FIX: flex-1 ensures the list takes up available space between header/footer */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <AnimatePresence initial={false} mode="popLayout">
              {activeNotifications.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-16 flex flex-col items-center opacity-40">
                  <i className="bx bx-tray text-4xl mb-2" />
                  <p className="text-[11px] font-bold uppercase tracking-widest">Buffer Empty</p>
                </motion.div>
              ) : (
                activeNotifications.map((n) => (
                  <NotificationItem 
                    key={n.id} 
                    n={n} 
                    onResolved={() => mutate()} 
                    onNavigate={(path) => { setOpen(false); router.push(path); }}
                  />
                ))
              )}
            </AnimatePresence>
          </div>

          {/* Redirect to Persistent Feed */}
          <div className="p-3 bg-white border-t border-slate-100 mt-auto">
            <button
              onClick={() => { setOpen(false); router.push("/notifications"); }}
              className="w-full py-3 md:py-2.5 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-500 hover:bg-slate-50 active:bg-slate-100 transition-all flex items-center justify-center gap-2"
            >
              Access Full Activity Terminal <i className="bx bx-right-arrow-alt" />
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

function NotificationItem({ n, onResolved, onNavigate }: { n: Notification, onResolved: () => void, onNavigate: (p: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.INFO;

  const isApproval = n.context?.type === "APPROVAL";

  // Action: Mark Single as Read (Evicts from Bell)
  const handleMarkRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id, read: true })
      });
      onResolved(); 
    } catch (err) {
      console.error(err);
    }
  };

  // Action: Resolution Decision
  const handleDecision = async (e: React.MouseEvent, decision: "APPROVED" | "REJECTED") => {
    e.stopPropagation();
    setLoading(true);
    try {
      const res = await fetch(`/api/approvals/${n.context?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision })
      });
      if (!res.ok) throw new Error("Resolution failed");
      
      // Upon action, clear the notification associated with it
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id, read: true })
      });

      onResolved();
    } catch (err) {
      console.error(err);
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
      className={`group border-b border-slate-50 p-4 transition-colors hover:bg-slate-50/50 ${!n.read ? "bg-white" : "bg-slate-50/30"}`}
    >
      <div className="flex gap-4">
        <div className={`w-7 h-7 shrink-0 rounded-xl ${config.bg} flex items-center justify-center text-white shadow-sm`}>
          <i className={`bx ${config.icon} text-lg`} />
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
                  className="px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg hover:bg-black transition-all"
                >
                  {loading ? <i className="bx bx-loader-alt animate-spin" /> : "Authorize"}
                </button>
                <button
                  disabled={loading}
                  onClick={(e) => handleDecision(e, "REJECTED")}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-[10px] font-bold rounded-lg hover:bg-slate-50 transition-all"
                >
                  Decline
                </button>
              </div>
            ) : (
              <button 
                onClick={handleMarkRead}
                className="text-[10px] font-bold text-slate-400 hover:text-blue-600 flex items-center gap-1 uppercase tracking-tighter"
              >
                <i className="bx bx-check-double text-sm" /> Mark as Read
              </button>
            )}

            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-6 h-6 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors"
            >
              <i className={`bx bx-chevron-down text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
            </button>
          </div>

          {isExpanded && (
            <motion.div 
              initial={{ height: 0 }} animate={{ height: "auto" }}
              className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                <span className="text-[10px] text-slate-500 font-medium capitalize">
                  Scope: {n.actionTrigger?.toLowerCase().replace(/_/g, " ") || "system alert"}
                </span>
              </div>
              {n.context?.actor && (
                <div className="text-[10px] text-slate-500">
                  Originator: <span className="font-bold text-slate-700">{n.context.actor.name}</span> ({n.context.ip})
                </div>
              )}
              <button 
                onClick={() => onNavigate(isApproval ? `/approvals/${n.context?.id}` : `/notifications`)}
                className="text-[10px] font-bold text-blue-600 text-left hover:underline mt-1"
              >
                Inspect Full Audit Trace
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}