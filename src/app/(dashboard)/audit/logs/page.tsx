"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { usePermission } from "@/core/hooks/usePermission"; // Adjust path to your permission hook
import { Severity, ActorType, Resource } from "@prisma/client";

/* ==========================================================================
   Types (Strictly bound to API Contract)
   ========================================================================== */

export interface CorrelatedLog {
  id: string;
  action: string;
  severity: Severity;
  critical: boolean;
  telemetry: {
    createdAt: string;
    requestId: string;
    approvalId: string | null;
    metadata: Record<string, any>;
  };
}

export interface AuditTracePacket {
  id: string;
  action: string;
  description: string;
  module: "SECURITY" | "FINANCIAL" | "INVENTORY" | "SYSTEM";
  severity: Severity;
  critical: boolean;
  
  actor: {
    id: string | null;
    type: ActorType;
    name: string;
    role: string;
    staffCode?: string;
  };

  context: {
    branchName: string;
    ipAddress: string;
    deviceInfo: string;
    locationContext?: string;
  };

  target: {
    id: string | null;
    type: string | null;
  };

  telemetry: {
    createdAt: string;
    requestId: string;
    approvalId: string | null;
    metadata: Record<string, any>;
  };

  diff: {
    before: any | null;
    after: any | null;
  };

  integrity: {
    hash: string | null;
    previousHash: string | null;
    isChainValid: boolean;
  };

  correlatedLogs: CorrelatedLog[];
}

/* ==========================================================================
   Helpers
   ========================================================================== */

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

function computeStickyTop(): number {
  if (typeof window === "undefined") return 96;
  const h = window.innerHeight;
  if (h < 700) return 72;
  if (h < 900) return 96;
  if (h < 1200) return 112;
  return 128;
}

/* ==========================================================================
   Components
   ========================================================================== */

const SignalNode = React.memo(
  ({
    log,
    isExpanded,
    isLast,
  }: {
    log: AuditTracePacket;
    isExpanded: boolean;
    isLast?: boolean;
  }) => {
    const isSecurity = log.module === "SECURITY" || log.severity === "CRITICAL";
    const initials =
      log.actor.type === "SYSTEM"
        ? "SYS"
        : (log.actor.name || "??")
            .split(" ")
            .map((n) => n[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();

    const timeAMPM = new Date(log.telemetry.createdAt).toLocaleTimeString([], {
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
            className="absolute top-12 bottom-[-1.5rem] w-[1.5px] bg-slate-200 left-1/2 -translate-x-1/2 z-0"
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
              isExpanded ? "border-slate-900 scale-110 shadow-lg" : "border-slate-300 group-hover:border-slate-500"
            }`}
          >
            <span className="text-[10px] md:text-[11px] font-black tracking-tighter text-slate-800">{initials}</span>

            <div
              className={`absolute -inset-1 rounded-full border border-dashed transition-opacity duration-500 ${
                isSecurity ? "border-red-500 opacity-100" : "border-emerald-500 opacity-20"
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

const ForensicPacket = React.memo(function ForensicPacket({
  log,
  similarCount,
  isActiveFilter,
  onFilterSimilar,
}: {
  log: AuditTracePacket;
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
      if (!log.context.ipAddress || log.context.ipAddress === "0.0.0.0") return "N/A";
      const parts = log.context.ipAddress.split(".");
      if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.${parts[3]}`;
      return log.context.ipAddress.slice(0, 12) + (log.context.ipAddress.length > 12 ? "…" : "");
    } catch {
      return "N/A";
    }
  })();

  const deviceSummary = log.context.deviceInfo.length > 28 ? `${log.context.deviceInfo.slice(0, 28)}…` : log.context.deviceInfo;

  return (
    <div className="group relative flex min-h-[100px] md:min-h-[120px]" role="listitem" aria-expanded={isOpen}>
      <SignalNode log={log} isExpanded={isOpen} />

      <div className="flex-1 py-4 md:py-6 pl-4 md:pl-8 pr-2 md:pr-4 min-w-0">
        <div
          onClick={() => setIsOpen((v) => !v)}
          className={`cursor-pointer transition-all duration-300 border-l-2 pl-4 md:pl-6 ${
            isOpen ? "border-slate-900 translate-x-1 md:translate-x-2" : "border-transparent hover:border-slate-300"
          }`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setIsOpen((v) => !v);
          }}
          role="button"
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
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {log.severity}
              </span>

              <h3 className="text-[11px] md:text-xs font-black uppercase tracking-tight text-slate-900 truncate max-w-[200px] md:max-w-none" title={log.action.replace(/_/g, " ")}>
                {log.action.replace(/_/g, " ")}
              </h3>
            </div>

            {/* Compact IP & Device strip */}
            <div className="mt-2">
              <div className="flex items-center gap-3 text-[10px] text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] text-slate-400">Originator</span>
                  <span className="text-[10px] font-bold text-slate-900">
                    {log.actor.type === "SYSTEM"
                      ? "SYSTEM_CORE"
                      : `${log.actor.name}${log.actor.staffCode ? ` (${log.actor.staffCode})` : ""}`
                    }
                  </span>
                </div>

                <div className="ml-4 px-2 py-1 rounded bg-slate-100 text-[9px] text-slate-700 border border-slate-200">
                  <span className="font-mono">{log.module} DOMAIN</span>
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
                  <span className="font-bold text-slate-900">#{log.telemetry.requestId.slice(-8).toUpperCase()}</span>
                </div>

                {similarCount > 0 && (
                  <div className="ml-2">
                    <span className="text-[9px] font-black uppercase px-2 py-1 rounded-full bg-slate-200 text-slate-800">
                      {similarCount} Similar Case{similarCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4 mt-3">
              <div className="md:col-span-2">
                <p className="text-[8px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Originator</p>
                {log.actor.type === "SYSTEM" ? (
                  <span className="text-[10px] md:text-[11px] font-medium text-slate-700 italic">SYSTEM</span>
                ) : (
                  <div className="text-[10px] md:text-[11px] font-medium text-slate-700 truncate">
                    <span className="font-bold text-slate-900">{log.actor.name}</span>
                    {log.actor.staffCode && <span className="text-slate-500 ml-1">({log.actor.staffCode})</span>}
                    <span className="text-slate-300 mx-1.5">|</span>
                    <span className="text-slate-700">
                      Role: <span className="font-bold text-slate-900">{log.actor.role}</span>
                    </span>
                  </div>
                )}
              </div>

              <div className="hidden md:block md:col-span-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Target/Resource</p>
                <div className="text-[10px] md:text-[11px] font-medium text-slate-700 truncate">
                  {log.target.type ? (
                    <>
                      <span className="font-bold text-slate-900 uppercase">{log.target.type}</span>
                      <span className="text-slate-500 uppercase">/{log.context.branchName}</span>
                      <span className="text-slate-300 mx-1.5">|</span>
                      <span className="text-slate-800">{log.target.id?.slice(-8).toUpperCase() || "UNNAMED"}</span>
                    </>
                  ) : (
                    <span className="italic text-slate-400">SYSTEM_WIDE</span>
                  )}
                </div>
              </div>

              <div className="flex justify-end items-center">
                <i className={`bx ${isOpen ? "bx-chevron-up" : "bx-expand"} text-slate-400 text-lg`} />
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between mt-2 gap-3">
            <div className="flex items-center gap-2 overflow-hidden">
              <p className="text-[10px] md:text-[11px] text-slate-600 truncate font-medium">{log.description}</p>
            </div>

            {(similarCount > 0 || isActiveFilter) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFilterSimilar(log.action);
                }}
                className={`relative px-3 py-1 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all border shadow-sm flex items-center justify-center gap-1 w-fit ${getSeverityStyles(
                  log.severity
                )} ${isActiveFilter ? "opacity-100 ring-2 ring-offset-1 ring-slate-400" : "hover:opacity-90"}`}
              >
                {isActiveFilter ? (
                  <>
                    CLOSE_TRACE
                    <i className="bx bx-x text-sm leading-none ml-1" />
                  </>
                ) : (
                  <>
                    <i className="bx bx-filter-alt" />
                    {similarCount} Similar
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-6 md:mt-8 pt-6 md:pt-8 border-t border-slate-200 space-y-6 md:space-y-8 cursor-default pb-4">
                
                {/* 1. STATE DIFFING */}
                {(log.diff.before || log.diff.after) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-3 md:p-4 rounded-sm border border-slate-200">
                      <h4 className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase mb-3 tracking-widest">State_Before</h4>
                      <pre className="text-[9px] md:text-[10px] font-mono text-slate-600 overflow-x-auto whitespace-pre-wrap md:whitespace-pre">
                        {log.diff.before ? JSON.stringify(log.diff.before, null, 2) : "N/A (CREATION_EVENT)"}
                      </pre>
                    </div>

                    <div className="bg-emerald-50/50 p-3 md:p-4 rounded-sm border border-emerald-100 border-l-emerald-500 border-l-4">
                      <h4 className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase mb-3 tracking-widest">State_After</h4>
                      <pre className="text-[9px] md:text-[10px] font-mono text-emerald-900 overflow-x-auto whitespace-pre-wrap md:whitespace-pre">
                        {log.diff.after ? JSON.stringify(log.diff.after, null, 2) : "N/A (DELETION_EVENT)"}
                      </pre>
                    </div>
                  </div>
                )}

                {/* 2. RAW METADATA */}
                <div className="bg-slate-50 p-3 md:p-4 rounded-sm border border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest">Telemetry_Metadata</h4>
                    <button onClick={(e) => handleCopy(e, log.telemetry.metadata, "meta")} className="text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1">
                      <span className="text-[8px] md:text-[9px] font-bold uppercase">{copiedType === "meta" ? "Copied!" : "Copy"}</span>
                      <i className={`bx ${copiedType === "meta" ? "bx-check" : "bx-copy"} text-base md:text-lg`} />
                    </button>
                  </div>
                  <pre className="text-[9px] md:text-[10px] font-mono text-slate-700 overflow-x-auto max-h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap md:whitespace-pre">
                    {JSON.stringify(log.telemetry.metadata, null, 2) || "{}"}
                  </pre>
                </div>

                {/* Device & Network */}
                <div className="bg-slate-50 p-3 md:p-4 rounded-sm border border-slate-200">
                  <h4 className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase mb-3 tracking-widest">Device & Network</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <p className="text-[8px] text-slate-500 uppercase">IP Address</p>
                      <p className="text-[9px] md:text-[10px] font-mono text-slate-800 break-all">{log.context.ipAddress || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-slate-500 uppercase">Device Context</p>
                      <p className="text-[9px] md:text-[10px] font-mono text-slate-800 break-all">{log.context.deviceInfo || "N/A"}</p>
                    </div>
                  </div>
                </div>

                {/* 3. INTEGRITY HASH */}
                <div className="bg-slate-900 p-4 md:p-5 rounded-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <i className="bx bx-shield-quarter text-4xl md:text-5xl text-white" />
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <h4 className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Audit_Integrity_Chain</h4>
                    {log.integrity.isChainValid && <span className="bg-emerald-500/20 text-emerald-400 text-[7px] md:text-[8px] px-1.5 py-0.5 rounded-full font-bold border border-emerald-500/30">VERIFIED</span>}
                  </div>

                  <div className="space-y-3 font-mono">
                    <div>
                      <p className="text-[7px] md:text-[8px] text-slate-500 uppercase">Current_Hash</p>
                      <p className="text-[9px] md:text-[10px] text-emerald-400 break-all">{log.integrity.hash || "UNHASHED_LOG"}</p>
                    </div>

                    <div className="hidden md:block">
                      <p className="text-[8px] text-slate-500 uppercase">Previous_Block_Hash</p>
                      <p className="text-[10px] text-slate-400 break-all">{log.integrity.previousHash || "GENESIS_ENTRY"}</p>
                    </div>
                  </div>
                </div>

                {/* 4. CORRELATED HOPS */}
                <div className="space-y-4">
                  <h4 className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Downstream_Hops</h4>
                  <div className="space-y-4 pl-4 border-l-2 border-slate-200">
                    {log.correlatedLogs && log.correlatedLogs.length > 0 ? (
                      log.correlatedLogs.map((hop) => (
                        <div key={hop.id} className="relative">
                          <div className="absolute -left-[22px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-900 border-2 border-white" />
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-[9px] md:text-[10px] font-black uppercase text-slate-800">{hop.action}</span>
                            <span className="text-[7px] md:text-[8px] text-slate-400 font-mono">{new Date(hop.telemetry.createdAt).toISOString()}</span>
                          </div>
                          <p className="text-[9px] md:text-[10px] text-slate-600 italic mt-0.5 font-mono">
                            Trace Link: {hop.telemetry.requestId}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[9px] font-bold text-slate-400 italic">No secondary hops detected for this TraceID.</p>
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
   Data Engine (Reacts to new Payload Schema)
   ========================================================================== */

type FetchResult = { success: boolean; data?: { logs: AuditTracePacket[]; pagination: { nextCursor?: string; hasMore: boolean } } };

function useForensicLogs(severity: string, query: string) {
  const [logs, setLogs] = useState<AuditTracePacket[]>([]);
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

        const result: FetchResult = await res.json();

        if (result.success && result.data) {
          const { logs: fetchedLogs, pagination } = result.data;
          setLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l.id));
            const newLogs = (fetchedLogs || []).filter((l) => !existingIds.has(l.id));
            return [...prev, ...newLogs];
          });
          setCursor(pagination.nextCursor || null);
          setHasMore(pagination.hasMore);
        } else {
          setError("Ledger integrity failure.");
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setError(err.message || "Network Error");
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
                  ? "text-slate-900 border-slate-900"
                  : "text-slate-400 border-transparent hover:text-slate-600"
              }`}
              aria-pressed={isActive}
            >
              <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest">
                {s.label}
              </span>

              <span className={`
                min-w-[34px] text-center px-1.5 py-0.5 rounded-md text-[9px] md:text-[10px] font-bold tabular-nums transition-colors
                ${isActive ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"}
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
   Main Page
   ========================================================================== */

export default function ForensicAuditPage() {
  const { dispatch } = useAlerts();
  
  // -- PERMISSION GATE --
  const { canSee, isLoading: authLoading } = usePermission();
  const hasAccess = canSee(Resource.AUDIT);

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
    // Only fetch if authenticated and cleared for Audit viewing
    if (!authLoading && hasAccess) {
        fetchPage(null);
    }
  }, [fetchPage, severityFilter, debouncedQuery, authLoading, hasAccess]);

  useEffect(() => {
    if (error) {
      dispatch?.({
        kind: "TOAST",
        type: "SECURITY",
        title: "Integrity Breach",
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
        log.actor.name.toLowerCase().includes(query) ||
        (log.telemetry.requestId && log.telemetry.requestId.toLowerCase().includes(query)) ||
        (log.target.id && log.target.id.toLowerCase().includes(query)) ||
        (log.integrity.hash && log.integrity.hash.toLowerCase().includes(query))
      );
    });

    return filtered.reduce((acc: Record<string, AuditTracePacket[]>, log) => {
      const date = new Date(log.telemetry.createdAt).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
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
      if (bottom) fetchPage(logs[logs.length - 1]?.id); // Trigger pagination
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [fetchPage, hasMore, isLoading, logs]);


  // --- RBAC LOCKOUT RENDERING ---
  if (authLoading) {
     return (
        <div className="flex h-full w-full items-center justify-center bg-white">
            <div className="flex flex-col items-center gap-4">
                <i className="bx bx-scan text-4xl text-slate-300 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Verifying Clearance</span>
            </div>
        </div>
     );
  }

  if (!hasAccess) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-slate-950">
            <div className="flex flex-col items-center text-center p-8 max-w-md">
                <i className="bx bx-lock-alt text-6xl text-red-500 mb-6" />
                <h1 className="text-xl font-black text-white uppercase tracking-widest mb-2">Access Denied</h1>
                <p className="text-xs text-slate-400 font-mono leading-relaxed">
                    You do not possess the required cryptographic clearance to view the Forensic Audit Ledger. Incident logged.
                </p>
            </div>
        </div>
      );
  }


  return (
    <div className="flex flex-col h-full w-full bg-white relative z-0 overflow-hidden">
      <header className="w-full flex flex-col bg-white border-b border-black/[0.06]">
        {/* Top Bar */}
        <div className="sticky top-0 z-[120] bg-white flex items-center justify-between gap-4 px-4 py-3 min-w-0">
          <div className="min-w-0 flex-1 md:flex-none flex items-center gap-3">
             <div className="h-8 w-8 bg-slate-900 rounded flex items-center justify-center shrink-0">
                 <i className="bx bx-shield-quarter text-white text-lg" />
             </div>
            <h1 className="truncate text-[16px] md:text-[18px] font-black uppercase tracking-tight text-slate-900">
              Forensic Audit
            </h1>
          </div>

          <div className="hidden md:flex flex-1 justify-center px-4 overflow-hidden">
            <SeverityFilters
              logs={logs}
              severityFilter={severityFilter}
              setSeverityFilter={setSeverityFilter}
              setActionFilter={setActionFilter}
              setSearchQuery={setSearchQuery}
            />
          </div>

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
                placeholder="TRACE_ID or ACTION..."
                className="bg-slate-100 border-none py-1.5 pl-8 pr-4 text-[11px] font-bold text-slate-800 w-32 md:w-56 rounded-md focus:ring-2 focus:ring-slate-900 transition-all outline-none"
              />
            </div>

            <button
              onClick={() => { reset(); fetchPage(null); }}
              className="p-2 text-[12px] font-bold border rounded-md transition-all flex items-center justify-center bg-white border-slate-200 text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 shadow-sm shrink-0"
              title="Refresh Ledger"
            >
              <i className={`bx bx-refresh text-lg md:text-sm ${isLoading ? "bx-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Mobile Filter Bar */}
        <div className="md:hidden sticky top-[53px] z-[115] bg-white/95 px-4 py-3 border-t border-black/[0.04]">
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
        className="mx-auto px-4 md:px-8 py-8 md:py-12 overflow-y-auto flex-1 w-full max-w-6xl scrollbar-hide bg-white"
        role="list"
      >
        {mounted && !isOnline && (
          <div className="mb-8 flex items-center justify-center gap-3 bg-amber-50 py-3 rounded border border-amber-100">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
            <span className="text-[10px] font-black text-amber-700 uppercase tracking-[0.2em]">
              Operating From Local Cache
            </span>
          </div>
        )}

        {isLoading && logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-48">
            <div className="relative mb-10">
              <div className="h-12 w-12 border-2 border-slate-100 rounded-full" />
              <div className="absolute top-0 h-12 w-12 border-t-2 border-slate-900 rounded-full animate-spin" />
            </div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.8em] text-slate-900 ml-[0.8em]">
              Decrypting Ledger
            </h3>
          </div>
        ) : Object.keys(filteredGroupedLogs).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40">
             <i className="bx bx-data text-5xl text-slate-200 mb-6" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              Ledger is Empty
            </span>

            <div className="mt-8 flex items-center gap-6">
              {(actionFilter || searchQuery) && (
                <button
                  onClick={() => { setActionFilter(null); setSearchQuery(""); }}
                  className="px-4 py-2 bg-slate-100 rounded-md text-[10px] font-black text-slate-900 uppercase tracking-widest hover:bg-slate-200 transition-colors"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-20">
            {Object.entries(filteredGroupedLogs).map(([date, entries]) => (
              <div key={date}>
                <div className="flex justify-center mb-12 relative">
                   <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-100 -z-10" />
                  <span className="bg-white px-4 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.6em] ml-[0.6em]">
                    {date}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {entries.map((log) => (
                    <Suspense key={log.id} fallback={<div className="h-20 bg-slate-50 rounded animate-pulse" />}>
                      <div className="transition-opacity duration-300 hover:opacity-90">
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

        <div className="flex justify-center mt-24 pb-12">
          {hasMore ? (
            <button
              onClick={() => fetchPage(logs[logs.length - 1]?.id)}
              disabled={isLoading}
              className="flex flex-col items-center gap-2 group disabled:opacity-30 p-4 border border-slate-200 rounded-md hover:border-slate-900 transition-colors"
            >
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-900 transition-colors">
                {isLoading ? "Fetching" : "Load Historical"}
              </span>
            </button>
          ) : (
            <span className="text-[9px] font-black uppercase tracking-[0.5em] text-slate-300">
              Genesis Block Reached
            </span>
          )}
        </div>
      </div>
    </div>
  );
}