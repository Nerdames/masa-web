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
  type: string;
  title: string;
  date: string | Date;
  details?: string;
  metadata?: Record<string, unknown> | null;
};

const EVENT_THEMES: Record<string, { bg: string; text: string; dot: string; icon: string }> = {
  SECURITY: { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500", icon: "bx-shield-quarter" },
  APPROVAL: { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-500", icon: "bx-check-double" },
  STOCK: { bg: "bg-purple-50", text: "text-purple-600", dot: "bg-purple-500", icon: "bx-package" },
  PO: { bg: "bg-indigo-50", text: "text-indigo-600", dot: "bg-indigo-500", icon: "bx-file" },
  EXPENSE: { bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-500", icon: "bx-wallet" },
  LOG: { bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400", icon: "bx-history" },
  DEFAULT: { bg: "bg-blue-50", text: "text-blue-600", dot: "bg-blue-500", icon: "bx-info-circle" },
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
  const theme = EVENT_THEMES[event.type] ?? EVENT_THEMES.DEFAULT;

  return (
    <motion.div
      layout
      onClick={() => onClick(event)}
      className={`p-2 rounded-md border border-black/[0.04] shadow-sm cursor-pointer hover:brightness-95 transition-all ${theme.bg}`}
    >
      <div className="w-full text-left flex items-start gap-2">
        <div className={`w-7 h-7 rounded-sm flex items-center justify-center text-[11px] font-bold ${theme.text} bg-white/40 shrink-0`}>
          <i className={`bx ${theme.icon} text-sm`}></i>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate">
              <div className="text-xs font-semibold text-slate-900 truncate">{event.title}</div>
              {event.details && <div className="text-[11px] text-slate-600 truncate mt-0.5">{event.details}</div>}
            </div>
            <div className="text-[10px] text-slate-500 whitespace-nowrap">{format(safeParseISO(event.date), "h:mm a")}</div>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${theme.dot}`} />
            <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{event.type}</div>
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

  // Float Logics Fix: Handlers for click-away and Escape key
  useEffect(() => {
    if (!showAdjuster) return;

    function onDocPointerDown(e: PointerEvent) {
      if (!adjusterContainerRef.current) return;
      if (!adjusterContainerRef.current.contains(e.target as Node)) {
        setShowAdjuster(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowAdjuster(false);
    }

    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showAdjuster]);

  // Fetch Logic
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
            title: String(ev.title ?? ""),
            date: ev.date ?? ev.createdAt ?? new Date().toISOString(),
            details: ev.details ?? undefined,
            metadata: ev.metadata ?? ev.meta ?? null,
          }));
          setEvents(normalized);
        }
      } catch (err) {
        setError("Network error");
      } finally {
        if (mounted) setLoading(false);
      }
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
    return events.slice(0, 8);
  }, [selectedDay, events, eventsByDay]);

  return (
    <div className="relative max-w-[360px] w-full h-full bg-white border-l border-slate-200 flex flex-col text-xs overflow-hidden">
      
      {loading && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500/40 animate-pulse z-50" />}


{/* Floating Month Adjuster - Premium Horizontal Segmented Dock */}

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
              {/* Year Segment */}
              <div className="flex items-center bg-black/20 rounded-lg px-1 py-0.5 border border-white/5">
                <button
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 12))}
                  className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-400 transition-colors"
                >
                  <i className="bx bx-chevrons-left text-sm" />
                </button>
                <span className="text-[10px] font-bold font-mono px-2 text-blue-100 min-w-[40px] text-center">
                  {format(currentMonth, "yyyy")}
                </span>
                <button
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 12))}
                  className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-400 transition-colors"
                >
                  <i className="bx bx-chevrons-right text-sm" />
                </button>
              </div>

              {/* Separator Dot */}
              <div className="w-1 h-1 rounded-full bg-slate-700 mx-1" />

              {/* Month Segment */}
              <div className="flex items-center bg-black/20 rounded-lg px-1 py-0.5 border border-white/5">
                <button
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-400 transition-colors"
                >
                  <i className="bx bx-chevron-left text-base" />
                </button>
                
                <button 
                  onClick={() => setCurrentMonth(new Date())}
                  className="flex flex-col items-center justify-center min-w-[50px] px-1 hover:bg-white/5 rounded transition-colors group"
                >
                  <span className="text-[10px] font-black uppercase tracking-tighter text-white group-hover:text-blue-400">
                    {format(currentMonth, "MMM")}
                  </span>
                  <span className="text-[6px] text-blue-500 font-bold leading-none scale-0 group-hover:scale-100 transition-transform origin-bottom">
                    RESET
                  </span>
                </button>

                <button
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-400 transition-colors"
                >
                  <i className="bx bx-chevron-right text-base" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle Tab - Integrated with Drawer Height */}
        <button
          onClick={() => setShowAdjuster(!showAdjuster)}
          className={`
            h-[42px] w-6 flex flex-col items-center justify-center border-l border-y transition-all duration-300
            ${showAdjuster 
              ? "bg-blue-600 border-blue-500 rounded-r-none translate-x-0" 
              : "bg-slate-900 border-slate-700 rounded-l-lg hover:bg-slate-800"} 
            text-white shadow-2xl relative
          `}
        >
          <motion.i 
            animate={{ rotate: showAdjuster ? 180 : 0 }}
            className={`bx ${showAdjuster ? 'bx-chevron-right' : 'bx-calendar-edit'} text-sm`} 
          />
          {!showAdjuster && (
            <span className="absolute -top-1 -left-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
          )}
        </button>
      </div>


      {/* Calendar Area */}
      <motion.div 
        animate={{ opacity: isExpanded ? 0 : 1, height: isExpanded ? 0 : "auto" }}
        className="shrink-0 mb-2 pt-1"
      >
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
      <motion.div 
        layout
        className="flex-1 border-t border-slate-100 bg-[#FAFAFC] overflow-hidden flex flex-col z-10"
        animate={{ height: isExpanded ? "100%" : "auto" }}
      >
        <div className="p-2 flex items-center justify-between gap-2 border-b border-black/[0.02]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-sm bg-slate-900 text-white flex items-center justify-center text-xs font-bold shadow-sm">
              {selectedDay ? format(selectedDay, "dd") : <i className='bx bx-calendar-event'></i>}
            </div>
            <div>
              <div className="text-[11px] font-extrabold text-slate-900 uppercase leading-none">
                {selectedDay ? format(selectedDay, "EEEE") : "Activities"}
              </div>
              <div className="text-[9px] text-slate-500 mt-1">
                {selectedDay ? `${(eventsByDay[dayKey(selectedDay)] ?? []).length} items recorded` : "Monthly feed"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsExpanded(!isExpanded)} 
              className="h-7 w-7 bg-slate-100 text-slate-600 rounded-sm flex items-center justify-center hover:bg-slate-200 transition-colors"
            >
              <i className={`bx ${isExpanded ? 'bx-chevron-down' : 'bx-chevron-up'} text-lg`}></i>
            </button>
            <button onClick={() => setSelectedDay(null)} className="h-7 w-7 bg-slate-100 text-slate-600 rounded-sm flex items-center justify-center hover:bg-red-50 hover:text-red-600">
              <i className='bx bx-x text-lg'></i>
            </button>
          </div>
        </div>

        <div ref={activitiesRef} className="flex-1 px-2 py-2 overflow-auto hide-scrollbar space-y-2">
          {loading && events.length === 0 ? (
            <div className="space-y-2 animate-pulse p-2">
              {[1,2,3].map(i => <div key={i} className="h-12 bg-slate-200 rounded" />)}
            </div>
          ) : activityList.length > 0 ? (
            activityList.map((ev) => (
              <ActivityCard key={ev.id} event={ev} onClick={setDetailEvent} />
            ))
          ) : (
            <div className="h-32 flex flex-col items-center justify-center text-slate-400 gap-2">
              <i className='bx bx-calendar-x text-2xl'></i>
              <span className="text-[11px]">No activities for this day</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 bg-white border-t border-black/[0.03] flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1">
               <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
               <span className="text-slate-500 text-[9px] font-bold uppercase tracking-tighter">Live Monitor</span>
             </div>
          </div>
          <div className="font-mono text-slate-400 text-[10px] flex items-center gap-1">
            <i className='bx bx-time-five'></i>
            {format(new Date(), "HH:mm")}
          </div>
        </div>
      </motion.div>

      {/* Detail panel Modal */}
      <AnimatePresence>
        {detailEvent && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
               onClick={() => setDetailEvent(null)} 
             />
             <motion.div 
               initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
               className="relative w-full max-w-sm bg-white rounded-lg shadow-2xl overflow-hidden border border-slate-200"
             >
                <div className="p-4 border-b flex items-start justify-between bg-slate-50">
                  <div className="flex gap-3">
                    <div className={`w-10 h-10 rounded flex items-center justify-center bg-white shadow-sm text-xl ${EVENT_THEMES[detailEvent.type]?.text ?? 'text-slate-600'}`}>
                      <i className={`bx ${EVENT_THEMES[detailEvent.type]?.icon ?? 'bx-info-circle'}`}></i>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm leading-tight">{detailEvent.title}</h4>
                      <p className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">{format(safeParseISO(detailEvent.date), "PPP • p")}</p>
                    </div>
                  </div>
                  <button onClick={() => setDetailEvent(null)} className="text-slate-400 hover:text-slate-600"><i className='bx bx-x text-2xl'></i></button>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Description</label>
                    <p className="text-sm text-slate-700 mt-1 leading-relaxed">{detailEvent.details || "No further details available."}</p>
                  </div>
                  {detailEvent.metadata && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Metadata Logs</label>
                      <pre className="mt-2 p-3 bg-slate-900 text-blue-400 text-[10px] rounded-md overflow-auto max-h-48 hide-scrollbar">
                        {JSON.stringify(detailEvent.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
                <div className="p-3 bg-slate-50 border-t flex justify-end">
                  <button onClick={() => setDetailEvent(null)} className="px-4 py-1.5 bg-slate-900 text-white text-xs font-bold rounded hover:bg-slate-800 transition-colors">Close</button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}