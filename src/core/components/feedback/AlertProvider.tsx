"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import * as RadixToast from "@radix-ui/react-toast";
import { motion, AnimatePresence } from "framer-motion";
import { NotificationType } from "@prisma/client";
import "boxicons/css/boxicons.min.css";
import Pusher from "pusher-js";
import { getSession } from "next-auth/react";

/* -------------------------------------------------- */
/* CONFIG & TYPES */
/* -------------------------------------------------- */

export type AlertKind = "TOAST" | "PUSH";

export interface MASAAlert {
  id: string; 
  notificationId: string; 
  kind: AlertKind;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
  context?: any;
}

interface AlertContextType {
  dispatch: (alert: Omit<MASAAlert, "id" | "createdAt" | "read">) => void;
  remove: (id: string) => void;
  markRead: (notificationId: string, alertId: string) => Promise<void>;
  refresh: () => Promise<void>;
  clearActivePushes: () => void;
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

const MAX_VISIBLE_PUSHES = 4;
const AUTO_HIDE_MS = 6000;

function getRelativeTime(timestamp: number) {
  const diffInMins = Math.floor((Date.now() - timestamp) / 60000);
  if (diffInMins < 1) return "Now";
  if (diffInMins < 60) return `${diffInMins}m`;
  if (diffInMins < 1440) return `${Math.floor(diffInMins / 60)}h`;
  return `${Math.floor(diffInMins / 1440)}d`;
}

/* -------------------------------------------------- */
/* CONTEXT */
/* -------------------------------------------------- */

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlerts = () => {
  const context = useContext(AlertContext);
  if (!context) throw new Error("useAlerts must be used within an AlertProvider");
  return context;
};

/* -------------------------------------------------- */
/* PROVIDER */
/* -------------------------------------------------- */

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<MASAAlert[]>([]);
  const [isGroupExpanded, setIsGroupExpanded] = useState(false);
  const [latestAnnouncement, setLatestAnnouncement] = useState(""); 
  const pusherRef = useRef<Pusher | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?limit=20`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      
      const mapped: MASAAlert[] = (data.notifications || []).map((n: any) => ({
        id: `srv-${n.id}`,
        notificationId: n.id,
        kind: "PUSH",
        type: n.type,
        title: n.title,
        message: n.message,
        createdAt: new Date(n.createdAt).getTime(),
        read: n.read,
        context: n.context,
      }));

      setAlerts((prev) => {
        const existingIds = new Set(prev.map((a) => a.notificationId));
        const newOnes = mapped.filter((m) => !existingIds.has(m.notificationId) && !m.read);
        return [...newOnes, ...prev].sort((a, b) => b.createdAt - a.createdAt);
      });
    } catch (err) {
      console.error("[FETCH_ERROR]", err);
    }
  }, []);

  const markRead = useCallback(async (notificationId: string, alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notificationId, read: true }),
      });
    } catch (err) {
      console.error("[MARK_READ_ERROR]", err);
    }
  }, []);

  const clearAllPushes = useCallback(async () => {
    setAlerts((prev) => prev.filter((a) => a.kind !== "PUSH"));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
    } catch {}
  }, []);

  const clearActivePushes = useCallback(() => {
    setAlerts((prev) => prev.filter((a) => a.kind !== "PUSH"));
  }, []);

  const remove = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const dispatch = useCallback((alert: Omit<MASAAlert, "id" | "createdAt" | "read">) => {
    const id = crypto.randomUUID();
    const full: MASAAlert = { ...alert, id, createdAt: Date.now(), read: false };
    setLatestAnnouncement(`${alert.type}: ${alert.title}`);
    setAlerts((prev) => [full, ...prev]);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const sess = await getSession();
      if (!mounted) return;
      await fetchNotifications();

      if (sess?.user?.id && !pusherRef.current) {
        pusherRef.current = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
          cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "mt1",
          authEndpoint: "/api/pusher/auth",
        });
        const ch = pusherRef.current.subscribe(`user-${sess.user.id}`);
        
        ch.bind("new-alert", (p: any) => {
          dispatch({
            kind: p.kind || "PUSH",
            notificationId: p.id,
            type: p.type,
            title: p.title,
            message: p.message,
            context: { approvalId: p.approvalId, activityId: p.activityId }
          });
          setIsGroupExpanded(true);
        });
      }
    })();
    return () => { mounted = false; };
  }, [dispatch, fetchNotifications]);

  const activePushes = useMemo(() => alerts.filter(a => a.kind === "PUSH"), [alerts]);
  const activeToasts = useMemo(() => alerts.filter(a => a.kind === "TOAST"), [alerts]);

  return (
    <AlertContext.Provider value={{ dispatch, remove, refresh: fetchNotifications, markRead, clearActivePushes }}>
      {children}

      <div aria-live="polite" className="sr-only">{latestAnnouncement}</div>
      
      {/* PUSH GROUP */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] w-full max-w-[380px] px-4 pointer-events-none">
        <AnimatePresence>
          {activePushes.length > 0 && (
            <PushGroup 
              alerts={activePushes} 
              isExpanded={isGroupExpanded} 
              setIsExpanded={setIsGroupExpanded}
              onClearAll={clearAllPushes}
            />
          )}
        </AnimatePresence>
      </div>

      {/* TOASTS */}
      <RadixToast.Provider swipeDirection="right">
        <RadixToast.Viewport className="fixed bottom-6 right-6 z-[10000] w-[350px] flex flex-col gap-3 pointer-events-none" />
        <AnimatePresence mode="popLayout">
          {activeToasts.map((a) => <ToastItem key={a.id} alert={a} onRemove={remove} />)}
        </AnimatePresence>
      </RadixToast.Provider>
    </AlertContext.Provider>
  );
}

/* -------------------------------------------------- */
/* SUB-COMPONENTS */
/* -------------------------------------------------- */

function PushGroup({ alerts, isExpanded, setIsExpanded, onClearAll }: any) {
  const { clearActivePushes } = useAlerts();
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isHovered) return;
    const timer = setTimeout(() => clearActivePushes(), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [isHovered, alerts, clearActivePushes]);

  const isMulti = alerts.length > 1;
  const visible = isExpanded ? alerts.slice(0, MAX_VISIBLE_PUSHES) : alerts.slice(0, 1);

  return (
    <motion.div
      layout
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative bg-white dark:bg-[#18181b] border border-black/5 dark:border-white/10 shadow-2xl rounded-xl overflow-hidden pointer-events-auto flex flex-col"
    >
      <AnimatePresence>
        {isMulti && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex items-center justify-between px-4 py-2 border-b border-black/5 dark:border-white/5 bg-slate-50 dark:bg-white/5"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Center • {alerts.length} pending
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isExpanded && (
                <button onClick={onClearAll} className="text-[10px] font-bold text-blue-600 hover:text-blue-700">
                  Clear All
                </button>
              )}
              <button onClick={() => setIsExpanded(!isExpanded)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                <i className={`bx bx-chevron-${isExpanded ? 'up' : 'down'} text-slate-400 text-lg`} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div layout className="flex flex-col p-1.5 pb-2">
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((a: MASAAlert) => (
            <PushItem key={a.id} alert={a} />
          ))}
        </AnimatePresence>
      </motion.div>

      {!isHovered && (
        <motion.div
          key={alerts.length} 
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: AUTO_HIDE_MS / 1000, ease: "linear" }}
          className="h-[2px] bg-blue-500/50 absolute bottom-0 left-0"
        />
      )}
    </motion.div>
  );
}

function PushItem({ alert }: { alert: MASAAlert }) {
  const { remove, markRead } = useAlerts();
  const [isLocalExpanded, setIsLocalExpanded] = useState(false);
  const config = TYPE_CONFIG[alert.type] || TYPE_CONFIG.INFO;

  return (
    <motion.div
      layout
      drag="x"
      dragConstraints={{ left: 0, right: 150 }}
      dragElastic={0.2}
      onDragEnd={(_, info) => info.offset.x > 80 && markRead(alert.notificationId, alert.id)}
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      className="bg-white dark:bg-[#202023] p-3 rounded-lg border border-transparent hover:border-black/5 dark:hover:border-white/5 mb-1 last:mb-0 touch-none select-none"
    >
      <div className="flex gap-3">
        <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${config.bg} shadow-sm`}>
          <i className={`bx ${config.icon} text-base text-white`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-900 dark:text-white truncate pr-2">{alert.title}</span>
            <span className="text-[10px] text-slate-400 whitespace-nowrap">{getRelativeTime(alert.createdAt)}</span>
          </div>
          <p className={`text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-normal ${isLocalExpanded ? '' : 'line-clamp-1'}`}>
            {alert.message}
          </p>

          <div className="flex items-center gap-3 mt-2">
            <button onClick={() => markRead(alert.notificationId, alert.id)} className="text-[10px] font-bold text-blue-600 hover:underline">
              Mark Read
            </button>
            <button onClick={() => setIsLocalExpanded(!isLocalExpanded)} className="text-[10px] font-bold text-slate-400">
              {isLocalExpanded ? 'Show Less' : 'Details'}
            </button>
            <button onClick={() => remove(alert.id)} className="ml-auto text-[10px] font-bold text-slate-300 hover:text-red-500">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ToastItem({ alert, onRemove }: any) {
  const config = TYPE_CONFIG[alert.type] || TYPE_CONFIG.INFO;
  return (
    <RadixToast.Root duration={5000} onOpenChange={(open) => !open && onRemove(alert.id)} asChild>
      <motion.div 
        layout 
        initial={{ opacity: 0, x: 20 }} 
        animate={{ opacity: 1, x: 0 }} 
        exit={{ opacity: 0, scale: 0.9 }} 
        className="bg-white dark:bg-[#1c1c1c] border border-black/10 dark:border-white/10 shadow-lg rounded-xl p-4 flex gap-3 pointer-events-auto"
      >
        <div className={`w-9 h-9 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
          <i className={`bx ${config.icon} text-lg text-white`} />
        </div>
        <div className="flex-1 min-w-0">
          <RadixToast.Title className="text-xs font-bold text-slate-900 dark:text-white">{alert.title}</RadixToast.Title>
          <RadixToast.Description className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
            {alert.message}
          </RadixToast.Description>
        </div>
        <RadixToast.Close className="text-slate-300 hover:text-slate-500 transition-colors">
          <i className="bx bx-x text-xl" />
        </RadixToast.Close>
      </motion.div>
    </RadixToast.Root>
  );
}