"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { format } from "date-fns";

/* --- SHARED STYLES --- */
const PANEL_STYLE = "bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden";
const LABEL_STYLE = "text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1 block";

export default function ForensicReportsPage() {
  const { dispatch } = useAlerts();
  const [range, setRange] = useState("30");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchIntelligence = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports?range=${range}`);
      if (!res.ok) throw new Error("Unauthorized");
      const result = await res.json();
      setData(result);
      
      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Intelligence Synchronized",
        message: `Forensic data for the last ${range} days has been compiled.`,
      });
    } catch (e) {
      dispatch({ kind: "TOAST", type: "SECURITY", title: "Sync Failure", message: "Intelligence engine access denied or offline." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchIntelligence(); }, [range]);

  if (loading && !data) return (
    <div className="h-full w-full flex items-center justify-center bg-[#FAFAFC]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Decrypting Ledger...</span>
      </div>
    </div>
  );

  if (!data) return null;

  return (
    <div className="h-full overflow-y-auto bg-[#F8F9FA] custom-scrollbar">
      <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-8">
        
        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter text-slate-900 uppercase italic">
              Intelligence_Center
            </h1>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] mt-1">
              Operational Forensic Matrix • {format(new Date(), "PP")}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex gap-2 bg-white border border-slate-200 p-1 rounded-xl shadow-sm">
              {["7", "30", "90"].map(r => (
                <button 
                  key={r} 
                  onClick={() => setRange(r)}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                    range === r 
                    ? "bg-slate-900 text-white shadow-sm" 
                    : "text-slate-400 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  {r}D_SCOPE
                </button>
              ))}
            </div>
            <button className="h-9 px-4 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-colors flex items-center gap-2 border border-emerald-100">
               <i className="bx bx-cloud-download text-lg" />
               <span className="text-[10px] font-black uppercase tracking-widest hidden sm:block">Export</span>
            </button>
          </div>
        </div>

        {/* TOP METRICS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {[
            { label: "Gross_Revenue", val: `$${Number(data.summary.totalRevenue).toLocaleString()}`, icon: "bx-trending-up", color: "text-emerald-500", bg: "bg-emerald-50" },
            { label: "Paid_Settlements", val: `$${Number(data.summary.paidRevenue).toLocaleString()}`, icon: "bx-check-shield", color: "text-blue-500", bg: "bg-blue-50" },
            { label: "Logistics_Velocity", val: data.summary.logisticsVelocity.toLocaleString(), icon: "bx-transfer-alt", color: "text-purple-500", bg: "bg-purple-50" },
            { label: "Deficit_Alerts", val: data.summary.lowStockCount, icon: "bx-error", color: "text-red-500", bg: "bg-red-50" },
          ].map((stat, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: i * 0.1 }} 
              key={i} 
              className={PANEL_STYLE + " p-6 group cursor-default"}
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className={LABEL_STYLE}>{stat.label}</span>
                  <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{stat.val}</h2>
                </div>
                <div className={`w-12 h-12 rounded-full ${stat.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <i className={`bx ${stat.icon} text-2xl ${stat.color}`} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          
          {/* TREND CHART (Audit Density Matrix) */}
          <div className={PANEL_STYLE + " lg:col-span-2 p-6 flex flex-col"}>
            <div className="flex justify-between items-center mb-8">
              <div>
                <span className={LABEL_STYLE}>Audit_Density_Trend</span>
                <p className="text-xs font-medium text-slate-500">System interaction volume vs critical anomalies.</p>
              </div>
              <div className="flex gap-4 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-slate-200" /><span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">General</span></div>
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-red-500" /><span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Critical</span></div>
              </div>
            </div>
            
            {/* Dynamic CSS Bar Chart */}
            <div className="flex-1 min-h-[220px] flex items-end gap-1.5 sm:gap-3 px-2">
              {data.trends.map((t: any, i: number) => {
                // Calculate relative heights safely
                const maxTotal = Math.max(...data.trends.map((x: any) => x.total), 1);
                const totalH = (t.total / maxTotal) * 100;
                // Critical is drawn relative to the total bar's height to show proportion, or overlaid
                const critH = t.total > 0 ? (t.critical / t.total) * 100 : 0; 

                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-3 group relative h-full">
                    {/* Tooltip */}
                    <div className="absolute -top-10 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap shadow-lg">
                      {t.total} Events ({t.critical} Crit)
                    </div>
                    
                    <div className="w-full relative flex flex-col justify-end h-full">
                       <motion.div 
                         initial={{ height: 0 }} animate={{ height: `${totalH}%` }} 
                         className="w-full bg-slate-100 rounded-t-md group-hover:bg-slate-200 transition-colors relative overflow-hidden" 
                       >
                         <motion.div 
                           initial={{ height: 0 }} animate={{ height: `${critH}%` }} 
                           className="w-full bg-red-500 absolute bottom-0 shadow-[0_0_10px_rgba(239,68,68,0.5)]" 
                         />
                       </motion.div>
                    </div>
                    <span className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-tighter -rotate-45 sm:rotate-0 mt-2 sm:mt-0">{t.date}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RISK RADAR */}
          <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-2xl relative overflow-hidden flex flex-col">
             <div className="absolute top-0 right-0 p-8 opacity-5"><i className="bx bx-radar text-[12rem] animate-pulse" /></div>
             
             <div className="relative z-10 flex-1">
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400 mb-6 flex items-center gap-2">
                 <i className="bx bx-error-alt text-lg" /> Critical_Deficit_Radar
               </span>
               
               {data.stockRisks.length === 0 ? (
                 <div className="h-40 flex flex-col items-center justify-center text-emerald-400/50">
                    <i className="bx bx-check-shield text-4xl mb-2" />
                    <p className="text-[10px] font-black tracking-widest uppercase">Inventory Optimal</p>
                 </div>
               ) : (
                 <div className="space-y-3">
                   {data.stockRisks.map((risk: any, i: number) => (
                     <div key={i} className="flex justify-between items-center p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors">
                       <div className="min-w-0 pr-3">
                         <p className="text-[11px] font-bold uppercase truncate">{risk.name}</p>
                         <div className="flex gap-2 items-center mt-1">
                           <p className="text-[8px] font-mono text-slate-400">{risk.sku}</p>
                           <span className="text-[8px] font-bold text-slate-500 bg-black/50 px-1.5 rounded">{risk.branch}</span>
                         </div>
                       </div>
                       <div className="text-right shrink-0">
                         <span className="text-sm font-black text-red-400">{risk.stock}</span>
                         <p className="text-[7px] font-bold opacity-40 uppercase tracking-widest">Remaining</p>
                       </div>
                     </div>
                   ))}
                 </div>
               )}
             </div>

             <div className="relative z-10 mt-6 pt-6 border-t border-white/10">
               <button className="w-full py-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-red-400 hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/10">
                 Initialize Restock Protocol
               </button>
             </div>
          </div>

          {/* BRANCH PERFORMANCE (LEADERBOARD) */}
          <div className={PANEL_STYLE + " p-6 lg:col-span-3"}>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <i className="bx bx-buildings text-lg" />
              </div>
              <div>
                <span className={LABEL_STYLE}>Branch_Market_Share</span>
                <p className="text-xs font-medium text-slate-500">Revenue generation ranked by branch performance.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
              {data.branches.map((b: any, i: number) => {
                const maxRev = Math.max(...data.branches.map((x:any) => x.revenue), 1);
                const percentage = (b.revenue / maxRev) * 100;
                
                return (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-8 font-mono text-xs font-bold text-slate-400">
                      #{String(i + 1).padStart(2, '0')}
                    </div>
                    <div className="flex-1 space-y-2.5">
                      <div className="flex justify-between items-end">
                        <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{b.name}</span>
                        <span className="text-sm font-black text-slate-900">${Number(b.revenue).toLocaleString()}</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                        <motion.div 
                          initial={{ width: 0 }} 
                          animate={{ width: `${percentage}%` }} 
                          transition={{ duration: 1, ease: "easeOut" }}
                          className={`h-full rounded-full ${i === 0 ? 'bg-indigo-500' : 'bg-slate-800'}`} 
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}