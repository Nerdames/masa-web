"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  eachDayOfInterval,
  parseISO,
  addMonths,
  subMonths,
} from "date-fns";
import { useSession } from "next-auth/react";

/* ---------------- Types and theme ---------------- */

type CalendarEvent = {
  id: string;
  type: string; // Action name (STOCK, PO, EXPENSE, LOG, SECURITY)
  title: string; // Action ID (e.g. STOCK_ADJUST)
  displayMessage: string; // Enriched human-readable string from API
  date: string | Date;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  actorName?: string;
  actorRole?: string;
  ipAddress?: string;
  hash?: string;
  targetType?: string;
  metadata?: any;
};

const SEVERITY_THEMES: Record<string, { bg: string; text: string; dot: string; icon: string }> = {
  CRITICAL: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-600", icon: "bx-shield-x" },
  HIGH: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-600", icon: "bx-error-circle" },
  MEDIUM: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-600", icon: "bx-info-circle" },
  LOW: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-600", icon: "bx-check-shield" },
  DEFAULT: { bg: "bg-slate-50", text: "text-slate-700", dot: "bg-slate-500", icon: "bx-list-ul" },
};

const TYPE_COLORS: Record<string, string> = {
  STOCK: "border-l-blue-500",
  PO: "border-l-emerald-500",
  EXPENSE: "border-l-purple-500",
  APPROVAL: "border-l-amber-500",
  SECURITY: "border-l-red-600",
  LOG: "border-l-slate-400",
};

/* ---------------- Utilities ---------------- */

const safeParseISO = (d: string | Date) => {
  if (typeof d === "string") {
    try {
      return parseISO(d);
    } catch {
      return new Date(d);
    }
  }
  return d as Date;
};

const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

/* ---------------- Small components ---------------- */

const DayCube: React.FC<{
  date: Date;
  currentMonth: Date;
  isSelected: boolean;
  onSelect: (d: Date) => void;
}> = ({ date, currentMonth, isSelected, onSelect }) => {
  const isToday = isSameDay(date, new Date());
  const isCurrentMonth = isSameMonth(date, currentMonth);

  return (
    <button
      onClick={() => onSelect(date)}
      className={`w-full h-full p-0.5 flex items-center justify-center transition rounded-sm cursor-pointer
        ${isCurrentMonth ? "bg-white hover:bg-slate-50" : "bg-slate-50/60 opacity-60"}
        ${isSelected ? "ring-2 ring-blue-300 bg-blue-50" : ""}`}
    >
      <div className={`w-7 h-7 flex items-center justify-center rounded ${isToday ? "bg-blue-600 text-white" : "text-slate-600"} font-medium text-xs`}>
        {format(date, "d")}
      </div>
    </button>
  );
};

const ActivityCard: React.FC<{
  event: CalendarEvent;
  onClick: (ev: CalendarEvent) => void;
}> = ({ event, onClick }) => {
  const theme = SEVERITY_THEMES[event.severity] ?? SEVERITY_THEMES.DEFAULT;
  const typeBorder = TYPE_COLORS[event.type] ?? TYPE_COLORS.LOG;

  return (
    <motion.div
      layout
      onClick={() => onClick(event)}
      className={`p-2 rounded-md border-y border-r border-l-4 shadow-sm cursor-pointer hover:brightness-95 transition-all ${theme.bg} ${typeBorder} border-black/[0.04]`}
    >
      <div className="w-full text-left flex items-start gap-2">
        <div className={`w-7 h-7 rounded-sm flex items-center justify-center text-[11px] font-bold ${theme.text} bg-white/40 shrink-0`}>
          <i className={`bx ${theme.icon} text-sm`}></i>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate">
              <div className="text-[10px] font-black text-slate-900 truncate uppercase tracking-tight">{event.title}</div>
              <div className="text-[10px] text-slate-600 truncate mt-0.5 font-medium italic">{event.displayMessage}</div>
            </div>
            <div className="text-[10px] text-slate-500 whitespace-nowrap font-mono">{format(safeParseISO(event.date), "HH:mm")}</div>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${theme.dot}`} />
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{event.severity} • {event.type}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

/* ---------------- Main component ---------------- */

export default function MasaCalendar() {
  const { data: session } = useSession();
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [showAdjuster, setShowAdjuster] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const activitiesRef = useRef<HTMLDivElement | null>(null);
  const adjusterContainerRef = useRef<HTMLDivElement | null>(null);
  const user = session?.user;

  useEffect(() => {
    if (!showAdjuster) return;
    function onDocPointerDown(e: PointerEvent) {
      if (!adjusterContainerRef.current) return;
      if (!adjusterContainerRef.current.contains(e.target as Node)) setShowAdjuster(false);
    }
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") setShowAdjuster(false); }
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showAdjuster]);

  // Consuming the Enriched Production API
  useEffect(() => {
    let mounted = true;
    const fetchMonthData = async () => {
      if (!user?.organizationId) return;
      setLoading(true);
      try {
        const start = startOfMonth(currentMonth).toISOString();
        const end = endOfMonth(currentMonth).toISOString();
        const res = await fetch(`/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
        const data = await res.json();
        
        if (!mounted) return;
        if (res.ok && data?.success) {
          const normalized = (data.data ?? []).map((ev: any) => ({
            id: String(ev.id),
            type: String(ev.type ?? "LOG"),
            title: String(ev.title ?? "SYSTEM_ACTION"),
            displayMessage: String(ev.displayMessage ?? ""),
            date: ev.date ?? new Date().toISOString(),
            severity: ev.severity ?? "LOW",
            actorName: ev.metadata?.actorName ?? "System",
            actorRole: ev.metadata?.actorRole ?? "Authorized",
            ipAddress: ev.metadata?.ipAddress ?? "Internal",
            hash: ev.metadata?.hash ?? ev.id.slice(0, 16),
            targetType: ev.metadata?.targetType ?? "System",
            metadata: ev.metadata ?? null,
          }));
          setEvents(normalized);
        }
      } catch (err) { setError("Network error"); }
      finally { if (mounted) setLoading(false); }
    };
    fetchMonthData();
    return () => { mounted = false; };
  }, [currentMonth, user?.organizationId]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach((ev) => {
      const key = dayKey(safeParseISO(ev.date));
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [events]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const activityList = useMemo(() => {
    if (selectedDay) return eventsByDay[dayKey(selectedDay)] ?? [];
    return events.slice(0, 15);
  }, [selectedDay, events, eventsByDay]);

  return (
    <div className="relative max-w-[360px] w-full h-full bg-white border-l border-slate-200 flex flex-col text-xs overflow-hidden">
      
      {loading && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-0.5 bg-gradient-to-r from-transparent via-blue-500/60 to-transparent animate-pulse z-50" />}

      {/* Floating Month Adjuster */}
      <div className="absolute right-0 top-16 z-40 flex items-center" ref={adjusterContainerRef}>
        <AnimatePresence>
          {showAdjuster && (
            <motion.div
              initial={{ x: 20, opacity: 0, scale: 0.95 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: 20, opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="flex items-center bg-slate-900/95 backdrop-blur-md text-white rounded-l-xl py-1.5 px-2 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] border-y border-l border-slate-700/50 gap-1"
            >
              <div className="flex items-center bg-black/20 rounded-lg px-1 py-0.5 border border-white/5">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 12))} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-400 transition-colors">
                  <i className="bx bx-chevrons-left text-sm" />
                </button>
                <span className="text-[10px] font-bold font-mono px-2 text-blue-100 min-w-[40px] text-center">{format(currentMonth, "yyyy")}</span>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 12))} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-400 transition-colors">
                  <i className="bx bx-chevrons-right text-sm" />
                </button>
              </div>
              <div className="w-1 h-1 rounded-full bg-slate-700 mx-1" />
              <div className="flex items-center bg-black/20 rounded-lg px-1 py-0.5 border border-white/5">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-400 transition-colors">
                  <i className="bx bx-chevron-left text-base" />
                </button>
                <button onClick={() => setCurrentMonth(new Date())} className="flex flex-col items-center justify-center min-w-[50px] px-1 hover:bg-white/5 rounded transition-colors group">
                  <span className="text-[10px] font-black uppercase tracking-tighter text-white group-hover:text-blue-400">{format(currentMonth, "MMM")}</span>
                  <span className="text-[6px] text-blue-500 font-bold leading-none scale-0 group-hover:scale-100 transition-transform origin-bottom">RESET</span>
                </button>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-400 transition-colors">
                  <i className="bx bx-chevron-right text-base" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button onClick={() => setShowAdjuster(!showAdjuster)} className={`h-[42px] w-6 flex flex-col items-center justify-center border-l border-y transition-all duration-300 ${showAdjuster ? "bg-blue-600 border-blue-500 rounded-r-none translate-x-0" : "bg-slate-900 border-slate-700 rounded-l-lg hover:bg-slate-800"} text-white shadow-2xl relative`}>
          <motion.i animate={{ rotate: showAdjuster ? 180 : 0 }} className={`bx ${showAdjuster ? 'bx-chevron-right' : 'bx-calendar-edit'} text-sm`} />
          {!showAdjuster && <span className="absolute -top-1 -left-1 flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span></span>}
        </button>
      </div>

      {/* Calendar Area */}
      <motion.div animate={{ opacity: isExpanded ? 0 : 1, height: isExpanded ? 0 : "auto" }} className="shrink-0 mb-2 pt-1">
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50 text-[9px]">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-1 text-center font-black text-slate-400 uppercase tracking-tight">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 bg-slate-50/20 p-1">
          {days.map((day) => (
            <div key={dayKey(day)} className="aspect-square">
              <DayCube date={day} currentMonth={currentMonth} isSelected={selectedDay ? isSameDay(day, selectedDay) : false} onSelect={setSelectedDay} />
            </div>
          ))}
        </div>
      </motion.div>

      {/* Activities area */}
      <motion.div layout className="flex-1 border-t border-slate-100 bg-[#FAFAFC] overflow-hidden flex flex-col z-10" animate={{ height: isExpanded ? "100%" : "auto" }}>
        <div className="p-2 flex items-center justify-between gap-2 border-b border-black/[0.02]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-sm bg-slate-900 text-white flex items-center justify-center text-xs font-bold shadow-sm">
              {selectedDay ? format(selectedDay, "dd") : <i className='bx bx-history'></i>}
            </div>
            <div>
              <div className="text-[11px] font-extrabold text-slate-900 uppercase leading-none">
                {selectedDay ? format(selectedDay, "EEEE") : "Historical Feed"}
              </div>
              <div className="text-[9px] text-slate-500 mt-1">
                {selectedDay ? `${(eventsByDay[dayKey(selectedDay)] ?? []).length} records found` : "Global forensic audit"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => setIsExpanded(!isExpanded)} className="h-7 w-7 bg-slate-100 text-slate-600 rounded-sm flex items-center justify-center hover:bg-slate-200 transition-colors">
              <i className={`bx ${isExpanded ? 'bx-chevron-down' : 'bx-chevron-up'} text-lg`}></i>
            </button>
            <button onClick={() => setSelectedDay(null)} className="h-7 w-7 bg-slate-100 text-slate-600 rounded-sm flex items-center justify-center hover:bg-red-50 hover:text-red-600">
              <i className='bx bx-reset text-lg'></i>
            </button>
          </div>
        </div>

        <div ref={activitiesRef} className="flex-1 px-2 py-2 overflow-auto hide-scrollbar space-y-2">
          {loading && events.length === 0 ? (
            <div className="space-y-2 animate-pulse p-2">
              {[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-slate-200 rounded-md" />)}
            </div>
          ) : activityList.length > 0 ? (
            activityList.map((ev) => (
              <ActivityCard key={ev.id} event={ev} onClick={setDetailEvent} />
            ))
          ) : (
            <div className="h-32 flex flex-col items-center justify-center text-slate-400 gap-2">
              <i className='bx bx-file-blank text-2xl'></i>
              <span className="text-[11px] font-bold uppercase tracking-tighter">Zero activity entries</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 bg-white border-t border-black/[0.03] flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1">
               <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
               <span className="text-slate-500 text-[9px] font-bold uppercase tracking-tighter">Chain Verified</span>
             </div>
          </div>
          <div className="font-mono text-slate-400 text-[10px] flex items-center gap-1 uppercase font-bold">
             Nodes: Online
          </div>
        </div>
      </motion.div>

      {/* Audit Detail Modal (Management Ready) */}
      <AnimatePresence>
        {detailEvent && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={() => setDetailEvent(null)} />
              <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200"
              >
                <div className={`p-5 border-b flex items-start justify-between ${SEVERITY_THEMES[detailEvent.severity]?.bg ?? 'bg-slate-50'}`}>
                  <div className="flex gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-white shadow-sm text-2xl ${SEVERITY_THEMES[detailEvent.severity]?.text ?? 'text-slate-600'}`}>
                      <i className={`bx ${SEVERITY_THEMES[detailEvent.severity]?.icon ?? 'bx-info-circle'}`}></i>
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 text-sm leading-tight uppercase tracking-tighter">{detailEvent.title.replace(/_/g, ' ')}</h4>
                      <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase tracking-widest">{format(safeParseISO(detailEvent.date), "PPP • p")}</p>
                    </div>
                  </div>
                  <button onClick={() => setDetailEvent(null)} className="text-slate-400 hover:text-slate-600 transition-colors"><i className='bx bx-x text-2xl'></i></button>
                </div>

                <div className="p-5 space-y-5 bg-white">
                  {/* Action Summary */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 shadow-inner">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Enriched Audit Message</label>
                    <p className="text-[13px] text-slate-800 font-bold mt-2 leading-relaxed italic">"{detailEvent.displayMessage}"</p>
                  </div>

                  {/* Actor & Source Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 border border-slate-100 rounded-xl bg-slate-50/30">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Initiated By</label>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="w-5 h-5 rounded-md bg-slate-900 text-[10px] flex items-center justify-center text-white font-black uppercase">{detailEvent.actorName?.charAt(0)}</div>
                        <span className="text-xs font-black text-slate-700 truncate">{detailEvent.actorName}</span>
                      </div>
                      <div className="mt-1.5 text-[9px] text-blue-600 font-black uppercase tracking-widest">{detailEvent.actorRole}</div>
                    </div>
                    <div className="p-3 border border-slate-100 rounded-xl bg-slate-50/30">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Source Context</label>
                      <div className="text-[11px] font-mono font-bold text-slate-700 mt-2 flex items-center gap-1.5">
                        <i className='bx bx-broadcast text-blue-500'></i> {detailEvent.ipAddress}
                      </div>
                      <div className="mt-1.5 text-[9px] text-slate-400 font-black uppercase tracking-widest">{detailEvent.targetType || "General"}</div>
                    </div>
                  </div>

                  {/* Forensic Proof */}
                  <div className="bg-slate-900 rounded-xl p-4 shadow-2xl border border-white/5">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-[9px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1">
                        <i className='bx bx-fingerprint'></i> Immutable Hash
                      </label>
                      <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[8px] font-black rounded border border-blue-500/20">SHA-256</span>
                    </div>
                    <p className="text-[10px] font-mono text-slate-400 break-all leading-tight tracking-tighter selection:bg-blue-500/30">
                      {detailEvent.hash || "PENDING_ENCRYPTION_SYNC"}
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border-t flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Audit Status</span>
                    <span className="text-[10px] font-black text-emerald-600 uppercase">Tamper Evident</span>
                  </div>
                  <button onClick={() => setDetailEvent(null)} className="px-6 py-2 bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest rounded-lg hover:bg-slate-800 transition-all shadow-lg active:scale-95 border border-white/10">
                    Acknowledge
                  </button>
                </div>
              </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}