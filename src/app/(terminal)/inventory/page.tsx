"use client";

import React, { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Box,
  ShoppingCart,
  RefreshCw,
  ClipboardCheck,
  BarChart3,
  History,
  AlertTriangle,
  ArrowUpRight,
  PackageCheck,
} from "lucide-react";
import { Role } from "@prisma/client";

// --- Types ---
interface DashboardStats {
  lowStock: number;
  pendingApprovals: number;
  activeOrders: number;
  inTransit: number;
}

interface DashboardTile {
  id: string;
  title: string;
  descriptionSm: string;
  icon: React.ElementType;
  href: string;
  color: string;
  roles: Role[];
  statKey?: keyof DashboardStats;
}

// --- Configuration ---
const TILES: DashboardTile[] = [
  { id: "inv", title: "Inventory", descriptionSm: "Stock levels & safety stock.", icon: Box, href: "/terminal/inventory", color: "from-blue-600 to-cyan-500", roles: ["ADMIN", "MANAGER", "INVENTORY", "AUDITOR", "DEV"], statKey: "lowStock" },
  { id: "po", title: "Purchase Orders", descriptionSm: "Create POs & track receipts.", icon: ShoppingCart, href: "/terminal/purchase-orders", color: "from-emerald-600 to-teal-500", roles: ["ADMIN", "MANAGER", "INVENTORY", "DEV"], statKey: "activeOrders" },
  { id: "grn", title: "Goods Receipts", descriptionSm: "Reconcile POs & update stock.", icon: PackageCheck, href: "/terminal/grns", color: "from-amber-500 to-orange-500", roles: ["ADMIN", "MANAGER", "INVENTORY", "DEV"] },
  { id: "app", title: "Approvals", descriptionSm: "Price updates & adjustments.", icon: ClipboardCheck, href: "/terminal/approvals", color: "from-purple-600 to-indigo-500", roles: ["ADMIN", "MANAGER", "DEV"], statKey: "pendingApprovals" },
  { id: "stk", title: "Stock Take", descriptionSm: "Physical counts & logs.", icon: RefreshCw, href: "/terminal/stock-takes", color: "from-orange-500 to-amber-500", roles: ["ADMIN", "MANAGER", "INVENTORY", "DEV"] },
  { id: "trn", title: "Transfers", descriptionSm: "Inter-branch movements.", icon: ArrowUpRight, href: "/terminal/transfers", color: "from-sky-600 to-indigo-500", roles: ["ADMIN", "MANAGER", "INVENTORY", "DEV"], statKey: "inTransit" },
  { id: "rep", title: "Reports", descriptionSm: "Valuation & audit insights.", icon: BarChart3, href: "/terminal/reports", color: "from-rose-500 to-pink-500", roles: ["ADMIN", "MANAGER", "AUDITOR", "DEV"] },
  { id: "aud", title: "Audit Logs", descriptionSm: "Forensic activity tracking.", icon: History, href: "/terminal/audit", color: "from-slate-700 to-slate-900", roles: ["ADMIN", "AUDITOR", "DEV"] },
  { id: "ref", title: "Returns", descriptionSm: "Refunds & restocking.", icon: AlertTriangle, href: "/terminal/refunds", color: "from-red-600 to-rose-500", roles: ["ADMIN", "MANAGER", "DEV"] },
];

export default function TerminalDashboard() {
  const { data: session } = useSession({ refetchInterval: 0, refetchOnWindowFocus: false });
  const [stats, setStats] = useState<DashboardStats>({ lowStock: 0, pendingApprovals: 0, activeOrders: 0, inTransit: 0 });
  const [isDark, setIsDark] = useState(false);

  // 1. Automatic Time-Based Theme Engine
  useEffect(() => {
    const updateTheme = () => {
      const hour = new Date().getHours();
      setIsDark(hour < 7 || hour >= 19);
    };
    updateTheme();
    const timer = setInterval(updateTheme, 60000);
    return () => clearInterval(timer);
  }, []);

  // 2. Fetch High-Speed Stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/inventory/stats");
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error("Stats sync failed");
      }
    };
    fetchStats();
  }, []);

  const userRole = (session?.user?.role as Role) || Role.CASHIER;
  const allowedTiles = useMemo(() => TILES.filter(t => t.roles.includes(userRole)), [userRole]);

  return (
    <main className={`h-screen w-screen pb-6 flex flex-col transition-colors duration-1000 overflow-auto ${isDark ? "bg-[#0f172a] text-slate-200" : "bg-slate-50 text-slate-900"}`}>
      <div className="flex-1 flex flex-col w-full max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
        
        {/* Compact Header */}
        <header className={`w-full sticky flex flex-col shrink-0 transition-all duration-300 ${
          isDark ? "bg-[#0f172a]/80 backdrop-blur-md" : "bg-white/95 backdrop-blur-md"
        }`}>
          {/* LAYER 1: The Main Top Bar */}
          <div className="flex items-center justify-between gap-4 pb-3 min-w-0">
            
            {/* Left Side: Title & Context Breadcrumb */}
            <div className="min-w-0 flex items-center gap-3">
              <div className="flex items-center gap-2.5">
                <div className="relative flex items-center justify-center">
                  <div className={`h-2.5 w-2.5 rounded-full animate-pulse ${isDark ? "bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]" : "bg-blue-600"}`} />
                  <div className={`absolute h-4 w-4 rounded-full border border-current opacity-20 animate-ping ${isDark ? "text-cyan-500" : "text-blue-600"}`} />
                </div>
                
                <div className="flex flex-col md:flex-row md:items-center md:gap-3">
                  <h1 className={`truncate text-[16px] md:text-[18px] font-bold tracking-tight uppercase ${isDark ? "text-white" : "text-slate-900"}`}>
                    Operations Hub
                  </h1>
                  
                  {/* Vertical Pipeline Separator (Desktop) */}
                  <div className={`hidden md:block h-4 w-[1.5px] ${isDark ? "bg-slate-700" : "bg-slate-200"}`} />
                  
                  {/* Branch Context */}
                  <div className="flex items-center gap-1.5">
                    <i className={`bx bx-map-pin text-xs ${isDark ? "text-cyan-500/60" : "text-blue-500/60"}`} />
                    <span className={`text-[10px] md:text-[11px] font-bold uppercase tracking-widest ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      {session?.user?.branchName || "Main Terminal"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side: Global Search & Action Group */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden sm:relative sm:block group">
                <i className={`bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-xs transition-colors ${
                  isDark ? "text-slate-500 group-focus-within:text-cyan-400" : "text-slate-400 group-focus-within:text-blue-600"
                }`} />
                <input
                  type="text"
                  placeholder="Search Operations..."
                  className={`py-1.5 pl-9 pr-4 text-[11px] font-semibold w-32 md:w-48 lg:w-72 rounded-lg transition-all outline-none border ${
                    isDark 
                    ? "bg-slate-800/40 border-slate-700/50 text-slate-200 focus:bg-slate-800 focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50" 
                    : "bg-slate-100 border-transparent text-slate-900 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                  }`}
                />
              </div>

              <div className={`h-6 w-px ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />

              <button
                onClick={() => { /* Trigger stats refresh */ }}
                className={`group p-2 border rounded-lg transition-all flex items-center justify-center shadow-sm shrink-0 ${
                  isDark 
                  ? "bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-cyan-400" 
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-blue-600"
                }`}
              >
                <i className={`bx bx-refresh text-lg md:text-sm group-active:rotate-180 transition-transform duration-500`} />
              </button>
            </div>
          </div>
        </header>

        {/* Quick Stats Strip */}
        <section className="grid grid-cols-4 gap-3 mb-4 shrink-0">
          <StatBadge label="Low Stock" value={stats.lowStock} color="rose" isDark={isDark} />
          <StatBadge label="In-Transit" value={stats.inTransit} color="cyan" isDark={isDark} />
          <StatBadge label="Approvals" value={stats.pendingApprovals} color="purple" isDark={isDark} alert />
          <div className={`rounded-xl p-3 flex items-center justify-between backdrop-blur-sm border transition-all ${isDark ? "bg-slate-800/30 border-slate-700/40" : "bg-white border-slate-200 shadow-sm"}`}>
            <p className="text-[9px] text-slate-500 font-bold uppercase">Uptime</p>
            <RefreshCw className={`w-3 h-3 animate-spin-slow ${isDark ? "text-emerald-500/50" : "text-emerald-600"}`} />
          </div>
        </section>

        {/* Dynamic 3x3 Grid - Forced to fill available height to prevent overflow */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 min-h-0">
          {allowedTiles.map((tile) => (
            <Link
              key={tile.id}
              href={tile.href}
              className={`group relative flex flex-col justify-between p-5 rounded-2xl border transition-all duration-300 overflow-hidden ${
                isDark 
                ? "bg-slate-900/50 border-slate-800 hover:border-slate-600" 
                : "bg-white border-slate-200 hover:border-blue-300 shadow-sm hover:shadow-md"
              }`}
            >
              {/* Visual Glow */}
              <div className={`absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br ${tile.color} opacity-[0.05] group-hover:opacity-[0.12] rounded-full blur-2xl transition-opacity`} />

              <div className="flex justify-between items-start z-10">
                <div className={`p-2.5 rounded-xl bg-gradient-to-br ${tile.color} shadow-lg shadow-black/20`}>
                  <tile.icon className="w-5 h-5 text-white" />
                </div>

                {tile.statKey && stats[tile.statKey] > 0 && (
                  <div className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-tighter border animate-pulse ${
                    isDark ? "bg-slate-800/80 border-rose-500/30 text-rose-400" : "bg-rose-50 border-rose-200 text-rose-600"
                  }`}>
                    {stats[tile.statKey]} {tile.id === 'inv' ? 'Low' : 'Act.'}
                  </div>
                )}
              </div>

              <div className="z-10">
                <h3 className={`text-lg font-bold flex items-center gap-2 transition-colors ${
                  isDark ? "text-white group-hover:text-cyan-400" : "text-slate-800 group-hover:text-blue-600"
                }`}>
                  {tile.title}
                  <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                </h3>
                <p className="text-[11px] text-slate-500 leading-tight line-clamp-2 mt-1 font-medium">
                  {tile.descriptionSm}
                </p>
              </div>

              <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

// --- Sub-components ---

function StatBadge({ label, value, color, isDark, alert }: { label: string, value: number, color: string, isDark: boolean, alert?: boolean }) {
  const colorMap: Record<string, string> = {
    rose: isDark ? "text-rose-400" : "text-rose-600",
    cyan: isDark ? "text-cyan-400" : "text-cyan-600",
    purple: isDark ? "text-purple-400" : "text-purple-600",
  };

  return (
    <div className={`rounded-xl p-3 flex items-center justify-between backdrop-blur-sm border transition-all ${
      isDark ? "bg-slate-800/30 border-slate-700/40" : "bg-white border-slate-200 shadow-sm"
    }`}>
      <p className="text-[9px] text-slate-500 font-bold uppercase">{label}</p>
      <span className={`text-sm font-black ${colorMap[color]} ${alert && value > 0 ? "animate-bounce" : ""}`}>
        {value}
      </span>
    </div>
  );
}