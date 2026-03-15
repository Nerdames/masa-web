"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { useAlerts } from "@/components/feedback/AlertProvider";

/* ================= TYPES ================= */

type NotificationType =
  | "INFO"
  | "WARNING"
  | "ERROR"
  | "SYSTEM"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_DECISION";

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

interface ActivityLog {
  id: string;
  action: string;
  critical: boolean;
  createdAt: string;
  time?: string;
  personnel?: {
    id?: string;
    name?: string;
  };
  metadata?: Record<string, any>;
}

interface ApprovalData {
  id: string;
  status: ApprovalStatus;
  actionType: string;
  changes?: Record<string, { old: any; new: any }>;
  requester: {
    id?: string;
    name: string;
    role: string;
    email: string;
  };
  approver?: {
    id?: string;
    name?: string;
    role?: string;
  };
  createdAt?: string;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;

  approval?: ApprovalData | null;

  logs: ActivityLog[];

  context?: {
    ip?: string;
    device?: string;
  };
}

/* ================= FETCHER ================= */

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

/* ================= MAIN COMPONENT ================= */

export default function IntelligenceHub() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { dispatch } = useAlerts();

  const [filter, setFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("selected")
  );

  const { data, error, mutate, isLoading } = useSWR("/api/notifications", fetcher);

  const notifications: NotificationItem[] = data?.notifications ?? [];

  const selectedNotification = useMemo(
    () => notifications.find((n) => n.id === selectedId),
    [notifications, selectedId]
  );

  /* ================= URL SYNC ================= */

  useEffect(() => {
    const urlId = searchParams.get("selected");
    if (urlId !== selectedId) setSelectedId(urlId);
  }, [searchParams]);

  /* ================= FILTERING ================= */

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === "UNREAD") return !n.read;
      if (filter === "APPROVALS") return !!n.approval;
      return true;
    });
  }, [notifications, filter]);

  /* ================= SELECT ================= */

  const handleSelect = async (n: NotificationItem) => {
    setSelectedId(n.id);
    router.replace(`?selected=${n.id}`, { scroll: false });

    if (!n.read) {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id, read: true }),
      });
      mutate();
    }
  };

  /* ================= RENDER ================= */

  if (error)
    return (
      <div className="flex h-screen items-center justify-center text-red-500">
        Failed to load notifications
      </div>
    );

  return (
    <div className="flex h-screen bg-[#F2F2F7] overflow-hidden text-[#1d1d1f]">
      <main className="flex-1 flex flex-col min-w-0 bg-white relative">
        {/* HEADER */}
        <header className="px-8 py-6 flex flex-col sm:flex-row sm:items-center justify-between sticky top-0 bg-white/90 backdrop-blur-xl z-10 border-b border-black/5 gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Intelligence Hub</h1>
            <p className="text-[11px] font-medium text-black/40 uppercase tracking-widest mt-1">
              Audit & Authorization logs
            </p>
          </div>

          <div className="flex gap-2 bg-[#F2F2F7] p-1 rounded-2xl">
            {["ALL", "UNREAD", "APPROVALS"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-xl text-[10px] font-black tracking-widest transition-all ${
                  filter === f
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-black/40"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </header>

        {/* LIST */}
        <div className="flex-1 overflow-y-auto px-8 pt-6 pb-20 bg-[#FAFAFC]">
          <div className="max-w-4xl mx-auto flex flex-col gap-3">
            {isLoading && (
              <div className="text-center text-sm text-black/40 py-20">
                Loading intelligence feed...
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {filteredNotifications.map((n) => (
                <NotificationCard
                  key={n.id}
                  notification={n}
                  isSelected={selectedId === n.id}
                  onClick={() => handleSelect(n)}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* INSPECTOR */}
      <aside className="hidden lg:flex w-[420px] h-full bg-white border-l border-black/5 flex-col shadow-[-10px_0_20px_rgba(0,0,0,0.02)] z-20 shrink-0">
        <AnimatePresence mode="wait">
          {selectedNotification ? (
            <InspectorPanel
              key={selectedNotification.id}
              notification={selectedNotification}
              onClose={() => {
                setSelectedId(null);
                router.replace(`/dashboard/notifications`, { scroll: false });
              }}
              onRefresh={() => mutate()}
              dispatch={dispatch}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-30">
              <i className="bx bx-radar text-5xl mb-4" />
              <h3 className="text-sm font-bold">Awaiting Selection</h3>
              <p className="text-xs mt-1">Select an audit log to inspect metadata.</p>
            </div>
          )}
        </AnimatePresence>
      </aside>
    </div>
  );
}

/* ================= NOTIFICATION CARD ================= */

function NotificationCard({
  notification: n,
  isSelected,
  onClick,
}: {
  notification: NotificationItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const typeStyles: Record<NotificationType, string> = {
    INFO: "bg-blue-50 text-blue-600 border-blue-100",
    WARNING: "bg-amber-50 text-amber-600 border-amber-100",
    ERROR: "bg-red-50 text-red-600 border-red-100",
    SYSTEM: "bg-slate-50 text-slate-600 border-slate-100",
    APPROVAL_REQUIRED: "bg-purple-50 text-purple-600 border-purple-100",
    APPROVAL_DECISION: "bg-emerald-50 text-emerald-600 border-emerald-100",
  };

  return (
    <motion.div
      layoutId={`notif-${n.id}`}
      onClick={onClick}
      className={`group p-5 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-5 ${
        isSelected
          ? "border-blue-500 bg-blue-50/30 shadow-lg"
          : "bg-white border-black/[0.03] hover:border-blue-500/20"
      }`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${typeStyles[n.type]}`}>
        <i className={`bx ${getIcon(n.type)} text-xl`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-bold text-sm text-slate-900 truncate">{n.title}</h4>
          {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
        </div>
        <p className="text-xs text-black/40 line-clamp-1 font-medium mt-0.5">{n.message}</p>
      </div>

      <div className="text-right">
        <p className="text-[10px] font-black text-black/20 uppercase">
          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
        </p>
        {n.approval && (
          <span className="mt-2 inline-block px-2 py-0.5 rounded-md bg-purple-100 text-[8px] font-black text-purple-700 uppercase">
            {n.approval.status}
          </span>
        )}
      </div>
    </motion.div>
  );
}

/* ================= INSPECTOR PANEL ================= */

function InspectorPanel({
  notification: n,
  onClose,
  onRefresh,
  dispatch,
}: {
  notification: NotificationItem;
  onClose: () => void;
  onRefresh: () => void;
  dispatch: any;
}) {
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const approval = n.approval;

  const handleDecision = async (status: ApprovalStatus) => {
    if (!approval) return;

    if (status === "REJECTED" && !note) {
      dispatch({
        kind: "TOAST",
        type: "WARNING",
        title: "Note Required",
        message: "Please provide a reason.",
      });
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejectionNote: note }),
      });
      if (!res.ok) throw new Error();

      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Success",
        message: `Request ${status}.`,
      });

      onRefresh();
    } catch {
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Action Failed",
        message: "System could not process.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col h-full bg-white">
      {/* HEADER */}
      <div className="p-6 border-b border-black/5 flex items-center justify-between bg-[#FAFAFC]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white">
            <i className="bx bx-search-alt text-lg" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">Inspector</h3>
            <p className="text-[10px] text-black/40 font-bold">ID: {n.id.slice(0, 8)}</p>
          </div>
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 text-black/40">
          <i className="bx bx-x text-xl" />
        </button>
      </div>

      {/* BODY */}
      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        <section>
          <h2 className="text-lg font-bold text-slate-900">{n.title}</h2>
          <p className="text-sm text-slate-500 mt-2 font-medium">{n.message}</p>
        </section>

        {/* LOGS */}
        <section className="pt-6 border-t border-black/5">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-black/30 mb-4">Audit Trail</h4>
          <ActivityLogsPanel logs={n.logs ?? []} />
        </section>

        {/* APPROVAL CHANGES */}
        {approval?.changes && (
          <section className="bg-[#F2F2F7] rounded-2xl p-5 space-y-4">
            <h4 className="text-[9px] font-black uppercase tracking-widest text-black/40">Proposed Changes</h4>
            {Object.entries(approval.changes).map(([key, value]) => (
              <div key={key}>
                <p className="text-[9px] font-bold text-black/50 uppercase">{key}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs line-through text-red-400">{String(value.old)}</span>
                  <i className="bx bx-right-arrow-alt" />
                  <span className="text-xs text-emerald-600 font-bold">{String(value.new)}</span>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* APPROVAL ACTIONS */}
        {approval?.status === "PENDING" && (
          <section className="pt-6 border-t border-black/5 space-y-3">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Provide context for rejection..."
              className="w-full h-24 p-4 bg-[#F2F2F7] rounded-2xl text-xs"
            />
            <div className="flex gap-2">
              <button onClick={() => handleDecision("APPROVED")} disabled={loading} className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase">
                Approve
              </button>
              <button onClick={() => handleDecision("REJECTED")} disabled={loading} className="flex-1 py-3 border border-black/10 rounded-xl text-[11px] font-black uppercase">
                Reject
              </button>
            </div>
          </section>
        )}
      </div>
    </motion.div>
  );
}

/* ================= LOGS PANEL ================= */

function ActivityLogsPanel({ logs }: { logs: ActivityLog[] }) {
  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <div key={log.id} className="p-3 bg-white border rounded-xl text-xs">
          <div className="flex justify-between">
            <span className="font-bold">{log.personnel?.name ?? "System"}</span>
            <span className="text-black/30">
              {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
            </span>
          </div>
          <p className="text-slate-600 mt-1">{log.action}</p>
        </div>
      ))}
    </div>
  );
}

/* ================= ICON HELPER ================= */

function getIcon(type: NotificationType) {
  return {
    INFO: "bx-info-circle",
    WARNING: "bx-error-alt",
    ERROR: "bx-x-circle",
    SYSTEM: "bx-cog",
    APPROVAL_REQUIRED: "bx-lock-open",
    APPROVAL_DECISION: "bx-check-double",
  }[type];
}