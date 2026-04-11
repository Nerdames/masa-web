"use client";

import React, { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { 
  Box, ShoppingCart, History, ArrowUpRight, 
  LayoutDashboard, Users, MapPin, ShieldCheck
} from "lucide-react";
import { Role } from "@prisma/client";
import { Session } from "next-auth";

// UI Components from your core library
import TopBar from "@/core/components/layout/TopBar";

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
  { id: "brn", title: "Branches", descriptionSm: "Manage Lagos & Regional HQ nodes.", icon: MapPin, href: "/admin/branches", color: "from-cyan-600 to-blue-500", roles: [Role.ADMIN, Role.DEV] },
  { id: "inv", title: "Inventory", descriptionSm: "Stock levels, Procurement & Vendors.", icon: Box, href: "/inventory", color: "from-emerald-600 to-teal-500", roles: [Role.ADMIN, Role.MANAGER, Role.DEV, Role.INVENTORY] },
  { id: "pos", title: "Point of Sale", descriptionSm: "Terminal interface for active trade.", icon: ShoppingCart, href: "/pos", color: "from-orange-500 to-amber-500", roles: [Role.ADMIN, Role.MANAGER, Role.DEV, Role.SALES, Role.CASHIER] },
  { id: "aud", title: "Forensic Audit", descriptionSm: "Integrity chain & activity logs.", icon: History, href: "/audit", color: "from-slate-700 to-slate-900", roles: [Role.ADMIN, Role.AUDITOR, Role.DEV] },
  { id: "psn", title: "Personnel", descriptionSm: "Staff roles, credentials & access.", icon: Users, href: "/admin/personnels", color: "from-purple-600 to-violet-500", roles: [Role.ADMIN, Role.DEV] },
];

export default function OperationsHub({ session }: { session: Session }) {
  // 1. STABILIZATION: Prevent blinking by tracking mount status
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  const user = session?.user;
  const userRole = (user?.role as Role) || Role.CASHIER;

  useEffect(() => {
    const handleTheme = () => {
      const hour = new Date().getHours();
      setIsDark(hour < 7 || hour >= 19);
    };

    handleTheme();
    setMounted(true); // Signal that we are safe to show the theme-specific UI

    const timer = setInterval(handleTheme, 60000);
    return () => clearInterval(timer);
  }, []);

  const allowedTiles = useMemo(() => 
    TILES.filter(t => t.roles.includes(userRole)), 
  [userRole]);

  // If not mounted, return a neutral background or skeleton to prevent the "blink"
  if (!mounted) return <div className="min-h-screen bg-slate-50 dark:bg-[#020617]" />;

  return (
    <main className={`min-h-[100dvh] w-screen flex flex-col transition-colors duration-1000 overflow-x-hidden ${isDark ? "bg-[#020617] text-slate-200" : "bg-slate-50 text-slate-900"}`}>
      
      {/* 1. FIXED TOPBAR */}
      <div className="h-16 flex-shrink-0 fixed top-0 left-0 right-0 z-50">
        <TopBar />
      </div>

      {/* 2. NAVIGATION CENTRAL HUB */}
      <div className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-8 flex flex-col justify-center mt-16">
        <section className="py-6 md:py-0">
          
          <div className="flex flex-col mb-6">
            <h2 className="text-3xl md:text-4xl font-black tracking-tighter">
              Control <span className="text-slate-400 font-light">Terminal</span>
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-12">
            {allowedTiles.map((tile) => (
              <Link key={tile.id} href={tile.href} className={`group relative p-8 rounded-3xl border transition-all duration-500 overflow-hidden
                ${isDark ? "bg-slate-900/40 border-slate-800 hover:border-slate-600" : "bg-white border-slate-200 hover:border-blue-600 shadow-sm hover:shadow-2xl hover:shadow-blue-500/10"}`}>
                
                <div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-br ${tile.color} opacity-[0.04] rounded-full -mr-20 -mt-20 transition-transform group-hover:scale-150 duration-700`} />
                
                <div className={`inline-flex p-4 rounded-2xl bg-gradient-to-br ${tile.color} mb-6 shadow-xl shadow-black/10 transition-transform group-hover:-translate-y-1`}>
                  <tile.icon className="w-6 h-6 text-white" />
                </div>
                
                <h3 className="text-xl font-black mb-2 tracking-tight group-hover:text-blue-500 transition-colors">{tile.title}</h3>
                <p className="text-xs font-medium opacity-50 leading-relaxed max-w-[90%]">{tile.descriptionSm}</p>
                
                {/* ARROW: Restored and stabilized for all modes */}
                <div className="absolute top-8 right-8 p-2 rounded-full bg-slate-100 dark:bg-slate-800 opacity-100 transition-all duration-300 group-hover:bg-blue-500 group-hover:text-white">
                  <ArrowUpRight className="w-4 h-4" />
                </div>

                <div className="mt-6 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="h-1 w-1 rounded-full bg-blue-500" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Launch Module</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* 3. FOOTER */}
      <footer className={`mt-auto px-6 md:px-10 py-2 border-t flex flex-wrap gap-y-3 justify-between items-center ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-white border-slate-100"}`}>
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-black tracking-[0.2em] opacity-30">MASA-CORE-V2.0</span>
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span className="text-[10px] font-bold uppercase opacity-40">NGN_NODE_01</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
             <span className="text-[9px] font-bold uppercase opacity-40 italic">System Status:</span>
             <span className="text-[9px] font-black text-emerald-500 uppercase">Operational</span>
          </div>
          <div className="flex items-center gap-2">
             <span className="text-[9px] font-bold uppercase opacity-40 tracking-widest">Active</span>
             <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
          </div>
        </div>
      </footer>
    </main>
  );
}