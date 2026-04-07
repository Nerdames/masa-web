"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import useSWRInfinite from "swr/infinite";
import { formatDistanceToNowStrict } from "date-fns";
import { NotificationType, CriticalAction } from "@prisma/client";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getPusherClient } from "@/core/lib/pusher";
import "boxicons/css/boxicons.min.css";

/* ==========================================================================\
   TYPES & CONFIG
   ========================================================================== */

interface Notification {
  id: string; // The notificationId for the DB join table
  recipientEntryId?: string;
  type: NotificationType;
  actionTrigger: CriticalAction | null;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  approvalId?: string; 
  entityId?: string;
  context: {
    type?: "APPROVAL" | "ACTIVITY";
    id?: string;
    status?: string;
    actionType?: string;
    critical?: boolean;
    metadata?: any;
    personnel?: { name: string };
    requester?: { name: string };
  } | null;
}

const TYPE_CONFIG: Record<NotificationType, { icon: string; bg: string; label: string }> = {
  SECURITY: { icon: "bx-shield-quarter", bg: "bg-red-600", label: "SECURITY" },
  SYSTEM: { icon: "bx-cog", bg: "bg-slate-900", label: "SYSTEM" },
  APPROVAL: { icon: "bx-lock-open", bg: "bg-amber-500", label: "AUTH_REQ" },
  APPROVAL_DECISION: { icon: "bx-git-commit", bg: "bg-indigo-600", label: "DECISION" },
  SUCCESS: { icon: "bx-check-circle", bg: "bg-emerald-600", label: "SUCCESS" },
  WARNING: { icon: "bx-error", bg: "bg-orange-500", label: "WARNING" },
  INFO: { icon: "bx-info-circle", bg: "bg-blue-600", label: "INFO" },
  INVENTORY: { icon: "bx-package", bg: "bg-purple-600", label: "STOCK" },
  TRANSACTIONAL: { icon: "bx-receipt", bg: "bg-emerald-700", label: "FINANCE" },
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const getInitials = (name?: string) => {
  if (!name) return "SYS";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
};

/* ==========================================================================\
   MAIN PAGE COMPONENT
   ========================================================================== */

export default function NotificationsPage() {
  const { data: session } = useSession();
  const [filter, setFilter] = useState<"ALL" | "UNREAD" | "APPROVAL">("ALL");
  const [isBulkClearing, setIsBulkClearing] = useState(false);

  const getKey = (pageIndex: number, previousPageData: any) => {
    if (!session?.user?.id) return null; // Wait for auth
    if (previousPageData && !previousPageData.notifications?.length) return null;
    
    let url = `/api/notifications?limit=15&filter=${filter}`;
    if (pageIndex !== 0 && previousPageData.pagination?.nextCursor) {
      url += `&cursor=${previousPageData.pagination.nextCursor}`;
    }
    return url;
  };

  const { data, size, setSize, mutate, isValidating } = useSWRInfinite(getKey, fetcher, {
    revalidateOnFocus: false,
  });

  const notifications = useMemo(() => 
    data ? data.flatMap((page) => page.notifications || []) : [], 
  [data]);

  const unreadCount = data?.[0]?.unreadCount ?? notifications.filter(n => !n.read).length;
  const isLoadingInitialData = !data && !isValidating;

  // Real-time listener aligned with the backend
  useEffect(() => {
    if (!session?.user?.id) return;
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`user-${session.user.id}`);
    
    const sync = () => mutate();
    channel.bind("new-alert", sync);
    channel.bind("notifications-read", sync);
    channel.bind("approval-resolved", sync);
    
    return () => { 
      channel.unbind_all();
      pusher.unsubscribe(`user-${session.user.id}`); 
    };
  }, [session?.user?.id, mutate]);

  // Optimistic 2D Array Update for Infinite SWR
  const markAllAsRead = async () => {
    setIsBulkClearing(true);
    const previousData = data;
    
    // Optimistically update all loaded pages
    const optimisticData = data?.map((page, index) => ({
      ...page,
      unreadCount: index === 0 ? 0 : page.unreadCount,
      notifications: page.notifications.map((n: Notification) => ({ ...n, read: true }))
    }));
    
    mutate(optimisticData, false);

    try {
      const res = await fetch('/api/notifications', { 
        method: 'PATCH',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true })
      });
      if (!res.ok) throw new Error("Bulk sync failed");
    } catch (e) {
      mutate(previousData, false); // Rollback
    } finally {
      setIsBulkClearing(false);
      mutate(); // Final sync
    }
  };

  // Optimistic Single Item Update
  const markAsRead = useCallback(async (id: string) => {
    const previousData = data;
    const optimisticData = data?.map((page, index) => ({
      ...page,
      unreadCount: index === 0 ? Math.max(0, (page.unreadCount || 0) - 1) : page.unreadCount,
      notifications: page.notifications.map((n: Notification) => n.id === id ? { ...n, read: true } : n)
    }));
    
    mutate(optimisticData, false);

    try {
      const res = await fetch('/api/notifications', { 
        method: 'PATCH',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, read: true })
      });
      if (!res.ok) throw new Error("Read sync failed");
    } catch (e) {
      mutate(previousData, false); // Rollback
    }
  }, [data, mutate]);

  return (
    <div className="min-h-screen bg-[#FAFAFC] dark:bg-[#09090b] text-slate-900 dark:text-slate-100 pb-20 font-sans selection:bg-blue-100 dark:selection:bg-blue-500/30">
      {/* RESPONSIVE STICKY HEADER */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-md border-b border-black/[0.05] dark:border-white/5 px-4 sm:px-6 py-4 sm:py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                Notifications
                {unreadCount > 0 && (
                  <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                )}
              </h1>
            </div>
            
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button 
                  onClick={markAllAsRead}
                  disabled={isBulkClearing}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white text-[8px] font-black uppercase tracking-widest rounded-lg transition-all border border-blue-100 active:scale-95 disabled:opacity-50"
                >
                  {isBulkClearing ? "Clearing..." : "Clear_All"}
                </button>
              )}
              <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl overflow-x-auto no-scrollbar border border-black/5 dark:border-white/5">
                {(["ALL", "UNREAD", "APPROVAL"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilter(t)}
                    className={`px-3 py-1.5 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all whitespace-nowrap ${
                      filter === t 
                        ? "bg-white dark:bg-[#18181b] shadow-sm text-blue-600" 
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* FEED CONTENT */}
      <main className="max-w-2xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        {isLoadingInitialData ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 w-full bg-slate-200/50 dark:bg-white/5 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-3 opacity-40">
             <i className="bx bx-radar text-5xl mb-2" />
             <p className="text-[10px] font-black uppercase tracking-[0.3em]">Buffer_Empty // No_Logs</p>
          </div>
        ) : (
          <LayoutGroup>
            <motion.div layout className="space-y-3 sm:space-y-4">
              <AnimatePresence mode="popLayout">
                {notifications.map((n: Notification) => (
                  <NotificationCard 
                    key={n.id} 
                    notification={n} 
                    onMarkRead={() => markAsRead(n.id)}
                    onRefresh={() => mutate()} 
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          </LayoutGroup>
        )}
        
        {data && data[data.length - 1]?.pagination?.nextCursor && (
          <button 
            onClick={() => setSize(size + 1)}
            disabled={isValidating}
            className="w-full mt-10 py-4 text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 hover:text-slate-900 transition-all disabled:opacity-30"
          >
            {isValidating ? "Fetching_Records..." : "Load_Earlier_Logs"}
          </button>
        )}
      </main>
    </div>
  );
}

/* ==========================================================================\
   SUB-COMPONENT: NOTIFICATION CARD
   ========================================================================== */

function NotificationCard({ 
  notification: n, 
  onMarkRead,
  onRefresh 
}: { 
  notification: Notification;
  onMarkRead: () => void;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isProcessing, setIsProcessing] = useState<"APPROVED" | "REJECTED" | null>(null);

  const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.INFO;
  const performer = n.context?.personnel?.name || n.context?.requester?.name || "System";
  const isCritical = /SECURITY|WARNING|REJECTED|DELETE/.test(n.type) || n.context?.critical;

  const handleExplore = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMarkRead(); // Auto-read on explore
    
    // Intelligent Routing Context
    if (n.type === "APPROVAL" && (n.context?.id || n.approvalId)) {
      router.push(`/dashboard/approvals/${n.context?.id || n.approvalId}`);
    } else if (n.entityId) {
      router.push(`/dashboard/context/${n.entityId}`);
    } else {
      router.push(`/notifications/${n.id}`);
    }
  };

  const handleDecision = async (e: React.MouseEvent, decision: "APPROVED" | "REJECTED") => {
    e.stopPropagation();
    setIsProcessing(decision);
    try {
      const approvalId = n.context?.id || n.approvalId;
      const res = await fetch(`/api/approvals/${approvalId}`, { 
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision })
      });
      if (!res.ok) throw new Error("Action failed");
      
      onMarkRead(); // Clear from UI automatically if successful
      onRefresh(); // Sync data to reflect decision in logs
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(null);
    }
  };

  // REFINED MUTE LOGIC
  const styles = n.read 
    ? {
        card: "bg-[#fcfcfe]/80 border-black/[0.02] dark:bg-white/[0.02] dark:border-white/[0.02]",
        avatar: "bg-slate-300 dark:bg-slate-700 opacity-70",
        badge: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-slate-500 dark:border-white/5",
        text: "text-slate-400 dark:text-slate-500",
        title: "text-slate-500 font-bold dark:text-slate-400",
        indicator: "hidden"
      }
    : {
        card: "bg-white dark:bg-[#121214] border-black/[0.04] dark:border-white/[0.04] shadow-sm hover:shadow-md",
        avatar: isCritical ? "bg-red-600" : config.bg,
        badge: isCritical 
          ? "bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:border-red-500/20" 
          : "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/10 dark:border-blue-500/20",
        text: "text-slate-600 dark:text-slate-400",
        title: "text-slate-900 dark:text-white font-black",
        indicator: "block"
      };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`relative group transition-all duration-300 cursor-pointer overflow-hidden rounded-xl sm:rounded-2xl border ${styles.card}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="p-3 sm:p-4">
        {/* HEADER AREA */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm transition-transform group-hover:scale-105 ${styles.avatar}`}>
            {getInitials(performer)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start">
              <span className={`text-[11px] uppercase tracking-tight truncate ${n.read ? 'font-bold' : 'font-black'}`}>
                {performer}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-slate-400 uppercase font-mono shrink-0 ml-2">
                  {formatDistanceToNowStrict(new Date(n.createdAt))}
                </span>
                {/* NEW ADDITION: Individual "Mark as Read" Check Button */}
                {!n.read && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkRead();
                    }}
                    className="text-slate-300 hover:text-blue-500 dark:text-slate-600 dark:hover:text-blue-400 transition-colors focus:outline-none"
                    aria-label="Mark as read"
                    title="Mark as read"
                  >
                    <i className="bx bx-check-circle text-[15px]" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex mt-0.5">
              <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded border tracking-wider transition-colors ${styles.badge}`}>
                {config.label} • {n.actionTrigger?.replace(/_/g, " ") || "LOG_EVENT"}
              </span>
            </div>
          </div>
        </div>

        {/* BODY AREA */}
        <div className="pl-11 pr-1 space-y-1">
          <h3 className={`text-[12px] sm:text-[13px] leading-tight transition-colors ${styles.title}`}>
            {n.title}
          </h3>
          <p className={`text-[11px] sm:text-[12px] leading-snug transition-colors ${styles.text} ${isExpanded ? "" : "line-clamp-1"}`}>
            {n.message}
          </p>

          {/* INLINE APPROVAL ACTIONS (Visible on main card body for unread requests) */}
          {n.type === "APPROVAL" && !n.read && (n.context?.id || n.approvalId) && (
            <div className="flex gap-2 pt-2 pb-1" onClick={(e) => e.stopPropagation()}>
              <button 
                disabled={isProcessing !== null}
                onClick={(e) => handleDecision(e, "APPROVED")}
                className="px-4 py-1.5 bg-blue-600 text-white text-[9px] font-black uppercase tracking-tighter rounded-lg hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/20 transition-all disabled:opacity-50 min-w-[80px]"
              >
                {isProcessing === "APPROVED" ? <i className="bx bx-loader-alt animate-spin text-[11px]" /> : "Approve"}
              </button>
              <button 
                disabled={isProcessing !== null}
                onClick={(e) => handleDecision(e, "REJECTED")}
                className="px-4 py-1.5 bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/10 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-tighter rounded-lg hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-all disabled:opacity-50 min-w-[80px]"
              >
                {isProcessing === "REJECTED" ? <i className="bx bx-loader-alt animate-spin text-[11px]" /> : "Reject"}
              </button>
            </div>
          )}
        </div>

        {/* EXPANDED SECTION */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="pl-11 mt-4 pt-4 border-t border-black/[0.03] dark:border-white/5 space-y-4"
            >
              {n.context?.metadata && (
                <div className="space-y-2">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <i className="bx bx-code-alt" /> Payload_Inspect
                  </p>
                  <div className="p-3 bg-slate-950 rounded-xl border border-white/5 overflow-hidden">
                    <pre className="text-[9px] font-mono text-emerald-400/90 leading-tight overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(n.context.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-4 pt-1">
                <button 
                  onClick={handleExplore}
                  className="text-[8px] font-black text-slate-400 hover:text-slate-900 dark:hover:text-white uppercase tracking-widest transition-colors flex items-center gap-1"
                >
                  Explore_Logs <i className="bx bx-right-arrow-alt text-[10px]" />
                </button>
                {!n.read && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onMarkRead(); }}
                    className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-black rounded-lg text-[9px] font-black uppercase tracking-tighter hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-black/5"
                  >
                    Sync_Read
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* STATUS INDICATOR BAR */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-blue-600 transition-opacity ${styles.indicator}`} />
    </motion.div>
  );
}