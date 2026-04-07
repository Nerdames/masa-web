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
  description?: string;
  details?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
  critical?: boolean;
  module?: string;
  targetType?: string;
  createdAt: string | Date;
  ipAddress?: string | null;
  deviceInfo?: string | null;
  requestId?: string | null;
  actorType?: "USER" | "SYSTEM" | string;
  actorRole?: string;
  personnel?: { name: string; email: string } | null;
  performedBy?: string;
  personnelName?: string;
  diff?: { before: any; after: any };
  before?: any;
  after?: any;
  integrity?: { hash: string | null; previousHash?: string | null; isChainValid: boolean };
  hash?: string | null;
  metadata?: any;
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
  if (!ua) return "SYS_PROC";
  const lowUA = ua.toLowerCase();
  if (lowUA.includes("windows")) return "WIN_PC";
  if (lowUA.includes("iphone") || lowUA.includes("ipad")) return "IOS_NODE";
  if (lowUA.includes("android")) return "ANDR_NODE";
  if (lowUA.includes("macintosh")) return "MAC_OS";
  return "WEB_NODE";
};

const getInitials = (name: string) => {
  if (!name || name.includes("Unknown")) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
};

const formatDateGroup = (date: string | Date) => {
  const d = new Date(date);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "TODAY_SESSIONS";
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "YESTERDAY_SESSIONS";
  return d.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  }).toUpperCase();
};

/* ==========================================================================\
    SUB-COMPONENT: ACTIVITY CARD
   ========================================================================== */

const ActivityCard = ({ log }: { log: ActivityLogDTO }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const isSystem = log.actorType === "SYSTEM" || log.performedBy === "System";
  const performerName = isSystem 
    ? "SYSTEM_KERNEL" 
    : (log.personnel?.name || log.personnelName || log.performedBy || "ANONYMOUS");
    
  // Priority: Direct Description > Details > Metadata Details > Action Name fallback
  const description = log.description || log.details || log.metadata?.details || `Event ${log.action} processed successfully.`;
  const moduleName = (log.module || log.targetType || "CORE").toUpperCase();
  const severity = (log.severity || "LOW").toUpperCase();
  const actionName = log.action.replace(/_/g, " ").toUpperCase();
  const timeStr = new Date(log.createdAt).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

  const stateBefore = log.diff?.before || log.before;
  const stateAfter = log.diff?.after || log.after;
  const hasDiff = !!(stateBefore || stateAfter);

  const styles = useMemo(() => {
    if (severity === "CRITICAL" || log.critical) return {
      badge: "bg-red-50 text-red-600 border-red-100",
      avatar: "bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.2)]",
      dot: "bg-red-500",
    };
    if (severity === "HIGH" || severity === "MEDIUM") return {
      badge: "bg-amber-50 text-amber-600 border-amber-100",
      avatar: "bg-amber-500",
      dot: "bg-amber-500",
    };
    return {
      badge: "bg-slate-50 text-slate-500 border-slate-100",
      avatar: isSystem ? "bg-indigo-600" : "bg-slate-900",
      dot: "bg-emerald-500",
    };
  }, [severity, log.critical, isSystem]);

  return (
    <div className="p-3 bg-white border border-black/[0.04] rounded-xl shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${styles.avatar}`}>
          {isSystem ? <i className="bx bx-chip text-sm" /> : getInitials(performerName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-slate-800 uppercase truncate">{performerName}</span>
            <span className="text-[9px] font-mono text-slate-400">{timeStr}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded border ${styles.badge}`}>{actionName}</span>
            {log.requestId && (
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  navigator.clipboard.writeText(log.requestId!); 
                  setCopied(true); 
                  setTimeout(() => setCopied(false), 2000); 
                }}
                className="text-[7px] font-bold text-slate-300 hover:text-slate-600 uppercase tracking-tighter"
              >
                {copied ? "COPIED" : `TRC_${log.requestId.slice(-6).toUpperCase()}`}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="pl-9.5 space-y-2">
        <p className="text-[10px] font-medium text-slate-600 leading-snug">{description}</p>
        
        <div className="flex items-center gap-3">
          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter flex items-center gap-1">
            <i className="bx bx-map-alt" />{log.ipAddress || "INTERNAL"}
          </span>
          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter flex items-center gap-1">
            <i className="bx bx-devices" />{parseDevice(log.deviceInfo)}
          </span>
        </div>

        <button onClick={() => setExpanded(!expanded)} className="text-[8px] font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest flex items-center gap-1 transition-colors">
          {expanded ? 'Collapse_Trace' : 'Inspect_State_Data'} <i className={`bx bx-chevron-${expanded ? 'up' : 'down'}`} />
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-2 space-y-2">
                {hasDiff && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="p-1.5 bg-red-50 border border-red-100 rounded">
                      <span className="text-[6px] font-black text-red-400 uppercase block mb-1">State_Before</span>
                      <pre className="text-[8px] font-mono text-slate-500 truncate">{JSON.stringify(stateBefore)}</pre>
                    </div>
                    <div className="p-1.5 bg-emerald-50 border border-emerald-100 rounded">
                      <span className="text-[6px] font-black text-emerald-400 uppercase block mb-1">State_After</span>
                      <pre className="text-[8px] font-mono text-slate-500 truncate">{JSON.stringify(stateAfter)}</pre>
                    </div>
                  </div>
                )}
                <div className="p-2.5 bg-[#0F172A] rounded-lg border border-white/5">
                  <div className="flex justify-between items-center mb-1 pb-1 border-b border-white/10">
                    <span className="text-[7px] font-black text-indigo-400/50 uppercase">Raw_Payload</span>
                    <i className="bx bx-data text-[10px] text-indigo-400/30" />
                  </div>
                  <pre className="text-[9px] font-mono text-indigo-300/80 overflow-x-auto custom-scrollbar">
                    {JSON.stringify(log.metadata || { info: "No additional data" }, null, 2)}
                  </pre>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-3 pt-2.5 border-t border-black/[0.03] flex justify-between items-center">
        <p className="text-[8px] font-bold text-slate-400 font-mono uppercase">
          <span className={`inline-block w-1 h-1 rounded-full mr-1.5 ${styles.dot}`} />
          {moduleName}_SYSTEM
        </p>
        <button 
          onClick={() => router.push(`/audit/logs?id=${log.id}`)}
          className="px-3 py-1 bg-slate-50 hover:bg-slate-900 rounded-md text-[8px] font-black text-slate-400 hover:text-white uppercase transition-all"
        >
          View_Full
        </button>
      </div>
    </div>
  );
};

/* ==========================================================================\
    MAIN PANEL
   ========================================================================== */

export function ActivityLogsPanel({ 
  logs, 
  onClose, 
  title = "MASA_AUDIT_STREAM",
  emptyMessage = "NO_ACTIVITY_IN_BUFFER"
}: ActivityLogsPanelProps) {
  const [filter, setFilter] = useState<string>(LOG_TABS.ALL);

  const counts = useMemo(() => ({
    [LOG_TABS.ALL]: logs.length,
    [LOG_TABS.SECURITY]: logs.filter(l => /LOCK|ACCESS|LOGIN|AUTH|SECURITY/.test(l.action.toUpperCase()) || l.severity === "CRITICAL").length,
    [LOG_TABS.PROVISION]: logs.filter(l => /CREATE|DELETE|PROVISION/.test(l.action.toUpperCase())).length,
    [LOG_TABS.UPDATE]: logs.filter(l => /UPDATE|PATCH|EDIT|STOCK/.test(l.action.toUpperCase())).length,
  }), [logs]);

  const groupedLogs = useMemo(() => {
    const filtered = logs.filter((l) => {
      if (filter === LOG_TABS.ALL) return true;
      const act = l.action.toUpperCase();
      if (filter === LOG_TABS.SECURITY) return /LOCK|ACCESS|LOGIN|AUTH|SECURITY/.test(act) || l.severity === "CRITICAL";
      if (filter === LOG_TABS.PROVISION) return /CREATE|DELETE|PROVISION/.test(act);
      if (filter === LOG_TABS.UPDATE) return /UPDATE|PATCH|EDIT|STOCK/.test(act);
      return true;
    });

    return filtered.reduce((acc: Record<string, ActivityLogDTO[]>, log) => {
      const group = formatDateGroup(log.createdAt);
      if (!acc[group]) acc[group] = [];
      acc[group].push(log);
      return acc;
    }, {});
  }, [logs, filter]);

  return (
    <div className="h-full flex flex-col w-full bg-[#FAFAFC] border-l border-black/5 shadow-2xl overflow-hidden font-sans">
      {/* HEADER */}
      <div className="p-4 bg-white border-b border-black/5 shrink-0 space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-900 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-sm bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.4)]" /> 
              {title}
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 active:scale-90 transition-all">
            <i className="bx bx-x text-lg" />
          </button>
        </div>

        {/* FILTER TABS (No horizontal scroll as requested) */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
          {Object.entries(LOG_TABS).map(([key, value]) => (
            <button 
              key={key} 
              onClick={() => setFilter(value)} 
              className={`whitespace-nowrap px-3 py-1.5 rounded-md text-[8px] font-black uppercase tracking-tight border flex items-center gap-2 transition-all ${
                filter === value ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
              }`}
            >
              {value.replace(/_/g, " ")}
              <span className={`px-1 rounded-sm text-[7px] ${filter === value ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                {counts[value as keyof typeof counts]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* GROUPED LIST */}
      <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
        {Object.keys(groupedLogs).length === 0 ? (
          <div className="h-60 flex flex-col items-center justify-center text-slate-300">
             <i className="bx bx-radar text-4xl mb-2 opacity-20" />
             <p className="text-[9px] font-black uppercase tracking-[0.2em]">{emptyMessage}</p>
          </div>
        ) : (
          Object.entries(groupedLogs).map(([group, entries]) => (
            <div key={group} className="space-y-3">
              <div className="flex items-center gap-3 sticky top-0 bg-[#FAFAFC]/95 backdrop-blur-sm py-1 z-10">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{group}</span>
                <div className="h-[1px] w-full bg-black/[0.05]" />
              </div>
              {entries.map((log) => <ActivityCard key={log.id} log={log} />)}
            </div>
          ))
        )}
      </div>

      {/* FOOTER */}
      <div className="p-3 px-4 bg-white border-t border-black/5 flex justify-between items-center text-[7px] font-mono text-slate-400 uppercase tracking-widest">
        <span className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-emerald-500" />SECURE_LINK_ACTIVE</span>
        <span>© 2026 MASA_ENGINE</span>
      </div>
    </div>
  );
}