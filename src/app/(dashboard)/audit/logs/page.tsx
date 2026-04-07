"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import Link from "next/link";

/* ==========================================================================
   SYSTEM TYPES
   ========================================================================== */
interface CorrelatedLog {
  id: string;
  action: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  critical: boolean;
  createdAt: string;
  metadata: any;
}

interface ForensicLog {
  id: string;
  action: string;
  description: string;
  module: "FINANCIAL" | "SECURITY" | "SYSTEM" | "INVENTORY";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  critical: boolean;
  createdAt: string;
  actorId: string | null;
  actorType: "USER" | "SYSTEM";
  personnelName: string;
  personnelRole: string;
  target?: { id: string | null; type: string | null };
  requestId: string | null;
  ipAddress: string;
  deviceInfo: string;
  diff: { before: any; after: any };
  integrity: { hash: string | null; previousHash: string | null; isChainValid: boolean };
  correlatedLogs: CorrelatedLog[];
  metadata: any;
}

/* ==========================================================================
   THE SIGNAL NODE (TIMELINE SPINE)
   ========================================================================== */
const SignalNode = ({ log, isExpanded }: { log: ForensicLog; isExpanded: boolean }) => {
  const isSecurity = log.module === "SECURITY" || log.severity === "CRITICAL";

  return (
    <div className="relative w-10 md:w-12 shrink-0 flex justify-center">
      <div className="absolute inset-y-0 w-[1px] md:w-[2px] bg-slate-100 group-hover:bg-slate-200 transition-colors" />

      <div className="sticky top-1/2 -translate-y-1/2 z-10">
        <motion.div
          layout
          className={`relative w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center bg-white border-2 transition-all duration-500 ${
            isExpanded ? "border-slate-900 scale-110 shadow-lg" : "border-slate-200 group-hover:border-slate-400"
          }`}
        >
          <span className="text-[9px] md:text-[10px] font-black tracking-tighter">
            {log.actorType === "SYSTEM" ? "SYS" : log.personnelName.split(" ").map((n) => n[0]).join("").substring(0, 2)}
          </span>

          <div className={`absolute -inset-1 rounded-full border border-dashed ${
            isSecurity ? "border-red-400 opacity-100" : "border-emerald-400 opacity-20"
          }`} />

          {isSecurity && (
            <div className="absolute -inset-2 bg-red-500/10 rounded-full animate-ping" />
          )}
        </motion.div>
      </div>
    </div>
  );
};

/* ==========================================================================
   FORENSIC PACKET (THE DATA ROW)
   ========================================================================== */
const ForensicPacket = ({
  log,
  similarCount,
  isActiveFilter,
  onFilterSimilar,
}: {
  log: ForensicLog;
  similarCount: number;
  isActiveFilter: boolean;
  onFilterSimilar: (action: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const handleCopy = (e: React.MouseEvent, content: any, type: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(typeof content === "string" ? content : JSON.stringify(content, null, 2));
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case "CRITICAL": return "bg-red-600 text-white border-red-700";
      case "HIGH": return "bg-amber-500 text-white border-amber-600";
      case "MEDIUM": return "bg-blue-600 text-white border-blue-700";
      default: return "bg-slate-500 text-white border-slate-600";
    }
  };

  return (
    <div className="group relative flex min-h-[100px] md:min-h-[120px]">
      {/* Telemetry: Hidden on mobile, sticky on desktop */}
      <div className="hidden md:flex w-32 shrink-0 py-6 pr-6 text-right flex-col justify-start">
        <div className="sticky top-24">
          <p className="font-mono text-[11px] font-black text-slate-900 tabular-nums">
            {new Date(log.createdAt).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
          <p className="font-mono text-[9px] text-slate-400 mt-1 uppercase tracking-tighter">
            {log.ipAddress}
          </p>
        </div>
      </div>

      <SignalNode log={log} isExpanded={isOpen} />

      <div className="flex-1 py-4 md:py-6 pl-4 md:pl-8 pr-2 md:pr-4">
        <div
          onClick={() => setIsOpen(!isOpen)}
          className={`cursor-pointer transition-all duration-300 border-l-2 pl-4 md:pl-6 ${
            isOpen ? "border-slate-900 translate-x-1 md:translate-x-2" : "border-transparent hover:border-slate-200"
          }`}
        >
          <div className="flex flex-col gap-1">
            {/* Mobile-Only Telemetry Header */}
            <div className="flex md:hidden items-center justify-between mb-1">
               <span className="font-mono text-[10px] font-bold text-slate-400">
                {new Date(log.createdAt).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" })} — {log.ipAddress}
               </span>
            </div>

            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              <span className={`text-[8px] md:text-[9px] font-black px-1.5 md:px-2 py-0.5 rounded-sm tracking-widest uppercase ${
                log.severity === "CRITICAL" ? "bg-red-600 text-white" :
                log.severity === "HIGH" ? "bg-amber-500 text-white" :
                log.module === "FINANCIAL" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
              }`}>
                {log.severity}
              </span>
              <h3 className="text-[11px] md:text-xs font-black uppercase tracking-tight text-slate-900 truncate max-w-[200px] md:max-w-none">
                {log.action.replace(/_/g, " ")}
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4 mt-3">
              <div className="md:col-span-2">
                <p className="text-[8px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest">Originator</p>
                {log.actorType === "SYSTEM" ? (
                  <span className="text-[10px] md:text-[11px] font-medium text-slate-700 italic">SYSTEM_AUTOMATED</span>
                ) : (
                  <Link href={`/personnel/${log.actorId}`} className="text-[10px] md:text-[11px] font-medium text-slate-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                    {log.personnelName} <span className="text-slate-300 mx-1">|</span> {log.personnelRole}
                  </Link>
                )}
              </div>

              <div className="hidden md:block">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Target_Resource</p>
                <p className="text-[11px] font-mono text-slate-700">
                  {log.target?.type ? `${log.target.type} | ${log.target.id?.slice(-8).toUpperCase() || "N/A"}` : "SYSTEM_WIDE"}
                </p>
              </div>

              <div className="flex justify-end items-center">
                <i className={`bx ${isOpen ? "bx-chevron-up" : "bx-expand"} text-slate-300 text-lg`} />
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between mt-2 gap-3">
              <div className="flex items-center gap-2 overflow-hidden">
                <p className="text-[10px] md:text-[11px] text-slate-500 truncate">{log.description}</p>
                <button 
                  onClick={(e) => handleCopy(e, log.requestId, "trace")}
                  className="hidden md:block text-[10px] text-slate-300 font-mono hover:text-slate-900 transition-colors shrink-0"
                >
                  #{log.requestId?.slice(-8).toUpperCase() || "INTERNAL"} {copiedType === "trace" && "(COPIED)"}
                </button>
              </div>

              {(similarCount > 0 || isActiveFilter) && (
                <button
                  onClick={(e) => { e.stopPropagation(); onFilterSimilar(log.action); }}
                  className={`relative px-3 py-1 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all border shadow-sm flex items-center justify-center gap-1 w-fit ${getSeverityStyles(log.severity)} ${isActiveFilter ? "opacity-100 ring-2 ring-offset-1 ring-slate-200" : "hover:opacity-90"}`}
                >
                  {isActiveFilter ? (
                    <>
                      CLOSE_TRACE
                      <i className="bx bx-x text-sm leading-none ml-1" />
                    </>
                  ) : (
                    <>
                      <i className="bx bx-filter-alt" />
                      {similarCount} Similar Case{similarCount !== 1 ? "s" : ""}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-6 md:mt-8 pt-6 md:pt-8 border-t border-slate-100 space-y-6 md:space-y-8 cursor-default pb-4">
                  
                  {/* 1. STATE DIFFING */}
                  {(log.diff?.before || log.diff?.after) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-3 md:p-4 rounded-sm border border-slate-100">
                        <h4 className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-3 tracking-widest">State_Before</h4>
                        <pre className="text-[9px] md:text-[10px] font-mono text-slate-500 overflow-x-auto whitespace-pre-wrap md:whitespace-pre">
                          {log.diff.before ? JSON.stringify(log.diff.before, null, 2) : "N/A (CREATION_EVENT)"}
                        </pre>
                      </div>
                      <div className="bg-slate-50 p-3 md:p-4 rounded-sm border border-slate-100 border-l-emerald-500 border-l-4">
                        <h4 className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-3 tracking-widest">State_After</h4>
                        <pre className="text-[9px] md:text-[10px] font-mono text-emerald-800 overflow-x-auto whitespace-pre-wrap md:whitespace-pre">
                          {log.diff.after ? JSON.stringify(log.diff.after, null, 2) : "N/A (DELETION_EVENT)"}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* 2. RAW PAYLOAD */}
                  <div className="bg-slate-50 p-3 md:p-4 rounded-sm border border-slate-100 relative group/payload">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">Raw_Payload</h4>
                      <button
                        onClick={(e) => handleCopy(e, log.metadata, "meta")}
                        className="text-slate-400 hover:text-slate-900 transition-colors flex items-center gap-1"
                      >
                        <span className="text-[8px] md:text-[9px] font-bold uppercase">{copiedType === "meta" ? "Copied!" : "Copy"}</span>
                        <i className={`bx ${copiedType === "meta" ? "bx-check" : "bx-copy"} text-base md:text-lg`} />
                      </button>
                    </div>
                    <pre className="text-[9px] md:text-[10px] font-mono text-slate-600 overflow-x-auto max-h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap md:whitespace-pre">
                      {JSON.stringify(log.metadata, null, 2) || "{}"}
                    </pre>
                  </div>

                  {/* 3. INTEGRITY HASH */}
                  <div className="bg-slate-900 p-4 md:p-5 rounded-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5 md:opacity-10">
                      <i className="bx bx-shield-quarter text-4xl md:text-5xl text-white" />
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                        <h4 className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Audit_Integrity_Chain</h4>
                        {log.integrity?.isChainValid && (
                            <span className="bg-emerald-500/20 text-emerald-400 text-[7px] md:text-[8px] px-1.5 py-0.5 rounded-full font-bold">VERIFIED</span>
                        )}
                    </div>
                    <div className="space-y-3 font-mono">
                      <div>
                        <p className="text-[7px] md:text-[8px] text-slate-500 uppercase">Current_Hash</p>
                        <p className="text-[9px] md:text-[10px] text-emerald-400 break-all">{log.integrity?.hash || "UNHASHED_LOG"}</p>
                      </div>
                      <div className="hidden md:block">
                        <p className="text-[8px] text-slate-500 uppercase">Previous_Block_Hash</p>
                        <p className="text-[10px] text-slate-400 break-all">{log.integrity?.previousHash || "GENESIS_ENTRY"}</p>
                      </div>
                    </div>
                  </div>

                  {/* 4. CORRELATED HOPS */}
                  <div className="space-y-4">
                    <h4 className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Downstream_Hops</h4>
                    <div className="space-y-4 pl-4 border-l border-slate-200">
                      {log.correlatedLogs && log.correlatedLogs.length > 0 ? log.correlatedLogs.map((hop) => (
                        <div key={hop.id} className="relative">
                          <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-slate-900 border-2 border-white" />
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-[9px] md:text-[10px] font-black uppercase text-slate-800">{hop.action}</span>
                            <span className="text-[7px] md:text-[8px] text-slate-400 font-mono">{new Date(hop.createdAt).toISOString()}</span>
                          </div>
                          <p className="text-[9px] md:text-[10px] text-slate-500 italic mt-0.5">{hop.description}</p>
                        </div>
                      )) : (
                        <p className="text-[9px] font-bold text-slate-300 italic">No secondary hops detected for this TraceID.</p>
                      )}
                    </div>
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

/* ==========================================================================
   MAIN TERMINAL
   ========================================================================== */
export default function ForensicAuditPage() {
  const { dispatch } = useAlerts();
  const [logs, setLogs] = useState<ForensicLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/audit/logs?severity=${severityFilter}`);
      const data = await res.json();
      if (data.success) {
          setLogs(data.logs || []);
      }
    } catch (err) {
      dispatch({
        kind: "TOAST",
        type: "SECURITY",
        title: "Link Failure",
        message: "Failed to establish secure connection to audit ledger.",
        notificationId: ""
      });
    } finally {
      setIsLoading(false);
    }
  }, [severityFilter, dispatch]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleFilterSimilar = (action: string) => {
    if (actionFilter === action) {
      setActionFilter(null);
      setSearchQuery("");
    } else {
      setActionFilter(action);
      setSearchQuery(action);
    }
  };

  const actionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach(log => {
      counts[log.action] = (counts[log.action] || 0) + 1;
    });
    return counts;
  }, [logs]);

  const filteredGroupedLogs = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const filtered = logs.filter(log => {
      if (actionFilter && log.action !== actionFilter) return false;
      return (
        log.action.toLowerCase().includes(query) ||
        log.personnelName.toLowerCase().includes(query) ||
        (log.requestId && log.requestId.toLowerCase().includes(query)) ||
        (log.target?.id && log.target.id.toLowerCase().includes(query)) ||
        (log.integrity?.hash && log.integrity.hash.toLowerCase().includes(query))
      );
    });

    return filtered.reduce((acc: Record<string, ForensicLog[]>, log) => {
      const date = new Date(log.createdAt).toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
      });
      if (!acc[date]) acc[date] = [];
      acc[date].push(log);
      return acc;
    }, {});
  }, [logs, searchQuery, actionFilter]);

  return (
    <div className="flex flex-col h-full w-full bg-white relative z-0 overflow-hidden">
      <header className="px-4 py-4  shrink-0 border-b border-black/[0.04] bg-white sticky top-0 z-[100] backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          {/* Title: single-line, truncates, responsive size */}
          <div className="px-2 min-w-0 flex-1">
            <h1
               className="block w-full truncate text-[14px] sm:text-[15px] md:text-[18px] lg:text-2xl font-semibold tracking-tight text-slate-900 leading-tight"
              title="MASA Forensic Audit Terminal"
              aria-label="MASA Forensic Audit Terminal"
            >
              MASA Forensics
            </h1>
          </div>

          {/* Actions: Refresh & Search */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Search Bar - hidden on tiny mobile, visible sm+ */}
            <div className="hidden sm:relative sm:block">
              <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (actionFilter && e.target.value !== actionFilter) setActionFilter(null);
                }}
                placeholder="TRACE_ID_OR_HASH..."
                className="bg-slate-100 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-40 md:w-64 rounded-lg focus:ring-1 focus:ring-black transition-all outline-none"
              />
            </div>

            {/* Extreme Right Refresh Trigger */}
            <button
              onClick={() => fetchLogs()}
              title="Refresh Ledger"
              className="p-2 md:px-2 md:py-2 text-[12px] font-semibold border rounded-lg transition-colors flex justify-items-center gap-2 bg-white border-black/5 text-slate-500 hover:bg-slate-50 shadow-sm"
            >
              <i className={`bx bx-refresh text-base md:text-sm ${isLoading ? "bx-spin" : ""}`} />
            </button>
          </div>
        </div>

      {/* Filters Row - Combined labels with counts */}
      <div
        aria-label="severity filters"
        className="flex items-center justify-between md:justify-start gap-2 sm:gap-4 md:gap-6 mt-1 pt-4 border-t border-black/5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {[
          { key: "ALL", label: "ALL", count: logs.length },
          { key: "CRITICAL", label: "CRITICAL", count: logs.filter((l) => l.severity === "CRITICAL").length },
          { key: "HIGH", label: "HIGH", count: logs.filter((l) => l.severity === "HIGH").length },
          { key: "MEDIUM", label: "MEDIUM", count: logs.filter((l) => l.severity === "MEDIUM").length },
          { key: "LOW", label: "LOW", count: logs.filter((l) => l.severity === "LOW").length },
        ].map((s, idx) => (
          <React.Fragment key={s.key}>
            {idx > 0 && <div className="w-px h-3 bg-black/10 self-center shrink-0" />}
            <button
              onClick={() => {
                setSeverityFilter(s.key);
                setActionFilter(null);
                setSearchQuery("");
              }}
              className={`group flex items-baseline gap-1 sm:gap-1.5 transition-all shrink-0 ${
                severityFilter === s.key
                  ? "text-blue-600 underline underline-offset-[14px] decoration-2"
                  : "text-slate-400 hover:text-blue-600"
              }`}
            >
              <span className="text-[8px] sm:text-[10px] md:text-[11px] font-bold uppercase tracking-[0.1em] sm:tracking-[0.2em]">
                {s.label}
              </span>
              <span className={`text-[8px] md:text-[10px] font-medium tabular-nums ${
                severityFilter === s.key ? "text-slate-900" : "text-slate-300"
              }`}>
                {s.count}
              </span>
            </button>
          </React.Fragment>
        ))}
      </div>
      </header>

      <div className="max-w-[1100px] mx-auto px-4 md:px-6 py-8 md:py-12">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-40 opacity-30">
            <i className="bx bx-loader-alt bx-spin text-4xl mb-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.5em] text-center">Synchronizing_Nodes...</span>
          </div>
        ) : Object.keys(filteredGroupedLogs).length === 0 ? (
          <div className="text-center py-32 border border-dashed border-slate-200 rounded-lg">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-4">No matching traces in current buffer.</p>
            {(actionFilter || searchQuery) && (
              <button onClick={() => { setActionFilter(null); setSearchQuery(""); }} className="mt-4 text-[10px] font-bold text-slate-900 underline uppercase tracking-widest">
                Reset Ledger View
              </button>
            )}
          </div>
        ) : (
          Object.entries(filteredGroupedLogs).map(([date, entries]) => (
            <div key={date} className="mb-12 md:mb-16">
              <div className="relative mb-8 md:mb-12">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full h-[1px] bg-slate-100" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-[#FDFDFD] px-4 md:px-6 text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] md:tracking-[0.5em] text-center">
                    {date}
                  </span>
                </div>
              </div>

              <div className="flex flex-col">
                {entries.map(log => (
                  <ForensicPacket
                    key={log.id}
                    log={log}
                    similarCount={actionCounts[log.action] ? actionCounts[log.action] - 1 : 0}
                    isActiveFilter={actionFilter === log.action}
                    onFilterSimilar={handleFilterSimilar}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}