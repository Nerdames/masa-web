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
  { id: "inv", title: "Inventory", descriptionSm: "Stock levels & safety stock.", icon: Box, href: "/terminal/inventory", color: "from-blue-600 to-cyan-500", roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.AUDITOR, Role.DEV], statKey: "lowStock" },
  { id: "po", title: "Purchase Orders", descriptionSm: "Create POs & track receipts.", icon: ShoppingCart, href: "/terminal/purchase-orders", color: "from-emerald-600 to-teal-500", roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.DEV], statKey: "activeOrders" },
  { id: "grn", title: "Goods Receipts", descriptionSm: "Reconcile POs & update stock.", icon: PackageCheck, href: "/terminal/grns", color: "from-amber-500 to-orange-500", roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.DEV] },
  { id: "app", title: "Approvals", descriptionSm: "Price updates & adjustments.", icon: ClipboardCheck, href: "/terminal/approvals", color: "from-purple-600 to-indigo-500", roles: [Role.ADMIN, Role.MANAGER, Role.DEV], statKey: "pendingApprovals" },
  { id: "stk", title: "Stock Take", descriptionSm: "Physical counts & logs.", icon: RefreshCw, href: "/terminal/stock-takes", color: "from-orange-500 to-amber-500", roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.DEV] },
  { id: "trn", title: "Transfers", descriptionSm: "Inter-branch movements.", icon: ArrowUpRight, href: "/terminal/transfers", color: "from-sky-600 to-indigo-500", roles: [Role.ADMIN, Role.MANAGER, Role.INVENTORY, Role.DEV], statKey: "inTransit" },
  { id: "rep", title: "Reports", descriptionSm: "Valuation & audit insights.", icon: BarChart3, href: "/terminal/reports", color: "from-rose-500 to-pink-500", roles: [Role.ADMIN, Role.MANAGER, Role.AUDITOR, Role.DEV] },
  { id: "ref", title: "Returns", descriptionSm: "Refunds & restocking.", icon: AlertTriangle, href: "/terminal/refunds", color: "from-red-600 to-rose-500", roles: [Role.ADMIN, Role.MANAGER, Role.DEV] },
];

export default function TerminalDashboard() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<DashboardStats>({ lowStock: 0, pendingApprovals: 0, activeOrders: 0, inTransit: 0 });
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const updateTheme = () => {
      const hour = new Date().getHours();
      setIsDark(hour < 7 || hour >= 19);
    };
    updateTheme();
    const timer = setInterval(updateTheme, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch("/api/inventory/stats")
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(() => console.error("Stats offline"));
  }, []);

  const userRole = (session?.user?.role as Role) || Role.CASHIER;
  const allowedTiles = useMemo(() => TILES.filter(t => t.roles.includes(userRole)), [userRole]);

  return (
    <main className={`h-[100dvh] w-screen flex flex-col transition-colors duration-1000 overflow-hidden ${isDark ? "bg-[#020617] text-slate-200" : "bg-slate-50 text-slate-900"}`}>
      
      {/* 1. CONTENT AREA - Made scrollable while parent stays fixed */}
      <div className="flex-1 flex flex-col w-full max-w-7xl mx-auto p-4 md:p-8 overflow-y-auto 
        scrollbar-thin scrollbar-thumb-slate-400 dark:scrollbar-thumb-slate-800">
        
          <div className="flex flex-col mb-6">
            <h2 className="text-3xl md:text-4xl font-black tracking-tighter">
              Inventory <span className="text-slate-400 font-light">Hub</span>
            </h2>
          </div>

        {/* Unified Grid - Scrolls naturally inside the flex-1 container */}
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
              <div className={`absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br ${tile.color} opacity-[0.03] group-hover:opacity-[0.1] rounded-full blur-2xl transition-opacity`} />

              <div className="flex justify-between items-start z-10 mb-8">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${tile.color} shadow-lg shadow-black/10 transition-transform group-hover:-translate-y-1`}>
                  <tile.icon className="w-5 h-5 text-white" />
                </div>

                {tile.statKey && stats[tile.statKey] > 0 && (
                  <div className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-tighter border animate-pulse ${
                    isDark ? "bg-slate-800 border-rose-500/30 text-rose-400" : "bg-rose-50 border-rose-200 text-rose-600"
                  }`}>
                    {stats[tile.statKey]} {tile.id === 'inv' ? 'Low' : 'Act.'}
                  </div>
                )}
              </div>

              <div className="z-10">
                <h3 className="text-lg font-black mb-1.5 tracking-tight group-hover:text-blue-500 transition-colors">
                  {tile.title}
                </h3>
                <p className="text-xs font-medium opacity-60 leading-relaxed max-w-[80%]">
                  {tile.descriptionSm}
                </p>
              </div>

              <div className="absolute top-6 right-6 p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                <ArrowUpRight className="w-3 h-3" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}