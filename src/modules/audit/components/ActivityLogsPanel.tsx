"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

/* ==========================================================================\
    TYPES & INTERFACES
   ========================================================================== */

export interface ActivityLogDTO {
  id: string;
  action: string;
  critical: boolean;
  createdAt: string | Date;
  ipAddress?: string | null;
  deviceInfo?: string | null;
  metadata?: any; 
  personnel?: {
    name: string;
    email: string;
  } | null;
  performedBy?: string; 
  personnelName?: string;
  details?: string;
}

interface ActivityLogsPanelProps {
  logs: ActivityLogDTO[];
  onClose: () => void;
  title?: string;
  emptyMessage?: string;
}

const LOG_TABS = {
  ALL: "ALL_ACTIONS",
  SECURITY: "SECURITY",
  PROVISION: "PROVISION",
  UPDATE: "UPDATE",
};

/* ==========================================================================\
    UTILS
   ========================================================================== */

const parseDevice = (ua?: string | null) => {
  if (!ua) return "System Process";
  const lowUA = ua.toLowerCase();
  if (lowUA.includes("windows")) return "Windows PC";
  if (lowUA.includes("iphone") || lowUA.includes("ipad")) return "iOS Device";
  if (lowUA.includes("android")) return "Android";
  if (lowUA.includes("macintosh")) return "MacBook / iMac";
  if (lowUA.includes("postman") || lowUA.includes("curl")) return "API/Dev Tool";
  return ua.split(" ")[0] || "Unknown Device";
};

const getInitials = (name: string) => {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
};

/* ==========================================================================\
    SUB-COMPONENT: ACTIVITY CARD
   ========================================================================== */

const ActivityCard = ({ log }: { log: ActivityLogDTO }) => {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  const performerName = log.personnel?.name ?? log.performedBy ?? log.personnelName ?? "System";
  const targetName = (log.metadata as any)?.targetName ?? "General Context";
  const dateStr = new Date(log.createdAt).toLocaleString('en-US', { 
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
  });

  // 1. DYNAMIC COLOR LOGIC
  const action = log.action.toUpperCase();
  const isRed = /DELETE|DEACTIVATED|REJECTED|REMOVE|TERMINATE/.test(action);
  const isAmber = /DISABLED|LOCKED|WARN|BLOCK|SUSPENDED/.test(action);

  const getStatusStyles = () => {
    if (isRed) return {
      badge: "bg-red-50 text-red-600 border-red-100",
      avatar: "bg-red-600",
      dot: "bg-red-500"
    };
    if (isAmber) return {
      badge: "bg-amber-50 text-amber-600 border-amber-100",
      avatar: "bg-amber-500",
      dot: "bg-amber-500"
    };
    return {
      badge: "bg-slate-50 text-slate-500 border-slate-100",
      avatar: "bg-slate-900",
      dot: "bg-emerald-500"
    };
  };

  const styles = getStatusStyles();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="p-3 bg-white border border-black/[0.04] rounded-xl transition-all shadow-sm hover:shadow-md"
    >
      {/* 1. HEADER: Performer + Action (Replacing Auth_Identity) */}
      <div className="flex items-center gap-2.5 mb-2.5 min-w-0">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold text-white shrink-0 shadow-sm ${styles.avatar}`}>
          {getInitials(performerName)}
        </div>
        <div className="flex flex-col truncate">
          <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight leading-none whitespace-nowrap mb-1">
            {performerName}
          </span>
          <div className="flex">
            <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded border tracking-[0.05em] ${styles.badge}`}>
                {log.action.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      </div>

      {/* 2. BODY CONTENT */}
      <div className="pl-9.5 space-y-2">
        <p className="text-[10px] font-medium text-slate-600 leading-snug">
          {log.details || (log.metadata as any)?.details || "Audit sequence completed successfully."}
        </p>
        
        <div className="flex items-center gap-2">
          <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter shrink-0">Target:</span>
          <span className="text-[9px] font-bold text-slate-700 truncate">
            {targetName}
          </span>
        </div>

        <button 
          onClick={() => setExpanded(!expanded)}
          className="text-[8px] font-black text-slate-400 hover:text-slate-900 flex items-center gap-1 uppercase tracking-widest transition-colors"
        >
          {expanded ? 'Collapse_Data' : 'Inspect_Payload'}
          <i className={`bx bx-chevron-${expanded ? 'up' : 'down'} text-xs`} />
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }} 
              animate={{ height: "auto", opacity: 1 }} 
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 relative">
                <div className="p-2.5 bg-slate-900 rounded-lg border border-white/5 relative">
                  <button 
                    onClick={() => navigator.clipboard.writeText(JSON.stringify(log.metadata))}
                    className="absolute right-2 top-2 p-1.5 bg-white/10 hover:bg-white/20 rounded text-emerald-400 transition-colors"
                  >
                    <i className="bx bx-copy text-[10px]" />
                  </button>
                  <pre className="text-[9px] font-mono text-emerald-400/90 leading-tight overflow-x-auto custom-scrollbar">
                    {JSON.stringify({ 
                      ip: log.ipAddress || "null", 
                      ua: parseDevice(log.deviceInfo), 
                      meta: log.metadata || {}
                    }, null, 2)}
                  </pre>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. FOOTER */}
      <div className="mt-3 pt-2.5 border-t border-black/[0.03] flex justify-between items-center">
        <p className="text-[8px] font-bold text-slate-400 font-mono tracking-tight uppercase">
          {dateStr}
        </p>
        
        <button 
          onClick={() => router.push(`/dashboard/activity/${log.id}`)}
          className="px-2 py-1 bg-slate-50 hover:bg-slate-900 rounded-md text-[8px] font-black text-slate-400 hover:text-white uppercase tracking-tighter transition-all"
        >
          Details
        </button>
      </div>
    </motion.div>
  );
};

/* ==========================================================================\
    MAIN PANEL
   ========================================================================== */

export function ActivityLogsPanel({ 
  logs, 
  onClose, 
  title = "Live_Audit_Trail",
  emptyMessage = "No activity records found."
}: ActivityLogsPanelProps) {
  const [filter, setFilter] = useState<string>(LOG_TABS.ALL);

  const filteredLogs = useMemo(() => {
    if (filter === LOG_TABS.ALL) return logs;
    return logs.filter((l) => {
      const action = l.action.toUpperCase();
      if (filter === LOG_TABS.SECURITY) return /LOCK|ACCESS|LOGIN|PASSWORD|AUTH|SECURITY/.test(action);
      if (filter === LOG_TABS.PROVISION) return /CREATE|ASSIGN|DELETE|PROVISION/.test(action);
      if (filter === LOG_TABS.UPDATE) return /UPDATE|PATCH|EDIT|ENABLE|DISABLE|STOCK_ADJUST/.test(action);
      return action.includes(filter);
    });
  }, [logs, filter]);

  return (
    <div className="h-full flex flex-col w-full bg-[#FAFAFC] relative border-l border-black/5 shadow-2xl">
      <div className="p-4 border-b border-black/5 bg-white shrink-0 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-900 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-sm bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)] animate-pulse" /> 
            {title}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-all active:scale-90">
            <i className="bx bx-x text-lg" />
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
          {Object.values(LOG_TABS).map((tab) => (
            <button 
              key={tab} 
              onClick={() => setFilter(tab)} 
              className={`shrink-0 px-3 py-1.5 rounded-md text-[8px] font-black uppercase tracking-tight transition-all border ${
                filter === tab 
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm" 
                  : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
              }`}
            >
              {tab.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 custom-scrollbar">
        {filteredLogs.length === 0 ? (
          <div className="h-60 flex flex-col items-center justify-center text-slate-300">
             <i className="bx bx-radar text-4xl mb-2 opacity-20" />
             <p className="text-[9px] font-black uppercase tracking-[0.2em]">{emptyMessage}</p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <ActivityCard key={log.id} log={log} />
          ))
        )}
      </div>
    </div>
  );
}