"use client";

import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import useSWRInfinite from "swr/infinite";
import { formatDistanceToNowStrict } from "date-fns";
import { NotificationType, CriticalAction, ApprovalStatus } from "@prisma/client";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { getPusherClient } from "@/core/lib/pusher";

/* ==========================================================================
   TYPES & CONFIG
   ========================================================================== */

interface ContextApproval {
  type: "APPROVAL";
  id: string; 
  actionType: CriticalAction;
  status: ApprovalStatus;
  requester: { id: string; name: string; role: string; email: string };
  approver: { id: string; name: string; role: string } | null;
}

interface ContextActivity {
  type: "ACTIVITY";
  id: string;
  action: string;
  critical: boolean;
  metadata: any;
  actor: { id: string; name: string };
  time: string;
  ip: string;
}

export interface InboxItem {
  id: string;
  recipientEntryId: string; // Maps to NotificationRecipient.id
  type: NotificationType;
  actionTrigger: CriticalAction | null;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  context: ContextApproval | ContextActivity | null;
}

// Config aligned with Prisma NotificationType Enum
const TYPE_CONFIG: Record<NotificationType, { icon: string; bg: string; color: string; label: string }> = {
  SECURITY: { icon: "bx-shield-quarter", bg: "bg-red-500", color: "text-red-600", label: "SECURITY" },
  SYSTEM: { icon: "bx-cog", bg: "bg-slate-600", color: "text-slate-600", label: "SYSTEM" },
  APPROVAL: { icon: "bx-lock-open", bg: "bg-amber-500", color: "text-amber-600", label: "AUTHORIZATION" },
  SUCCESS: { icon: "bx-check-circle", bg: "bg-emerald-500", color: "text-emerald-600", label: "SUCCESS" },
  WARNING: { icon: "bx-error", bg: "bg-orange-500", color: "text-orange-600", label: "WARNING" },
  INFO: { icon: "bx-info-circle", bg: "bg-blue-500", color: "text-blue-600", label: "INFO" },
  INVENTORY: { icon: "bx-package", bg: "bg-purple-500", color: "text-purple-600", label: "INVENTORY" },
  TRANSACTIONAL: { icon: "bx-receipt", bg: "bg-emerald-600", color: "text-emerald-700", label: "FINANCE" },
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/* ==========================================================================
   MAIN INBOX PAGE
   ========================================================================== */

export default function SystemInboxPage() {
  const { data: session } = useSession();
  const [filter, setFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const getKey = (pageIndex: number, previousPageData: any) => {
    if (!session?.user?.id) return null;
    if (previousPageData && !previousPageData.notifications?.length) return null;
    
    let url = `/api/notifications?limit=20`;
    
    // Distinguish between Status (Unread) and Type (Security/Inventory etc)
    if (filter === "UNREAD") {
      url += `&read=false`;
    } else if (filter !== "ALL") {
      url += `&type=${filter}`;
    }

    if (debouncedQuery) url += `&search=${encodeURIComponent(debouncedQuery)}`;
    if (pageIndex !== 0 && previousPageData.pagination?.nextCursor) {
      url += `&cursor=${previousPageData.pagination.nextCursor}`;
    }
    return url;
  };

  const { data, size, setSize, mutate, isValidating } = useSWRInfinite(getKey, fetcher, { revalidateOnFocus: false });

  const items: InboxItem[] = useMemo(() => 
    data ? data.flatMap((page) => page.notifications || []) : [], 
  [data]);

  const unreadCount = data?.[0]?.unreadCount ?? 0;
  const isLoading = isValidating && (!data || size === 0);
  const hasMore = data && data[data.length - 1]?.pagination?.nextCursor !== null;

  // Real-time synchronization
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

  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications', { 
        method: 'PATCH', headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAll: true })
      });
      mutate();
    } catch (e) { console.error("Bulk sync failed"); }
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!hasMore || isLoading) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) setSize(size + 1);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [setSize, size, hasMore, isLoading]);

  return (
    <div className="flex flex-col h-full w-full bg-[#FAFAFC] relative z-0 overflow-hidden font-sans">
      <header className="w-full flex flex-col bg-white border-b border-black/[0.04]">
        <div className="sticky top-0 z-[120] bg-white flex items-center justify-between gap-4 px-4 py-3 min-w-0">
          <div className="min-w-0 flex-1 md:flex-none">
            <h1 className="truncate text-[18px] font-semibold text-slate-900 flex items-center gap-2">
              System Inbox
              {unreadCount > 0 && (
                <span className="flex items-center justify-center bg-blue-600 text-white text-[9px] font-black h-4 px-1.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </h1>
          </div>

          <div className="hidden md:flex flex-1 justify-center px-4 overflow-hidden">
             <InboxFilters 
                current={filter} 
                setFilter={setFilter} 
             />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:relative sm:block">
              <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search logs..."
                className="bg-slate-100 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-32 md:w-48 lg:w-64 rounded-lg focus:ring-1 focus:ring-black transition-all outline-none"
              />
            </div>

            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="hidden md:flex p-2 text-[11px] font-bold border rounded-lg transition-colors items-center justify-center bg-slate-900 text-white hover:bg-slate-800 shadow-sm shrink-0 uppercase tracking-wide"
              >
                Clear Unread
              </button>
            )}

            <button
              onClick={() => { setSize(1); mutate(); }}
              className="p-2 text-[12px] font-semibold border rounded-lg transition-colors flex items-center justify-center bg-white border-black/5 text-slate-500 hover:bg-slate-50 shadow-sm shrink-0"
            >
              <i className={`bx bx-refresh text-lg md:text-sm ${isValidating ? "bx-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="md:hidden sticky top-[53px] z-[115] bg-white/95 px-4 py-3 border-t border-black/[0.02]">
           <InboxFilters 
              current={filter} 
              setFilter={setFilter} 
           />
        </div>
      </header>

      <div 
        ref={containerRef}
        className="flex-1 w-full overflow-y-auto bg-white max-w-7xl mx-auto border-x border-black/[0.02]"
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32">
             <i className="bx bx-loader-alt bx-spin text-3xl text-slate-300 mb-4" />
             <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-slate-400">Syncing Ledgers</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40">
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em]">
              {filter} Logs Empty
            </span>
          </div>
        ) : (
          <div className="flex flex-col">
            {items.map((item) => (
              <InboxRow key={item.recipientEntryId} item={item} onMutate={() => mutate()} />
            ))}
          </div>
        )}
        
        {isValidating && !isLoading && (
          <div className="py-8 flex justify-center">
            <i className="bx bx-loader-alt bx-spin text-xl text-slate-300" />
          </div>
        )}
      </div>
    </div>
  );
}

function InboxFilters({ current, setFilter }: { current: string, setFilter: (f: string) => void }) {
  // Tabs mapped to NotificationType Enum + "ALL" and "UNREAD" status
  const tabs = [
    { key: "ALL", label: "ALL" },
    { key: "UNREAD", label: "UNREAD" },
    { key: "SECURITY", label: "SECURITY" },
    { key: "APPROVAL", label: "APPROVALS" },
    { key: "INVENTORY", label: "INVENTORY" },
    { key: "TRANSACTIONAL", label: "FINANCE" },
  ];

  return (
    <div className="flex items-center gap-2 sm:gap-4 md:gap-6 overflow-x-auto whitespace-nowrap scrollbar-hide px-2">
      {tabs.map((t, idx) => {
        const isActive = current === t.key;
        return (
          <React.Fragment key={t.key}>
            {idx > 0 && <div className="w-px h-3 bg-black/10 self-center shrink-0" />}
            <button
              onClick={() => setFilter(t.key)}
              className={`group flex items-center gap-2 transition-all shrink-0 relative border-b-2 min-h-[30px] ${
                isActive ? "text-blue-600 border-blue-600" : "text-slate-400 border-transparent hover:text-slate-600"
              }`}
            >
              <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest">
                {t.label}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function InboxRow({ item, onMutate }: { item: InboxItem; onMutate: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isProcessing, setIsProcessing] = useState<"APPROVED" | "REJECTED" | null>(null);

  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.INFO;
  const isPendingApproval = item.context?.type === "APPROVAL" && item.context.status === "PENDING";

  const markAsRead = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (item.read) return;
    try {
      await fetch(`/api/notifications`, { 
        method: 'PATCH', 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ id: item.recipientEntryId, read: true }) // Uses the entry ID from NotificationRecipient
      });
      onMutate();
    } catch (e) { console.error("Sync error"); }
  };

  const handleApproval = async (e: React.MouseEvent, decision: "APPROVED" | "REJECTED") => {
    e.stopPropagation();
    if (item.context?.type !== "APPROVAL") return;
    setIsProcessing(decision);
    try {
      const res = await fetch(`/api/approvals/${item.context.id}`, { 
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision })
      });
      if (!res.ok) throw new Error("Action failed");
      await markAsRead();
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(null);
      onMutate();
    }
  };

  return (
    <div 
      className={`relative group flex flex-col border-b border-black/[0.04] transition-colors ${
        !item.read ? "bg-blue-50/20" : "bg-white hover:bg-slate-50/50"
      }`}
    >
      {!item.read && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-600" />}

      <div 
        onClick={() => { setIsExpanded(!isExpanded); markAsRead(); }}
        className="flex flex-col md:flex-row md:items-start p-4 md:py-5 pl-5 md:pl-6 cursor-pointer gap-4"
      >
        <div className="flex items-center md:flex-col gap-4 md:gap-1.5 shrink-0 md:w-28">
          <div className={`w-8 h-8 rounded-md flex items-center justify-center ${config.bg} text-white border border-black/[0.03]`}>
            <i className={`bx ${config.icon} text-lg`} />
          </div>
          <span className="text-[10px] font-mono font-bold text-slate-400">
            {formatDistanceToNowStrict(new Date(item.createdAt))}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border tracking-widest ${config.color} bg-white border-black/[0.05]`}>
              {config.label}
            </span>
            <h3 className={`text-[12px] uppercase tracking-tight truncate ${!item.read ? "font-black text-slate-900" : "font-bold text-slate-700"}`}>
              {item.title}
            </h3>
          </div>
          <p className={`text-[12px] leading-snug md:pr-12 ${!item.read ? "text-slate-700 font-medium" : "text-slate-500"} ${isExpanded ? "" : "line-clamp-2 md:line-clamp-1"}`}>
            {item.message}
          </p>

          {item.context?.type === "APPROVAL" && !isExpanded && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
               <i className="bx bx-user" /> 
               <span className="font-bold text-slate-700">{item.context.requester.name}</span>
               <span className="font-mono text-slate-400 border-l border-slate-200 pl-2 ml-1">
                 {item.context.actionType.replace(/_/g, " ")}
               </span>
            </div>
          )}
        </div>

        <div className="hidden md:flex items-center gap-2 shrink-0 min-w-[140px] justify-end">
          {isPendingApproval ? (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <button 
                disabled={isProcessing !== null}
                onClick={(e) => handleApproval(e, "REJECTED")}
                className="w-8 h-8 flex items-center justify-center rounded border border-black/10 text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors disabled:opacity-50"
              >
                {isProcessing === "REJECTED" ? <i className="bx bx-loader-alt bx-spin" /> : <i className="bx bx-x text-lg" />}
              </button>
              <button 
                disabled={isProcessing !== null}
                onClick={(e) => handleApproval(e, "APPROVED")}
                className="h-8 px-3 flex items-center justify-center gap-1.5 rounded bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wide hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {isProcessing === "APPROVED" ? <i className="bx bx-loader-alt bx-spin text-sm" /> : "Approve"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
               <span className="text-[10px] font-mono text-slate-300">
                 #{item.id.slice(-8).toUpperCase()}
               </span>
               <i className={`bx ${isExpanded ? "bx-chevron-up" : "bx-chevron-down"} text-slate-300 text-lg`} />
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-slate-50/50 border-t border-black/[0.03]"
          >
            <div className="p-4 md:p-6 md:pl-[140px] space-y-6">
              {item.context?.type === "APPROVAL" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="bg-white p-4 rounded border border-slate-200">
                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Requester_Details</p>
                     <p className="text-[12px] font-bold text-slate-900">{item.context.requester.name}</p>
                     <p className="text-[10px] font-mono text-slate-500 mt-1">{item.context.requester.role}</p>
                   </div>
                   <div className="bg-white p-4 rounded border border-slate-200">
                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Target_Action</p>
                     <p className="text-[12px] font-bold text-slate-900">{item.context.actionType}</p>
                     <p className="text-[10px] font-mono text-slate-500 mt-1">Status: <span className={isPendingApproval ? "text-amber-600 font-bold" : "text-slate-900"}>{item.context.status}</span></p>
                   </div>
                </div>
              )}

              {item.context?.type === "ACTIVITY" && item.context.metadata && (
                <div className="bg-slate-900 p-4 rounded border border-black/[0.05]">
                  <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <i className="bx bx-code-alt text-sm" /> Raw_Telemetry_Context
                  </h4>
                  <pre className="text-[10px] font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {JSON.stringify(item.context.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}