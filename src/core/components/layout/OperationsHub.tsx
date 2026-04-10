"use client";

import React, { useMemo, useEffect, useState, useCallback } from "react";
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

/**
 * MASA v2.0 - Operations Hub Routing Configuration
 * Optimized for (dashboard), (terminal), and (tools) route groups.
 */
const TILES: DashboardTile[] = [
  { id: "ovw", title: "Admin Overview", descriptionSm: "System-wide analytics & KPIs.", icon: LayoutDashboard, href: "/admin/overview", color: "from-blue-600 to-indigo-600", roles: [Role.ADMIN, Role.DEV, Role.MANAGER] },
  { id: "brn", title: "Branches", descriptionSm: "Manage Lagos & Regional HQ nodes.", icon: MapPin, href: "/admin/branches", color: "from-cyan-600 to-blue-500", roles: [Role.ADMIN, Role.DEV] },
  { id: "inv", title: "Inventory", descriptionSm: "Stock levels, Procurement & Vendors.", icon: Box, href: "/terminal/inventory", color: "from-emerald-600 to-teal-500", roles: [Role.ADMIN, Role.MANAGER, Role.DEV, Role.INVENTORY] },
  { id: "pos", title: "Point of Sale", descriptionSm: "Terminal interface for active trade.", icon: ShoppingCart, href: "/terminal/pos", color: "from-orange-500 to-amber-500", roles: [Role.ADMIN, Role.MANAGER, Role.DEV, Role.SALES, Role.CASHIER] },
  { id: "aud", title: "Forensic Audit", descriptionSm: "Integrity chain & activity logs.", icon: History, href: "/audit", color: "from-slate-700 to-slate-900", roles: [Role.ADMIN, Role.AUDITOR, Role.DEV] },
  { id: "psn", title: "Personnel", descriptionSm: "Staff roles, credentials & access.", icon: Users, href: "/admin/personnels", color: "from-purple-600 to-violet-500", roles: [Role.ADMIN, Role.DEV] },
];

export default function OperationsHub({ session }: { session: Session }) {
  const [isDark, setIsDark] = useState(false);

  const user = session?.user;
  const userRole = (user?.role as Role) || Role.CASHIER;

  /**
   * Eye Protection: Time-based theme hardening
   * Automatically shifts to Dark Mode between 19:00 and 07:00
   */
  useEffect(() => {
    const handleTheme = () => {
      const hour = new Date().getHours();
      setIsDark(hour < 7 || hour >= 19);
    };

    handleTheme();
    const timer = setInterval(handleTheme, 60000); // Check every minute
    return () => clearInterval(timer);
  }, []);

  const allowedTiles = useMemo(() => 
    TILES.filter(t => t.roles.includes(userRole)), 
  [userRole]);

  return (
    <main className={`h-screen w-screen flex flex-col transition-colors duration-1000 overflow-hidden ${isDark ? "bg-[#020617] text-slate-200" : "bg-slate-50 text-slate-900"}`}>
      
      {/* 1. SHARED TOPBAR */}
      <TopBar />

      {/* 2. NAVIGATION CENTRAL HUB */}
      <div className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-8 flex flex-col justify-center">
        <section>
          <div className="flex items-center gap-2 mb-8">
             <div className={`h-1.5 w-1.5 rounded-full animate-pulse ${isDark ? "bg-cyan-500 shadow-[0_0_8px_cyan]" : "bg-blue-600"}`} />
             <h1 className="text-sm font-black uppercase tracking-[0.2em] opacity-80">Operations Hub</h1>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
            {allowedTiles.map((tile) => (
              <Link key={tile.id} href={tile.href} className={`group relative p-6 rounded-2xl border transition-all duration-300 overflow-hidden
                ${isDark ? "bg-slate-900/40 border-slate-800 hover:border-blue-500/50" : "bg-white border-slate-200 hover:border-blue-600 shadow-sm hover:shadow-xl hover:shadow-blue-500/5"}`}>
                
                {/* Background Accent */}
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${tile.color} opacity-[0.03] rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150`} />
                
                <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${tile.color} mb-5 shadow-lg shadow-blue-500/10`}>
                  <tile.icon className="w-5 h-5 text-white" />
                </div>
                
                <h3 className="text-lg font-black mb-1.5 tracking-tight group-hover:text-blue-500 transition-colors">{tile.title}</h3>
                <p className="text-xs font-medium opacity-60 leading-relaxed max-w-[80%]">{tile.descriptionSm}</p>
                
                <div className="absolute top-6 right-6 p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                  <ArrowUpRight className="w-3 h-3" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* 3. FOOTER - NODE IDENTIFIER */}
      <footer className={`mt-auto px-8 py-4 border-t flex justify-between items-center ${isDark ? "bg-slate-900/30 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
        <div className="flex items-center gap-4">
          <span className="text-[9px] font-black uppercase tracking-widest opacity-40">MASA-CORE-V2.0-FORTRESS</span>
          <div className="h-3 w-px bg-slate-200 dark:bg-slate-800" />
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3 h-3 text-emerald-500" />
            <span className="text-[9px] font-bold uppercase opacity-40">NGN_NODE_01_SECURE</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <span className="text-[9px] font-bold uppercase opacity-40">Status:</span>
           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        </div>
      </footer>
    </main>
  );
}