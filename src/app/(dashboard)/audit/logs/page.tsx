"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import Link from "next/link";

/* ==========================================================================\
    SYSTEM TYPES
   ========================================================================== */
interface TraceEvent {
  id: string;
  action: string;
  critical: boolean;
  createdAt: string;
  metadata?: { details?: string };
}

interface AuditLog {
  id: string;
  action: string;
  module: "FINANCIAL" | "SECURITY" | "SYSTEM" | "INVENTORY" | "ALL";
  personnelId: string;
  personnelName: string;
  personnelRole: string;
  ipAddress: string;
  deviceInfo: string;
  traceId: string;
  createdAt: string;
  similarEvents: TraceEvent[];
}

/* ==========================================================================\
    THE SIGNAL NODE (GPS/RADAR STYLE)
   ========================================================================== */
const SignalNode = ({ log, isExpanded }: { log: AuditLog; isExpanded: boolean }) => {
  const isSecurity = log.module === "SECURITY";
  
  return (
    <div className="relative w-12 shrink-0 flex justify-center">
      <div className="absolute inset-y-0 w-[2px] bg-slate-100 group-hover:bg-slate-200 transition-colors" />
      
      <div className="sticky top-1/2 -translate-y-1/2 z-10">
        <div className={`relative w-8 h-8 rounded-full flex items-center justify-center bg-white border-2 transition-all duration-500 ${
          isExpanded ? 'border-slate-900 scale-125' : 'border-slate-200 group-hover:border-slate-400'
        }`}>
          <span className="text-[10px] font-black tracking-tighter">
            {log.personnelName.split(' ').map(n => n[0]).join('').substring(0, 2)}
          </span>
          
          <div className={`absolute -inset-1 rounded-full border border-dashed animate-[spin_8s_linear_infinite] ${
            isSecurity ? 'border-red-400' : 'border-emerald-400 opacity-40'
          }`} />
          
          {isSecurity && (
            <div className="absolute -inset-2 bg-red-500/10 rounded-full animate-ping" />
          )}
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================\
    FORENSIC PACKET (THE DATA ROW)
   ========================================================================== */
const ForensicPacket = ({ log }: { log: AuditLog }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Safely parse the IP address to prevent runtime null crashes
  const ipParts = (log.ipAddress || "0.0.0.0").split('.');
  const lat1 = ipParts[2] || '00';
  const lat2 = ipParts[3] || '00';

  return (
    <div className="group relative flex min-h-[100px]">
      <div className="w-32 shrink-0 py-6 pr-6 text-right flex flex-col justify-start">
        <div className="sticky top-24">
          <p className="font-mono text-[11px] font-black text-slate-900 tabular-nums">
            {new Date(log.createdAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="font-mono text-[9px] text-slate-400 mt-1 uppercase tracking-tighter">
            LAT: {lat1}.{lat2}
          </p>
        </div>
      </div>

      <SignalNode log={log} isExpanded={isOpen} />

      <div className="flex-1 py-6 pl-8 pr-4">
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className={`cursor-pointer transition-all duration-300 border-l-2 pl-6 ${
            isOpen ? 'border-slate-900 translate-x-2' : 'border-transparent hover:border-slate-200'
          }`}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-sm tracking-widest uppercase ${
                log.module === 'SECURITY' ? 'bg-red-600 text-white' : 
                log.module === 'INVENTORY' ? 'bg-blue-600 text-white' :
                'bg-slate-100 text-slate-500'
              }`}>
                {log.module}
              </span>
              <h3 className="text-xs font-black uppercase tracking-tight text-slate-900">{log.action.replace(/_/g, " ")}</h3>
            </div>
            
            <div className="grid grid-cols-4 gap-4 mt-3">
              <div className="col-span-2">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Originator</p>
                {log.personnelId === "SYSTEM" ? (
                   <span className="text-[11px] font-medium text-slate-700 italic">
                      {log.personnelName} <span className="text-slate-300 mx-1">|</span> {log.personnelRole}
                   </span>
                ) : (
                   <Link href={`/personnel/${log.personnelId}`} className="text-[11px] font-medium text-slate-700 hover:text-black">
                      {log.personnelName} <span className="text-slate-300 mx-1">|</span> {log.personnelRole}
                   </Link>
                )}
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Packet_ID</p>
                <p className="text-[11px] font-mono text-slate-700">#{log.traceId.slice(-8).toUpperCase()}</p>
              </div>
              <div className="flex justify-end items-center">
                <i className={`bx ${isOpen ? 'bx-chevron-up' : 'bx-scan'} text-slate-300 text-lg`} />
              </div>
            </div>
          </div>

          <AnimatePresence>
            {isOpen && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-1 gap-4"
              >
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-2 opacity-5">
                      <i className="bx bx-fingerprint text-6xl" />
                   </div>
                   <h4 className="text-[9px] font-black text-slate-400 uppercase mb-3 tracking-[0.2em]">Downstream_Signal_Hops</h4>
                   <div className="space-y-4">
                     {log.similarEvents?.length > 0 ? log.similarEvents.map((ev) => (
                       <div key={ev.id} className="flex gap-4 items-start relative">
                         <div className="w-2 h-2 rounded-full bg-slate-900 mt-1 shrink-0" />
                         <div>
                            <p className="text-[10px] font-black text-slate-800 uppercase">{ev.action}</p>
                            <p className="text-[10px] text-slate-500 italic mt-0.5">{ev.metadata?.details || 'Standard verification hook.'}</p>
                            <p className="text-[8px] font-mono text-slate-300 mt-1">{new Date(ev.createdAt).toISOString()}</p>
                         </div>
                       </div>
                     )) : (
                        <p className="text-[9px] font-bold text-slate-300 uppercase italic">No secondary hops detected.</p>
                     )}
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================\
    MAIN TERMINAL
   ========================================================================== */
export default function ForensicAuditPage() {
  const { dispatch } = useAlerts();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/audit/logs?module=${filter}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      dispatch({ 
        kind: "TOAST", 
        type: "SECURITY", 
        title: "Sync Failure", 
        message: "Failed to pull latest forensic snapshots." 
      });
    } finally {
      setIsLoading(false);
    }
  }, [filter, dispatch]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filteredGroupedLogs = useMemo(() => {
    const filtered = logs.filter(log => 
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.personnelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.traceId.includes(searchQuery)
    );

    return filtered.reduce((acc: Record<string, AuditLog[]>, log) => {
      const date = new Date(log.createdAt).toLocaleDateString('en-US', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
      });
      if (!acc[date]) acc[date] = [];
      acc[date].push(log);
      return acc;
    }, {});
  }, [logs, searchQuery]);

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans selection:bg-black selection:text-white">
      <header className="h-20 px-10 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-xl z-[100]">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 flex items-center justify-center text-white rounded-br-2xl">
              <i className="bx bx-radar text-xl animate-pulse" />
            </div>
            <div>
                <h1 className="text-sm font-black uppercase tracking-tighter leading-none">Signal_Forensics</h1>
                <p className="text-[9px] font-bold text-slate-400 mt-1">STREAM_STATUS: <span className="text-emerald-500">ENCRYPTED_LIVE</span></p>
            </div>
          </div>
          
          <div className="hidden md:flex gap-4 border-l border-slate-100 pl-8">
             {["ALL", "FINANCIAL", "INVENTORY", "SECURITY", "SYSTEM"].map(m => (
                 <button 
                  key={m} 
                  onClick={() => setFilter(m)}
                  className={`text-[10px] font-black uppercase transition-colors tracking-widest ${
                    filter === m ? 'text-slate-900 underline underline-offset-4' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {m}
                </button>
             ))}
          </div>
        </div>

        <div className="flex gap-4">
            <div className="relative">
                <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="FILTER_TRACE..." 
                  className="bg-slate-100 border-none py-2.5 pl-9 pr-4 text-[10px] font-bold w-48 rounded-sm focus:ring-1 focus:ring-black transition-all" 
                />
            </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-10">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-40 opacity-20 animate-pulse">
            <i className="bx bx-loader-alt bx-spin text-4xl mb-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.4em]">Synchronizing_Nodes...</span>
          </div>
        ) : Object.keys(filteredGroupedLogs).length === 0 ? (
          <div className="text-center py-40 border border-dashed border-slate-200 rounded-3xl">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No matching signals found in buffer.</p>
          </div>
        ) : (
          Object.entries(filteredGroupedLogs).map(([date, entries]) => (
            <div key={date} className="mb-16">
              <div className="relative mb-12">
                  <div className="absolute inset-0 flex items-center">
                      <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                  </div>
                  <div className="relative flex justify-center">
                      <span className="bg-[#FDFDFD] px-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.5em]">
                        Timeline_Entry // {date}
                      </span>
                  </div>
              </div>

              <div className="flex flex-col">
                {entries.map(log => <ForensicPacket key={log.id} log={log} />)}
              </div>
            </div>
          ))
        )}

        <div className="flex justify-center py-20">
            <div className="flex flex-col items-center gap-4 opacity-20">
                <div className="w-1 h-12 bg-gradient-to-b from-slate-400 to-transparent" />
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 italic">End of live buffer</span>
            </div>
        </div>
      </main>
    </div>
  );
}