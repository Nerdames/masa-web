"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, isSameMonth, isSameDay, eachDayOfInterval 
} from "date-fns";

/* --------------------------------------------------------------------------
 * TYPES & CONFIG
 * -------------------------------------------------------------------------- */

interface CalendarEvent {
  id: string;
  type: string;
  title: string;
  date: string | Date;
}

const EVENT_THEMES: Record<string, { bg: string; text: string; dot: string; icon: string }> = {
  SECURITY: { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500", icon: "bx-shield-quarter" },
  APPROVAL: { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-500", icon: "bx-lock-open" },
  STOCK: { bg: "bg-purple-50", text: "text-purple-600", dot: "bg-purple-500", icon: "bx-package" },
  PO: { bg: "bg-indigo-50", text: "text-indigo-600", dot: "bg-indigo-500", icon: "bx-receipt" },
  EXPENSE: { bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-500", icon: "bx-money" },
  LOG: { bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400", icon: "bx-terminal" },
  DEFAULT: { bg: "bg-blue-50", text: "text-blue-600", dot: "bg-blue-500", icon: "bx-layer" },
};

/* --------------------------------------------------------------------------
 * MAIN COMPONENT
 * -------------------------------------------------------------------------- */

export default function MasaCalendar() {
  const { data: session } = useSession();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  
  // State for in-place day viewing
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const user = session?.user;

  useEffect(() => {
    const fetchMonthData = async () => {
      if (!user?.organizationId) return;
      setLoading(true);
      try {
        const start = startOfMonth(currentMonth).toISOString();
        const end = endOfMonth(currentMonth).toISOString();
        const res = await fetch(`/api/calendar?start=${start}&end=${end}`);
        const data = await res.json();
        if (data.success) setEvents(data.data);
      } catch (err) {
        console.error("Calendar Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchMonthData();
  }, [currentMonth, user?.organizationId]);

  // Group events by date for O(1) grid lookup
  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach(event => {
      const key = format(new Date(event.date), "yyyy-MM-dd");
      if (!map[key]) map[key] = [];
      map[key].push(event);
    });
    return map;
  }, [events]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  // FIXED: Missing function definition
  const handleDayClick = (day: Date, dayEvents: CalendarEvent[]) => {
    setSelectedDay(day);
  };

  /* ------------------------------------------------------------------------
   * VIEW: DAILY LOG DETAILS
   * ------------------------------------------------------------------------ */
  if (selectedDay) {
    const dayEvents = eventsByDay[format(selectedDay, "yyyy-MM-dd")] || [];
    
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className="relative flex flex-col h-full bg-[#FAFAFC] border border-slate-200 rounded-xl shadow-xl overflow-hidden"
      >
        {/* Floating Back Button */}
        <motion.button 
          initial={{ scale: 0, rotate: -90 }} 
          animate={{ scale: 1, rotate: 0 }}
          onClick={() => setSelectedDay(null)}
          className="absolute bottom-6 right-6 h-10 w-10 bg-slate-900 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-blue-600 transition-colors z-50 group"
        >
          <i className="bx bx-arrow-back text-lg group-hover:-translate-x-0.5 transition-transform" />
        </motion.button>

        {/* Header */}
        <div className="p-5 bg-white border-b border-black/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex flex-col items-center justify-center shadow-md">
              <span className="text-[7px] font-black uppercase tracking-tighter opacity-60 leading-none mb-0.5">{format(selectedDay, "MMM")}</span>
              <span className="text-sm font-black leading-none">{format(selectedDay, "dd")}</span>
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter">{format(selectedDay, "EEEE")}</h3>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{dayEvents.length} Sequence Logs Found</p>
            </div>
          </div>
        </div>

        {/* Timeline Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar">
          {dayEvents.length > 0 ? dayEvents.map((event, idx) => {
            const theme = EVENT_THEMES[event.type] || EVENT_THEMES.DEFAULT;
            return (
              <motion.div 
                initial={{ opacity: 0, y: 5 }} 
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                key={event.id} 
                className="p-3 bg-white border border-black/[0.04] rounded-lg shadow-sm flex items-start gap-3"
              >
                <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${theme.bg} ${theme.text}`}>
                  <i className={`bx ${theme.icon} text-sm`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded border tracking-widest ${theme.bg} ${theme.text} border-black/5`}>
                      {event.type}
                    </span>
                    <span className="text-[8px] font-mono font-bold text-slate-400">
                      {format(new Date(event.date), "HH:mm:ss")}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-700 leading-snug truncate">{event.title}</p>
                </div>
              </motion.div>
            );
          }) : (
            <div className="h-full flex flex-col items-center justify-center opacity-20 py-20">
              <i className="bx bx-radar text-4xl mb-2" />
              <p className="text-[8px] font-black uppercase tracking-[0.3em]">Zero_Activity_Detected</p>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  /* ------------------------------------------------------------------------
   * VIEW: CALENDAR GRID
   * ------------------------------------------------------------------------ */
  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden relative">
      
      {/* Loading Bar */}
      {loading && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500/20 animate-pulse z-10" />}

      {/* 1. COMPACT TOOLBAR */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-slate-900 rounded-lg flex items-center justify-center text-white shadow-md">
             <i className='bx bxs-layer text-sm'></i>
          </div>
          <div>
            <h2 className="text-sm font-black tracking-tighter text-slate-900 leading-none uppercase">
              {format(currentMonth, "MMMM")} <span className="text-blue-600 opacity-60 ml-1">{format(currentMonth, "yyyy")}</span>
            </h2>
          </div>
        </div>

        <div className="flex items-center bg-slate-50 p-1 rounded-xl border border-slate-100">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-500">
            <i className='bx bx-chevron-left text-lg'></i>
          </button>
          <button onClick={() => setCurrentMonth(new Date())} className="px-3 text-[8px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-slate-900 transition-all">
            Today
          </button>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-500">
            <i className='bx bx-chevron-right text-lg'></i>
          </button>
        </div>
      </div>

      {/* 2. WEEKDAY HEADER */}
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50 shrink-0">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} className="py-2 text-center text-[8px] font-black text-slate-400 uppercase tracking-[0.3em]">
            {d}
          </div>
        ))}
      </div>

      {/* 3. CALENDAR GRID */}
      <div className="grid grid-cols-7 flex-grow min-h-0 auto-rows-fr divide-x divide-y divide-slate-100/60 overflow-hidden bg-slate-50/20">
        <AnimatePresence mode="wait">
          {days.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay[dateKey] || [];
            const isToday = isSameDay(day, new Date());
            const isCurrentMonth = isSameMonth(day, currentMonth);

            return (
              <div
                key={day.toISOString()}
                onClick={() => handleDayClick(day, dayEvents)}
                className={`
                  flex flex-col p-2 transition-all cursor-pointer group
                  ${!isCurrentMonth ? "bg-slate-50/60 opacity-40" : "bg-white hover:bg-blue-50/20"}
                `}
              >
                {/* Date Header */}
                <div className="flex justify-between items-start mb-1.5">
                  <span className={`
                    text-[10px] font-black h-6 w-6 flex items-center justify-center rounded-lg transition-all
                    ${isToday ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "text-slate-400 group-hover:text-slate-900"}
                  `}>
                    {format(day, "d")}
                  </span>
                </div>

                {/* Event Stack */}
                <div className="flex-grow space-y-1 overflow-hidden">
                  {dayEvents.slice(0, 3).map(event => {
                    const theme = EVENT_THEMES[event.type] || EVENT_THEMES.DEFAULT;
                    return (
                      <div key={event.id} className={`
                        text-[8px] px-1.5 py-0.5 rounded-[4px] border flex items-center gap-1.5 truncate font-bold
                        ${theme.bg} ${theme.text} border-black/[0.03]
                      `}>
                        <div className={`w-1 h-1 rounded-full shrink-0 ${theme.dot}`} />
                        <span className="truncate">{event.title}</span>
                      </div>
                    );
                  })}
                  
                  {dayEvents.length > 3 && (
                    <div className="text-[7px] font-black text-slate-400 uppercase tracking-widest pl-1 pt-0.5">
                      + {dayEvents.length - 3} Nodes
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* 4. FOOTER STATUS BAR */}
      <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
           <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Active_Sync</span>
           </div>
           <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Sys_Alerts</span>
           </div>
        </div>
        <p className="text-[7px] font-mono font-bold text-slate-400">
          STAMP: {format(new Date(), "HH:mm:ss")}
        </p>
      </div>
    </div>
  );
}