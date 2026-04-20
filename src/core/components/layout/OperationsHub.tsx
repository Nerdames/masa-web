"use client";

import React, { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { 
  Box, ShoppingCart, History, ArrowUpRight, 
  LayoutDashboard, Users, MapPin, ShieldCheck, Building2
} from "lucide-react";
import { Role } from "@prisma/client";

// UI Components
import TopBar from "@/core/components/layout/TopBar";

// --- Configuration (Retained Logic) ---
interface DashboardTile {
  id: string;
  title: string;
  descriptionSm: string;
  icon: React.ElementType;
  href: string;
  color: string;
  roles: Role[];
}

const TILES: DashboardTile[] = [
  { id: "ovw", title: "Admin Overview", descriptionSm: "System-wide analytics & KPIs.", icon: LayoutDashboard, href: "/admin/overview", color: "from-blue-600 to-indigo-600", roles: [Role.ADMIN, Role.DEV, Role.MANAGER] },
  { id: "org", title: "Identity & Defaults", descriptionSm: "Master defaults, UoM & global preferences.", icon: Building2, href: "/admin/myorg", color: "from-indigo-700 to-violet-800", roles: [Role.ADMIN, Role.DEV] },
  { id: "brn", title: "Branches", descriptionSm: "Manage Lagos & Regional HQ nodes.", icon: MapPin, href: "/admin/branches", color: "from-cyan-600 to-blue-500", roles: [Role.ADMIN, Role.DEV] },
  { id: "inv", title: "Inventory", descriptionSm: "Stock levels, Procurement & Vendors.", icon: Box, href: "/inventory", color: "from-emerald-600 to-teal-500", roles: [Role.ADMIN, Role.MANAGER, Role.DEV, Role.INVENTORY] },
  { id: "pos", title: "Point of Sale", descriptionSm: "Terminal interface for active trade.", icon: ShoppingCart, href: "/pos", color: "from-orange-500 to-amber-500", roles: [Role.ADMIN, Role.MANAGER, Role.DEV, Role.SALES, Role.CASHIER] },
  { id: "aud", title: "Forensic Audit", descriptionSm: "Integrity chain & activity logs.", icon: History, href: "/audit", color: "from-slate-700 to-slate-900", roles: [Role.ADMIN, Role.AUDITOR, Role.DEV] },
  { id: "psn", title: "Personnel", descriptionSm: "Staff roles, credentials & access.", icon: Users, href: "/admin/personnels", color: "from-purple-600 to-violet-500", roles: [Role.ADMIN, Role.DEV] },
];

export default function OperationsHub() {
  // 1. DATA FETCHING & STABILIZATION
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const handleTheme = () => {
      const hour = new Date().getHours();
      setIsDark(hour < 7 || hour >= 19);
    };
    handleTheme();
    setMounted(true);
    const timer = setInterval(handleTheme, 60000);
    return () => clearInterval(timer);
  }, []);

  const userRole = (session?.user?.role as Role) || Role.CASHIER;
  const allowedTiles = useMemo(() => 
    TILES.filter(t => t.roles.includes(userRole)), 
  [userRole]);

  if (!mounted) return <div className="h-screen w-screen bg-slate-50 dark:bg-[#020617]" />;

  return (
    <main className={`h-[100dvh] w-screen flex flex-col transition-colors duration-1000 overflow-hidden ${isDark ? "bg-[#020617] text-slate-200" : "bg-slate-50 text-slate-900"}`}>
      
      {/* 1. FIXED TOPBAR */}
      <div className="h-16 flex-shrink-0 z-50">
        <TopBar />
      </div>

      {/* 2. NAVIGATION CENTRAL HUB (Updated Padding/Scroll logic) */}
      <div className="flex-1 flex flex-col w-full max-w-7xl mx-auto p-4 md:p-8 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-400 dark:scrollbar-thumb-slate-800">
        
        <div className="flex flex-col mb-6">
          <h2 className="text-3xl md:text-4xl font-black tracking-tighter">
            Control <span className="text-slate-400 font-light">Terminal</span>
          </h2>
        </div>

        {/* Unified Grid Styling */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
          {allowedTiles.map((tile) => (
            <Link 
              key={tile.id} 
              href={tile.href} 
              className={`group relative flex flex-col justify-between p-6 rounded-2xl border transition-all duration-300 overflow-hidden ${
                isDark 
                ? "bg-slate-900/40 border-slate-800 hover:border-blue-500/50" 
                : "bg-white border-slate-200 hover:border-blue-600 shadow-sm hover:shadow-xl hover:shadow-blue-500/5"
              }`}
            >
              {/* Card Background Glow */}
              <div className={`absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br ${tile.color} opacity-[0.03] group-hover:opacity-[0.1] rounded-full blur-2xl transition-opacity`} />
              
              <div className="flex justify-between items-start z-10 mb-8">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${tile.color} shadow-lg shadow-black/10 transition-transform group-hover:-translate-y-1`}>
                  <tile.icon className="w-5 h-5 text-white" />
                </div>
              </div>

              <div className="z-10">
                <h3 className="text-lg font-black mb-1.5 tracking-tight group-hover:text-blue-500 transition-colors">
                  {tile.title}
                </h3>
                <p className="text-xs font-medium opacity-60 leading-relaxed max-w-[85%]">
                  {tile.descriptionSm}
                </p>
              </div>

              {/* Action Indicator */}
              <div className="absolute top-6 right-6 p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 opacity-100 transition-all duration-300 group-hover:bg-blue-600 group-hover:text-white">
                <ArrowUpRight className="w-3 h-3" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* 3. FOOTER (Retained Details) */}
      <footer className={`mt-auto px-6 py-3 border-t flex flex-wrap gap-y-3 justify-between items-center ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white border-slate-100"}`}>
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-black tracking-[0.2em] opacity-30">MASA-CORE-V2.0</span>
          </div>
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[10px] font-bold uppercase opacity-40">NGN_NODE_01</span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
             <span className="text-[9px] font-bold uppercase opacity-40 italic">Status:</span>
             <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Operational</span>
          </div>
          <div className="flex items-center gap-2">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
          </div>
        </div>
      </footer>
    </main>
  );
}