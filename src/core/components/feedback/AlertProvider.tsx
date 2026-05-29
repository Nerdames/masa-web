"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
import * as RadixToast from "@radix-ui/react-toast";
import { motion, AnimatePresence } from "framer-motion";
import { NotificationType } from "@prisma/client";
import Pusher from "pusher-js";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { 
  ShieldAlert, 
  Settings, 
  LockKeyholeOpen, 
  GitCommitVertical, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  Package, 
  Receipt,
  ChevronUp,
  ChevronDown,
  X,
  LucideIcon
} from "lucide-react";

/* -------------------------------------------------- */
/* CONFIG & TYPES */
/* -------------------------------------------------- */

export type AlertKind = "TOAST" | "PUSH";
export type AlertType = NotificationType | "SUCCESS" | "WARNING" | "APPROVAL_DECISION";

export interface MASAAlert {
  id: string; 
  notificationId?: string;
  kind: AlertKind;
  type: AlertType;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
  context?: Record<string, unknown> | null;
}

interface ServerNotification {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  createdAt: string | number;
  read: boolean;
  context?: Record<string, unknown>;
}

interface PusherPayload {
  id: string;
  kind?: AlertKind;
  type: AlertType;
  title: string;
  message: string;
  context?: Record<string, unknown>;
  isWelcome?: boolean;
}

interface ToastItemProps {
  alert: MASAAlert;
  onRemove: (id: string) => void;
}

interface AlertContextType {
  dispatch: (alert: Omit<MASAAlert, "id" | "createdAt" | "read">) => void;
  remove: (id: string) => void;
  markRead: (notificationId: string, alertId: string) => Promise<void>;
  refresh: () => Promise<void>;
  clearActivePushes: () => void;
}

const TYPE_CONFIG: Record<AlertType, { icon: LucideIcon; bg: string }> = {
  SECURITY: { icon: ShieldAlert, bg: "bg-red-500" },
  SYSTEM: { icon: Settings, bg: "bg-slate-600" },
  APPROVAL: { icon: LockKeyholeOpen, bg: "bg-amber-500" },
  APPROVAL_DECISION: { icon: GitCommitVertical, bg: "bg-indigo-500" },
  SUCCESS: { icon: CheckCircle2, bg: "bg-emerald-500" },
  WARNING: { icon: AlertTriangle, bg: "bg-orange-500" },
  INFO: { icon: Info, bg: "bg-blue-500" },
  INVENTORY: { icon: Package, bg: "bg-purple-500" },
  TRANSACTIONAL: { icon: Receipt, bg: "bg-emerald-600" },
};

const MAX_VISIBLE_PUSHES = 4;
const AUTO_HIDE_MS = 6000;

function getRelativeTime(timestamp: number): string {
  const diffInMins = Math.floor((Date.now() - timestamp) / 60000);
  if (diffInMins < 1) return "Now";
  if (diffInMins < 60) return `${diffInMins}m`;
  if (diffInMins < 1440) return `${Math.floor(diffInMins / 60)}h`;
  return `${Math.floor(diffInMins / 1440)}d`;
}

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
  const { data: session, status } = useSession();
  const [alerts, setAlerts] = useState<MASAAlert[]>([]);
  const [isGroupExpanded, setIsGroupExpanded] = useState(false);
  const [latestAnnouncement, setLatestAnnouncement] = useState(""); 
  const pusherRef = useRef<Pusher | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const res = await fetch(`/api/notifications?limit=20`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      
      const mapped: MASAAlert[] = (data.notifications || []).map((n: ServerNotification) => ({
        id: `srv-${n.id}`,
        notificationId: n.id,
        kind: "PUSH",
        type: n.type,
        title: n.title,
        message: n.message,
        createdAt: new Date(n.createdAt).getTime(),
        read: n.read,
        context: n.context || null,
      }));

      setAlerts((prev) => {
        const existingIds = new Set(prev.map((a) => a.notificationId).filter(Boolean));
        const newOnes = mapped.filter((m) => !existingIds.has(m.notificationId) && !m.read);
        return [...newOnes, ...prev].sort((a, b) => b.createdAt - a.createdAt);
      });
    } catch (err) {
      console.error("[FETCH_ERROR]", err);
    }
  }, [status]);

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
    const initNotifications = async () => {
      if (status === "authenticated" && session?.user?.id) {
        await fetchNotifications();

        if (!pusherRef.current) {
          pusherRef.current = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
            cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "mt1",
            authEndpoint: "/api/pusher/auth",
          });
          const ch = pusherRef.current.subscribe(`user-${session.user.id}`);
          
          ch.bind("new-alert", (p: PusherPayload) => {
            dispatch({
              kind: p.kind || "PUSH",
              notificationId: p.id,
              type: p.type,
              title: p.title,
              message: p.message,
              context: { ...p.context, isWelcome: p.isWelcome }
            });
            setIsGroupExpanded(true);
          });
        }
      }
    };

    void initNotifications();

    return () => {
      if (pusherRef.current) {
        pusherRef.current.disconnect();
        pusherRef.current = null;
      }
    };
  }, [status, session, dispatch, fetchNotifications]);

  const activePushes = useMemo(() => alerts.filter(a => a.kind === "PUSH"), [alerts]);
  const activeToasts = useMemo(() => alerts.filter(a => a.kind === "TOAST"), [alerts]);

  return (
    <AlertContext.Provider value={{ dispatch, remove, refresh: fetchNotifications, markRead, clearActivePushes }}>
      {children}
      
      <div aria-live="polite" className="sr-only">{latestAnnouncement}</div>
      
      {/* PUSH NOTIFICATIONS */}
      {status === "authenticated" && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[10000] w-full max-w-[310px] px-2 pointer-events-none">
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
      )}

      {/* TOAST NOTIFICATIONS */}
      <RadixToast.Provider swipeDirection="right">
        <RadixToast.Viewport className="fixed bottom-3 right-3 z-[10000] w-[280px] flex flex-col gap-1.5 pointer-events-none" />
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

interface PushGroupProps {
  alerts: MASAAlert[];
  isExpanded: boolean;
  setIsExpanded: (val: boolean) => void;
  onClearAll: () => void;
}

function PushGroup({ alerts, isExpanded, setIsExpanded, onClearAll }: PushGroupProps) {
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
      className="relative bg-white border border-slate-200 shadow-xl rounded-lg overflow-hidden pointer-events-auto flex flex-col"
    >
      <AnimatePresence>
        {isMulti && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex items-center justify-between px-2 py-1 border-b border-slate-100 bg-slate-50/60"
          >
            <div className="flex items-center gap-1.5">
              <span className="flex h-1 w-1 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[9px] font-normal text-slate-400 uppercase tracking-wider">
                Center • {alerts.length} pending
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {isExpanded && (
                <button onClick={onClearAll} className="text-[9px] font-normal text-blue-500 hover:font-medium hover:text-blue-600 transition-all">
                  Clear All
                </button>
              )}
              <button onClick={() => setIsExpanded(!isExpanded)} className="w-4 h-4 flex items-center justify-center rounded hover:bg-slate-100 transition-colors">
                {isExpanded ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div layout className="flex flex-col p-1">
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((a) => (
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
          className="h-[1.5px] bg-blue-500/30 absolute bottom-0 left-0"
        />
      )}
    </motion.div>
  );
}

function PushItem({ alert }: { alert: MASAAlert }) {
  const { remove, markRead } = useAlerts();
  const router = useRouter();
  const [isLocalExpanded, setIsLocalExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  
  const config = TYPE_CONFIG[alert.type] || TYPE_CONFIG.INFO;
  const Icon = config.icon;
  
  const isWelcome = alert.context?.isWelcome || alert.title.toLowerCase().includes("welcome");

  useLayoutEffect(() => {
    if (textRef.current) {
      const isOverflowing = textRef.current.scrollHeight > textRef.current.clientHeight;
      setIsTruncated(isOverflowing);
    }
  }, [alert.message]);

  const handleMarkRead = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (alert.notificationId) {
      markRead(alert.notificationId, alert.id);
    } else {
      remove(alert.id);
    }
  };

  return (
    <motion.div
      layout
      drag={isWelcome ? false : "x"}
      dragConstraints={{ left: 0, right: 120 }}
      onDragEnd={(_, info) => !isWelcome && info.offset.x > 60 && handleMarkRead()}
      onClick={() => router.push('/notifications')}
      className="bg-white p-1.5 rounded border border-transparent hover:border-slate-100 touch-none select-none cursor-pointer group"
    >
      <div className="flex gap-2">
        <div className={`w-5.5 h-5.5 rounded flex-shrink-0 flex items-center justify-center ${config.bg}`}>
          <Icon className="w-3 h-3 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-normal text-slate-800 group-hover:font-medium truncate pr-1">{alert.title}</span>
            <span className="text-[8px] text-slate-400 whitespace-nowrap">{getRelativeTime(alert.createdAt)}</span>
          </div>
          <p 
            ref={textRef}
            className={`text-[9.5px] text-slate-500 mt-0.5 leading-normal ${isLocalExpanded ? '' : 'line-clamp-1'}`}
          >
            {alert.message}
          </p>

          <div className="flex items-center gap-2 mt-1">
            {!isWelcome && (
              <>
                <button onClick={handleMarkRead} className="text-[8.5px] font-normal text-blue-500 hover:font-medium hover:underline transition-all">
                  Mark Read
                </button>
                {(isTruncated || alert.context) && (
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setIsLocalExpanded(!isLocalExpanded); 
                    }} 
                    className="text-[8.5px] font-normal text-slate-400 hover:font-medium hover:text-slate-500 transition-all"
                  >
                    {isLocalExpanded ? 'Less' : 'Details'}
                  </button>
                )}
              </>
            )}
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                remove(alert.id); 
              }} 
              className={`${!isWelcome ? 'ml-auto' : ''} text-[8.5px] font-normal text-slate-300 hover:font-medium hover:text-red-500 transition-all`}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ToastItem({ alert, onRemove }: ToastItemProps) {
  const router = useRouter();
  const config = TYPE_CONFIG[alert.type] || TYPE_CONFIG.INFO;
  const Icon = config.icon;

  return (
    <RadixToast.Root duration={5000} onOpenChange={(open) => !open && onRemove(alert.id)} asChild>
      <motion.div 
        layout 
        onClick={() => router.push('/notifications')}
        className="bg-white border border-slate-200 shadow-md rounded-lg p-2 flex gap-2 pointer-events-auto cursor-pointer group"
      >
        <div className={`w-6 h-6 rounded ${config.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <RadixToast.Title className="text-[10px] font-normal text-slate-800 group-hover:font-medium">{alert.title}</RadixToast.Title>
          <RadixToast.Description className="text-[9.5px] text-slate-500 leading-normal mt-0.5 line-clamp-2">
            {alert.message}
          </RadixToast.Description>
        </div>
        <RadixToast.Close asChild>
          <button 
            onClick={(e) => e.stopPropagation()} 
            className="text-slate-300 hover:text-slate-400 transition-colors align-top"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </RadixToast.Close>
      </motion.div>
    </RadixToast.Root>
  );
}