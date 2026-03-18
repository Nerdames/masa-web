// This component renders a side panel displaying a list of activity logs with filtering options.
// It uses Framer Motion for smooth animations and Next.js router for navigation to detailed log views.
// The logs are categorized into tabs (All, Security, Provision, Update) for easier browsing.
"use client";

import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

/* ==========================================================================\
   TYPES & INTERFACES (Aligned with Prisma Schema)
   ========================================================================== */

// This matches your ActivityLog model + relations
export interface ActivityLogDTO {
  id: string;
  action: string;
  critical: boolean;
  createdAt: string | Date;
  ipAddress?: string | null;
  deviceInfo?: string | null;
  metadata?: any; // JSON from Prisma
  personnel?: {
    name: string;
    email: string;
  } | null;
  // Fallbacks for flat data structures
  performedBy?: string; 
  personnelName?: string;
}

interface ActivityLogsPanelProps {
  logs: ActivityLogDTO[];
  onClose: () => void;
  title?: string; // Customizable title for different pages
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
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

/* ==========================================================================\
   COMPONENT
   ========================================================================== */

export function ActivityLogsPanel({ 
  logs, 
  onClose, 
  title = "Live_Audit_Trail",
  emptyMessage = "No activity records found."
}: ActivityLogsPanelProps) {
  const [filter, setFilter] = useState<string>(LOG_TABS.ALL);
  const router = useRouter();

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
    <div className="h-full flex flex-col w-full bg-[#FAFAFC] relative border-l border-black/5">
      {/* 1. HEADER SECTION */}
      <div className="p-5 border-b border-black/5 bg-white shrink-0 space-y-5">
        <div className="flex justify-between items-center">
          <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-black/40 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" /> 
            {title}
          </h2>
        <button onClick={onClose} className="w-7 h-7 rounded hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-500 transition-colors">
          <i className="bx bx-x text-lg" />
        </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
          {Object.values(LOG_TABS).map((tab) => (
            <button 
              key={tab} 
              onClick={() => setFilter(tab)} 
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[8px] font-black uppercase tracking-tight transition-all border ${
                filter === tab 
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm" 
                  : "bg-white text-black/30 border-black/5 hover:border-black/20"
              }`}
            >
              {tab.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {/* 2. LOG LIST SECTION */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {filteredLogs.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center opacity-30">
             <i className="bx bx-list-minus text-3xl mb-1" />
             <p className="text-[10px] font-bold uppercase tracking-widest">{emptyMessage}</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const performerName = log.personnel?.name ?? log.performedBy ?? log.personnelName ?? "System";
            const targetName = (log.metadata as any)?.targetName ?? "General Context";
            
            const dateStr = new Date(log.createdAt).toLocaleString('en-US', { 
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
            });
            
            const deviceName = parseDevice(log.deviceInfo);
            const techString = `${dateStr} :: ${log.ipAddress || "127.0.0.1"} • ${deviceName}`;

            return (
              <motion.div 
                initial={{ opacity: 0, y: 8 }} 
                animate={{ opacity: 1, y: 0 }} 
                key={log.id} 
                onClick={() => router.push(`/dashboard/activity/${log.id}`)}
                className="p-4 bg-white border border-black/[0.04] rounded-2xl cursor-pointer hover:border-blue-500/20 hover:shadow-xl hover:shadow-blue-500/5 transition-all group active:scale-[0.98]"
              >
                {/* Card Header: Identity */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-[10px] font-bold text-white shadow-sm transition-colors ${log.critical ? 'bg-amber-500' : 'bg-slate-900 group-hover:bg-blue-600'}`}>
                      {getInitials(performerName)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-800 uppercase tracking-tighter leading-none">
                        {performerName}
                      </span>
                      <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        Performed Action
                      </span>
                    </div>
                  </div>
                  <span className={`text-[7px] font-black uppercase px-2 py-1 rounded-md tracking-widest border ${
                    log.critical 
                      ? 'bg-amber-50 text-amber-600 border-amber-100' 
                      : 'bg-slate-50 text-slate-500 border-slate-100'
                  }`}>
                    {log.action.replace(/_/g, " ")}
                  </span>
                </div>

                {/* Card Body: Content */}
                <div className="pl-9.5 space-y-2.5">
                  <p className="text-[11px] font-semibold text-slate-600 leading-relaxed">
                    {log.details || (log.metadata as any)?.details || "Audit sequence completed successfully."}
                  </p>
                  
                  <div className="flex items-center gap-1.5 py-1 scrollbar-hide overflow-x-auto">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter shrink-0">
                      Target :
                    </span>
                    <span className="text-[9px] font-bold text-slate-700 truncate group-hover:text-blue-600 transition-colors">
                      {targetName}
                    </span>
                  </div>
                </div>

                {/* Card Footer: System Metadata */}
                <div className="mt-4 pt-3 border-t border-black/[0.03] flex justify-between items-center">
                  <p className="text-[8px] font-medium text-slate-400 font-mono tracking-tight opacity-60 group-hover:opacity-100 transition-opacity">
                    {techString}
                  </p>
                  <div className="flex items-center gap-1 text-blue-500 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                    <span className="text-[8px] font-black uppercase tracking-tighter">View</span>
                    <i className="bx bx-right-arrow-alt text-sm" />
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}