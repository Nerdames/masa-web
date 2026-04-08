"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/* ==========================================================================
   Types
   ========================================================================== */

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface CorrelatedLog {
  id: string;
  action: string;
  description: string;
  severity: Severity;
  critical: boolean;
  createdAt: string;
  metadata: any;
}

export interface ForensicLog {
  id: string;
  action: string;
  description: string;
  module: "FINANCIAL" | "SECURITY" | "SYSTEM" | "INVENTORY";
  severity: Severity;
  critical: boolean;
  createdAt: string;
  actorId: string | null;
  actorType: "USER" | "SYSTEM";
  personnelName: string;
  personnelRole: string;
  personnelCode?: string;
  branchName?: string;
  target?: {
    id: string | null;
    type: string | null;
    name?: string;
    sku?: string;
    branch?: string;
  } | null;
  requestId: string | null;
  ipAddress: string;
  deviceInfo: string;
  diff: { before?: any; after?: any };
  integrity: { hash?: string | null; previousHash?: string | null; isChainValid?: boolean };
  correlatedLogs: CorrelatedLog[];
  metadata: any;
}

/* ==========================================================================
   Helpers
   ========================================================================== */

export const formatNaira = (amount: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(amount);

const getSeverityStyles = (severity: Severity) => {
  switch (severity) {
    case "CRITICAL":
      return "bg-red-600 text-white border-red-700";
    case "HIGH":
      return "bg-amber-500 text-white border-amber-600";
    case "MEDIUM":
      return "bg-blue-600 text-white border-blue-700";
    default:
      return "bg-slate-500 text-white border-slate-600";
  }
};

/* ==========================================================================
   Responsive sticky util
   ========================================================================== */

function computeStickyTop(): number {
  if (typeof window === "undefined") return 96;
  const h = window.innerHeight;
  if (h < 700) return 72;
  if (h < 900) return 96;
  if (h < 1200) return 112;
  return 128;
}

/* ==========================================================================
   Small components
   ========================================================================== */

const SignalNode = React.memo(
  ({
    log,
    isExpanded,
    isLast,
  }: {
    log: ForensicLog;
    isExpanded: boolean;
    isLast?: boolean;
  }) => {
    const isSecurity = log.module === "SECURITY" || log.severity === "CRITICAL";
    const initials =
      log.actorType === "SYSTEM"
        ? "SYS"
        : (log.personnelName || "??")
            .split(" ")
            .map((n) => n[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();

    const timeAMPM = new Date(log.createdAt).toLocaleTimeString([], {
      hour12: true,
      hour: "2-digit",
      minute: "2-digit",
    });

    const [topOffset, setTopOffset] = useState<number>(() => computeStickyTop());
    useEffect(() => {
      const onResize = () => setTopOffset(computeStickyTop());
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, []);

    return (
      <div className="relative w-10 md:w-14 shrink-0 flex justify-center">
        {!isLast && (
          <div
            className="absolute top-12 bottom-[-1.5rem] w-[1.5px] bg-slate-100 left-1/2 -translate-x-1/2 z-0"
            aria-hidden="true"
          />
        )}

        <div className="sticky z-20 flex flex-col items-center gap-1.5" style={{ top: `${topOffset}px` }}>
          <span className="text-[9px] md:text-[10px] font-mono font-bold text-slate-400 uppercase tracking-tighter">
            {timeAMPM}
          </span>

          <motion.div
            layout
            className={`relative z-20 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center bg-white border-2 transition-all duration-500 ${
              isExpanded ? "border-slate-900 scale-110 shadow-lg" : "border-slate-200 group-hover:border-slate-400"
            }`}
            role="img"
            aria-label={`actor ${log.personnelName || "system"}`}
          >
            <span className="text-[10px] md:text-[11px] font-black tracking-tighter text-slate-700">{initials}</span>

            <div
              className={`absolute -inset-1 rounded-full border border-dashed transition-opacity duration-500 ${
                isSecurity ? "border-red-400 opacity-100" : "border-emerald-400 opacity-20"
              }`}
            />

            {isSecurity && <div className="absolute -inset-2 bg-red-500/10 rounded-full animate-ping pointer-events-none" />}
          </motion.div>
        </div>
      </div>
    );
  }
);
SignalNode.displayName = "SignalNode";

/* ==========================================================================
   ForensicPacket
   ========================================================================== */

const ForensicPacket = React.memo(function ForensicPacket({
  log,
  similarCount,
  isActiveFilter,
  onFilterSimilar,
}: {
  log: ForensicLog;
  similarCount: number;
  isActiveFilter: boolean;
  onFilterSimilar: (action: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const { dispatch } = useAlerts();

  const handleCopy = useCallback(
    async (e: React.MouseEvent, content: any, type: string) => {
      e.stopPropagation();
      try {
        const text = typeof content === "string" ? content : JSON.stringify(content, null, 2);
        if (!navigator.clipboard) throw new Error("Clipboard not available");
        await navigator.clipboard.writeText(text);
        setCopiedType(type);
        dispatch?.({ kind: "TOAST", type: "INFO", title: "Copied", message: `${type} copied to clipboard.`, notificationId: "" });
        setTimeout(() => setCopiedType(null), 2000);
      } catch {
        dispatch?.({ kind: "TOAST", type: "SECURITY", title: "Copy Failed", message: "Unable to copy to clipboard.", notificationId: "" });
      }
    },
    [dispatch]
  );

  const maskedIp = (() => {
    try {
      if (!log.ipAddress) return "N/A";
      const parts = log.ipAddress.split(".");
      if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.${parts[3]}`;
      return log.ipAddress.slice(0, 12) + (log.ipAddress.length > 12 ? "…" : "");
    } catch {
      return "N/A";
    }
  })();

  const deviceSummary = (() => {
    if (!log.deviceInfo) return "Unknown device";
    return log.deviceInfo.length > 28 ? `${log.deviceInfo.slice(0, 28)}…` : log.deviceInfo;
  })();

  return (
    <div className="group relative flex min-h-[100px] md:min-h-[120px]" role="listitem" aria-expanded={isOpen}>
      <SignalNode log={log} isExpanded={isOpen} />

      <div className="flex-1 py-4 md:py-6 pl-4 md:pl-8 pr-2 md:pr-4 min-w-0">
        <div
          onClick={() => setIsOpen((v) => !v)}
          className={`cursor-pointer transition-all duration-300 border-l-2 pl-4 md:pl-6 ${
            isOpen ? "border-slate-900 translate-x-1 md:translate-x-2" : "border-transparent hover:border-slate-200"
          }`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setIsOpen((v) => !v);
          }}
          role="button"
          aria-pressed={isOpen}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              <span
                className={`text-[8px] md:text-[9px] font-black px-1.5 md:px-2 py-0.5 rounded-sm tracking-widest uppercase ${
                  log.severity === "CRITICAL"
                    ? "bg-red-600 text-white"
                    : log.severity === "HIGH"
                    ? "bg-amber-500 text-white"
                    : log.module === "FINANCIAL"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
                aria-hidden
              >
                {log.severity}
              </span>

              <h3
                className="text-[11px] md:text-xs font-black uppercase tracking-tight text-slate-900 truncate max-w-[200px] md:max-w-none"
                title={log.action.replace(/_/g, " ")}
              >
                {log.action.replace(/_/g, " ")}
              </h3>
            </div>

            {/* Compact IP & Device strip (visible collapsed) */}
            <div className="mt-2">
              <div className="flex items-center gap-3 text-[10px] text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] text-slate-400">Originator</span>
                  <span className="text-[10px] font-bold text-slate-900">
                    {log.actorType === "SYSTEM" 
                      ? "SYSTEM" 
                      : `${log.personnelName || "Unknown"}${log.personnelCode ? ` (${log.personnelCode})` : ""}`
                    }
                  </span>
                </div>

                <div className="ml-4 px-2 py-1 rounded bg-slate-50 text-[9px] text-slate-600 border border-slate-100">
                  <span className="font-mono">System generated log</span>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-3 text-[9px] text-slate-400">
                <div className="px-2 py-1 rounded bg-slate-50 border border-slate-100">
                  <span className="font-mono">IP</span>
                  <span className="ml-2 font-bold text-slate-700">{maskedIp}</span>
                </div>
                <div className="px-2 py-1 rounded bg-slate-50 border border-slate-100">
                  <span className="font-mono">Device</span>
                  <span className="ml-2 font-bold text-slate-700">{deviceSummary}</span>
                </div>

                <div className="ml-auto text-[9px] text-slate-500 font-mono">
                  <span className="font-bold text-slate-900">#{log.requestId?.slice(-8).toUpperCase() || "6627EAD6"}</span>
                </div>

                <div className="ml-2">
                  <span className="text-[9px] font-black uppercase px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                    {similarCount} Similar Case{similarCount !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4 mt-3">
              <div className="md:col-span-2">
                <p className="text-[8px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Originator</p>
                {log.actorType === "SYSTEM" ? (
                  <span className="text-[10px] md:text-[11px] font-medium text-slate-700 italic">SYSTEM</span>
                ) : (
                  <div className="text-[10px] md:text-[11px] font-medium text-slate-700 truncate">
                    <span className="font-bold text-slate-900">{log.personnelName || "Unknown"}</span>
                    {log.personnelCode && <span className="text-slate-400 ml-1">({log.personnelCode})</span>}
                    <span className="text-slate-300 mx-1.5">|</span>
                    <span className="text-slate-700">
                      Role: <span className="font-bold text-slate-900">{log.personnelRole || "Unknown"}</span>
                    </span>
                  </div>
                )}
              </div>

              <div className="hidden md:block md:col-span-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Target_Resource</p>
                <div className="text-[10px] md:text-[11px] font-medium text-slate-700 truncate">
                  {log.target?.type ? (
                    <>
                      <span className="font-bold text-slate-900 uppercase">{log.target.type}</span>
                      <span className="text-slate-400 uppercase">/{log.target.branch || "GLOBAL"}</span>
                      <span className="text-slate-300 mx-1.5">|</span>
                      <span className="text-slate-800">{log.target.name || log.target.id?.slice(-8).toUpperCase() || "UNNAMED"}</span>
                    </>
                  ) : (
                    <span className="italic text-slate-400">SYSTEM_WIDE</span>
                  )}
                </div>
              </div>

              <div className="flex justify-end items-center">
                <i className={`bx ${isOpen ? "bx-chevron-up" : "bx-expand"} text-slate-300 text-lg`} aria-hidden />
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between mt-2 gap-3">
              <div className="flex items-center gap-2 overflow-hidden">
                <p className="text-[10px] md:text-[11px] text-slate-500 truncate">{log.description}</p>
                <button
                  onClick={(e) => handleCopy(e, log.requestId || "INTERNAL", "trace")}
                  className="hidden md:block text-[10px] text-slate-300 font-mono hover:text-slate-900 transition-colors shrink-0"
                  aria-label="Copy trace id"
                >
                  #{log.requestId?.slice(-8).toUpperCase() || "INTERNAL"} {copiedType === "trace" && "(COPIED)"}
                </button>
              </div>

              {(similarCount > 0 || isActiveFilter) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilterSimilar(log.action);
                  }}
                  className={`relative px-3 py-1 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all border shadow-sm flex items-center justify-center gap-1 w-fit ${getSeverityStyles(
                    log.severity
                  )} ${isActiveFilter ? "opacity-100 ring-2 ring-offset-1 ring-slate-200" : "hover:opacity-90"}`}
                  aria-pressed={isActiveFilter}
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
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
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
                    <button onClick={(e) => handleCopy(e, log.metadata || {}, "meta")} className="text-slate-400 hover:text-slate-900 transition-colors flex items-center gap-1" aria-label="Copy raw payload">
                      <span className="text-[8px] md:text-[9px] font-bold uppercase">{copiedType === "meta" ? "Copied!" : "Copy"}</span>
                      <i className={`bx ${copiedType === "meta" ? "bx-check" : "bx-copy"} text-base md:text-lg`} />
                    </button>
                  </div>

                  <pre className="text-[9px] md:text-[10px] font-mono text-slate-600 overflow-x-auto max-h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap md:whitespace-pre">
                    {JSON.stringify(log.metadata, null, 2) || "{}"}
                  </pre>
                </div>

                {/* Device & Network (expanded) */}
                <div className="bg-slate-50 p-3 md:p-4 rounded-sm border border-slate-100">
                  <h4 className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-3 tracking-widest">Device & Network</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <p className="text-[8px] text-slate-500 uppercase">IP Address</p>
                      <p className="text-[9px] md:text-[10px] font-mono text-slate-700 break-all">{log.ipAddress || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-slate-500 uppercase">Device</p>
                      <p className="text-[9px] md:text-[10px] font-mono text-slate-700 break-all">{log.deviceInfo || "N/A"}</p>
                    </div>
                  </div>
                </div>

                {/* 3. INTEGRITY HASH */}
                <div className="bg-slate-900 p-4 md:p-5 rounded-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5 md:opacity-10">
                    <i className="bx bx-shield-quarter text-4xl md:text-5xl text-white" />
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <h4 className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Audit_Integrity_Chain</h4>
                    {log.integrity?.isChainValid && <span className="bg-emerald-500/20 text-emerald-400 text-[7px] md:text-[8px] px-1.5 py-0.5 rounded-full font-bold">VERIFIED</span>}
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
                    {log.correlatedLogs && log.correlatedLogs.length > 0 ? (
                      log.correlatedLogs.map((hop) => (
                        <div key={hop.id} className="relative">
                          <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-slate-900 border-2 border-white" />
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-[9px] md:text-[10px] font-black uppercase text-slate-800">{hop.action}</span>
                            <span className="text-[7px] md:text-[8px] text-slate-400 font-mono">{new Date(hop.createdAt).toISOString()}</span>
                          </div>
                          <p className="text-[9px] md:text-[10px] text-slate-500 italic mt-0.5">{hop.description}</p>
                        </div>
                      ))
                    ) : (
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
  );
});
ForensicPacket.displayName = "ForensicPacket";

/* ==========================================================================
   Data fetching hook: supports pagination, abort, retry, deduplication
   ========================================================================== */

type FetchResult = { success: boolean; logs?: ForensicLog[]; nextCursor?: string };

function useForensicLogs(severity: string, query: string) {
  const [logs, setLogs] = useState<ForensicLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setLogs([]);
    setCursor(null);
    setHasMore(true);
    setError(null);
  }, []);

  useEffect(() => {
    reset();
  }, [severity, query, reset]);

  const fetchPage = useCallback(
    async (nextCursor: string | null = null) => {
      if (!hasMore && nextCursor) return;
      setIsLoading(true);
      setError(null);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const params = new URLSearchParams();
        if (severity && severity !== "ALL") params.set("severity", severity);
        if (query) params.set("q", query);
        if (nextCursor) params.set("cursor", nextCursor);

        const res = await fetch(`/api/audit/logs?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const data: FetchResult = await res.json();
        
        if (data.success) {
          setLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l.id));
            const newLogs = (data.logs || []).filter((l) => !existingIds.has(l.id));
            return [...prev, ...newLogs];
          });
          setCursor(data.nextCursor || null);
          setHasMore(Boolean(data.nextCursor));
        } else {
          setError("Failed to load logs");
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          // ignore
        } else {
          setError(err.message || "Network error");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [severity, query, hasMore]
  );

  return { logs, isLoading, error, fetchPage, hasMore, reset };
}

function SeverityFilters({ logs, severityFilter, setSeverityFilter, setActionFilter, setSearchQuery }: any) {
  const formatCount = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1
    }).format(num);
  };

  const filterList = [
    { key: "ALL", label: "ALL", count: logs.length },
    { key: "CRITICAL", label: "CRITICAL", count: logs.filter((l: any) => l.severity === "CRITICAL").length },
    { key: "HIGH", label: "HIGH", count: logs.filter((l: any) => l.severity === "HIGH").length },
    { key: "MEDIUM", label: "MEDIUM", count: logs.filter((l: any) => l.severity === "MEDIUM").length },
    { key: "LOW", label: "LOW", count: logs.filter((l: any) => l.severity === "LOW").length },
  ];

  return (
    <div
      className="flex items-center gap-2 sm:gap-4 md:gap-6 overflow-x-auto whitespace-nowrap scrollbar-hide"
      style={{ msOverflowStyle: "none", scrollbarWidth: "none" }}
    >
      {filterList.map((s, idx) => {
        const isActive = severityFilter === s.key;

        return (
          <React.Fragment key={s.key}>
            {idx > 0 && <div className="w-px h-3 bg-black/10 self-center shrink-0" />}

            <button
              onClick={() => {
                setSeverityFilter(s.key);
                setActionFilter(null);
                setSearchQuery("");
              }}
              className={`group flex items-center gap-2 transition-all shrink-0 relative border-b-2 min-h-[30px] ${
                isActive
                  ? "text-blue-600 border-blue-600"
                  : "text-slate-400 border-transparent hover:text-slate-600"
              }`}
              aria-pressed={isActive}
            >
              <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest">
                {s.label}
              </span>

              <span className={`
                min-w-[34px] text-center px-1.5 py-0.5 rounded-md text-[9px] md:text-[10px] font-bold tabular-nums transition-colors
                ${isActive ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"}
              `}>
                {formatCount(s.count)}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   Main page
   ========================================================================== */

export default function ForensicAuditPage() {
  const { dispatch } = useAlerts();
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");


  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setIsOnline(navigator.onLine);

        const onOnline = () => setIsOnline(true);
        const onOffline = () => setIsOnline(false);
        window.addEventListener("online", onOnline);
        window.addEventListener("offline", onOffline);
        return () => {
          window.removeEventListener("online", onOnline);
          window.removeEventListener("offline", onOffline);
        };
      }, []);

  const { logs, isLoading, error, fetchPage, hasMore, reset } = useForensicLogs(severityFilter, debouncedQuery);

  useEffect(() => {
    fetchPage(null);
  }, [fetchPage, severityFilter, debouncedQuery]);

  useEffect(() => {
    if (error) {
      dispatch?.({
        kind: "TOAST",
        type: "SECURITY",
        title: "Link Failure",
        message: "Failed to establish secure connection to audit ledger.",
        notificationId: "",
      });
    }
  }, [error, dispatch]);

  const handleFilterSimilar = useCallback(
    (action: string) => {
      if (actionFilter === action) {
        setActionFilter(null);
        setSearchQuery("");
      } else {
        setActionFilter(action);
        setSearchQuery(action);
      }
    },
    [actionFilter]
  );

  const actionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach((log) => {
      counts[log.action] = (counts[log.action] || 0) + 1;
    });
    return counts;
  }, [logs]);

  const filteredGroupedLogs = useMemo(() => {
    const query = (debouncedQuery || actionFilter || "").toLowerCase();
    const filtered = logs.filter((log) => {
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
      const date = new Date(log.createdAt).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      if (!acc[date]) acc[date] = [];
      acc[date].push(log);
      return acc;
    }, {});
  }, [logs, debouncedQuery, actionFilter]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!hasMore || isLoading) return;
      const bottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 300;
      if (bottom) fetchPage();
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [fetchPage, hasMore, isLoading]);

  return (
    <div className="flex flex-col h-full w-full bg-white relative z-0 overflow-hidden">
      <header className="w-full flex flex-col bg-white border-b border-black/[0.04]">
        {/* LAYER 1: The Main Top Bar */}
        <div className="sticky top-0 z-[120] bg-white flex items-center justify-between gap-4 px-4 py-3 min-w-0">

          {/* Left Side: Title - flex-1 on mobile, flex-none on desktop to prevent center shift */}
          <div className="min-w-0 flex-1 md:flex-none">
            <h1
              className="truncate text-[18px] font-semibold text-slate-900"
              title="MASA Forensic Audit Terminal"
            >
              MASA Forensics
            </h1>
          </div>

          {/* MIDDLE: Filters (Desktop View Only) */}
          <div className="hidden md:flex flex-1 justify-center px-4 overflow-hidden">
            <SeverityFilters
              logs={logs}
              severityFilter={severityFilter}
              setSeverityFilter={setSeverityFilter}
              setActionFilter={setActionFilter}
              setSearchQuery={setSearchQuery}
            />
          </div>

          {/* Right Side: Search & Refresh */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:relative sm:block">
              <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (actionFilter && e.target.value !== actionFilter) setActionFilter(null);
                }}
                placeholder="TRACE_ID..."
                className="bg-slate-100 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-32 md:w-48 lg:w-64 rounded-lg focus:ring-1 focus:ring-black transition-all outline-none"
              />
            </div>

            <button
              onClick={() => { reset(); fetchPage(null); }}
              className="p-2 text-[12px] font-semibold border rounded-lg transition-colors flex items-center justify-center bg-white border-black/5 text-slate-500 hover:bg-slate-50 shadow-sm shrink-0"
              title="Refresh Ledger"
            >
              <i className={`bx bx-refresh text-lg md:text-sm ${isLoading ? "bx-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* LAYER 2: The Filter Bar (Mobile View Only) */}
        <div className="md:hidden sticky top-[53px] z-[115] bg-white/95 px-4 py-3 border-t border-black/[0.02]">
          <SeverityFilters
            logs={logs}
            severityFilter={severityFilter}
            setSeverityFilter={setSeverityFilter}
            setActionFilter={setActionFilter}
            setSearchQuery={setSearchQuery}
          />
        </div>
      </header>

      <div
              ref={containerRef}
              className="mx-auto px-4 md:px-8 py-8 md:py-12 overflow-y-auto flex-1 w-full max-w-7xl scrollbar-hide bg-white"
              role="list"
              aria-label="Forensic logs list"
            >
              {/* FIX 2: Only render the offline indicator if mounted is true */}
              {mounted && !isOnline && (
                <div className="mb-8 flex items-center justify-center gap-3">
                  <span className="h-1 w-1 rounded-full bg-amber-500 animate-ping" />
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-[0.2em]">
                    Offline Mode — Local Buffer
                  </span>
                </div>
              )}

              {isLoading && logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-48">
                  <div className="relative mb-10">
                    <div className="h-10 w-10 border-[1px] border-slate-100 rounded-full" />
                    <div className="absolute top-0 h-10 w-10 border-t-[1px] border-blue-600 rounded-full animate-spin" />
                  </div>
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.8em] text-slate-900 ml-[0.8em]">
                    Synchronizing
                  </h3>
                </div>
        ) : Object.keys(filteredGroupedLogs).length === 0 ? (
          /* 2. Empty State */
          <div className="flex flex-col items-center justify-center py-40">
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em]">
              No traces found
            </span>

            <div className="mt-6 flex items-center gap-6">
              {(actionFilter || searchQuery) && (
                <button
                  onClick={() => { setActionFilter(null); setSearchQuery(""); }}
                  className="text-[10px] font-black text-slate-900 uppercase tracking-widest hover:text-blue-600 transition-colors"
                >
                  Reset
                </button>
              )}
              {!isLoading && (
                <button
                  onClick={() => { reset(); fetchPage(null); }}
                  className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-slate-900 transition-colors"
                >
                  Re-sync
                </button>
              )}
            </div>
          </div>
        ) : (
          /* 3. Grouped Logs */
          <div className="space-y-20">
            {Object.entries(filteredGroupedLogs).map(([date, entries]) => (
              <div key={date}>
                {/* Subtle Floating Date Header */}
                <div className="flex justify-center mb-12">
                  <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.6em] ml-[0.6em]">
                    {date}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {entries.map((log) => (
                    <Suspense key={log.id} fallback={<div className="h-16 opacity-10" />}>
                      <div className="transition-opacity duration-300 hover:opacity-80">
                        <ForensicPacket
                          log={log}
                          similarCount={actionCounts[log.action] ? actionCounts[log.action] - 1 : 0}
                          isActiveFilter={actionFilter === log.action}
                          onFilterSimilar={handleFilterSimilar}
                        />
                      </div>
                    </Suspense>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Footer */}
        <div className="flex justify-center mt-24 pb-12">
          {hasMore ? (
            <button
              onClick={() => fetchPage()}
              disabled={isLoading}
              className="flex flex-col items-center gap-2 group disabled:opacity-30"
            >
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-900 group-hover:text-blue-600 transition-colors">
                {isLoading ? "Syncing" : "More"}
              </span>
              {!isLoading && <i className="bx bx-chevron-down text-slate-400 group-hover:translate-y-1 transition-transform" />}
            </button>
          ) : (
            <span className="text-[9px] font-bold uppercase tracking-[0.5em] text-slate-200">
              Buffer Complete
            </span>
          )}
        </div>
      </div>
    </div>
  );
}