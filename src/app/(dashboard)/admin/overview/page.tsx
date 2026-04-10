"use client";

import React, { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Box,
  ShoppingCart,
  ClipboardCheck,
  History,
  ArrowUpRight,
  LayoutDashboard,
  Building2,
  Users,
  FileSearch,
  RefreshCw,
  MapPin
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
  category: "ADMIN" | "CORE" | "AUDIT";
  statKey?: keyof DashboardStats;
}

// --- Configuration (Integrated Management & Audit) ---
// Note: AUDITOR role integration reflects the schema update for Premium Audit access[cite: 1]
const TILES: DashboardTile[] = [
  // --- ADMIN / MANAGEMENT SECTION ---
  { id: "ovw", category: "ADMIN", title: "System Overview", descriptionSm: "Global performance metrics.", icon: LayoutDashboard, href: "/admin/overview", color: "from-indigo-600 to-blue-500", roles: ["ADMIN", "MANAGER", "DEV"] },
  { id: "brn", category: "ADMIN", title: "Branches", descriptionSm: "Manage multiple locations.", icon: Building2, href: "/admin/branches", color: "from-blue-600 to-cyan-500", roles: ["ADMIN", "DEV"] },
  { id: "psn", category: "ADMIN", title: "Personnel", descriptionSm: "Access & user management.", icon: Users, href: "/admin/personnels", color: "from-cyan-600 to-teal-500", roles: ["ADMIN", "DEV"] },

  // --- CORE OPERATIONS ---
  { id: "inv", category: "CORE", title: "Inventory", descriptionSm: "Stock levels & alerts.", icon: Box, href: "/terminal/inventory", color: "from-emerald-600 to-teal-500", roles: ["ADMIN", "MANAGER", "INVENTORY", "AUDITOR", "DEV"], statKey: "lowStock" },
  { id: "po", category: "CORE", title: "Orders", descriptionSm: "Purchases & receiving.", icon: ShoppingCart, href: "/terminal/purchase-orders", color: "from-amber-500 to-orange-500", roles: ["ADMIN", "MANAGER", "INVENTORY", "DEV"], statKey: "activeOrders" },
  { id: "app", category: "CORE", title: "Approvals", descriptionSm: "Pending system requests.", icon: ClipboardCheck, href: "/terminal/approvals", color: "from-purple-600 to-indigo-500", roles: ["ADMIN", "MANAGER", "DEV", "AUDITOR"], statKey: "pendingApprovals" },

  // --- AUDIT & FORENSICS ---
  { id: "aud", category: "AUDIT", title: "Audit Logs", descriptionSm: "System-wide action tracking.", icon: History, href: "/terminal/audit", color: "from-slate-700 to-slate-900", roles: ["ADMIN", "AUDITOR", "DEV"] },
  { id: "rep", category: "AUDIT", title: "Forensic Reports", descriptionSm: "Deep-dive data insights.", icon: FileSearch, href: "/terminal/reports", color: "from-rose-500 to-pink-500", roles: ["ADMIN", "MANAGER", "AUDITOR", "DEV"] },
  { id: "trn", category: "AUDIT", title: "Transfers", descriptionSm: "Inter-branch logistics.", icon: ArrowUpRight, href: "/terminal/transfers", color: "from-sky-600 to-indigo-500", roles: ["ADMIN", "MANAGER", "INVENTORY", "AUDITOR", "DEV"], statKey: "inTransit" },
];

export default function AdminOverviewDashboard() {
  const { data: session } = useSession({ refetchInterval: 0, refetchOnWindowFocus: false });
  const [stats, setStats] = useState<DashboardStats>({ lowStock: 0, pendingApprovals: 0, activeOrders: 0, inTransit: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/inventory/stats");
        if (res.ok) setStats(await res.json());
      } catch (err) { console.error("Stats sync failed"); }
    };
    fetchStats();
  }, []);

  const userRole = (session?.user?.role as Role) || "CASHIER";
  const allowedTiles = useMemo(() => TILES.filter(t => t.roles.includes(userRole)), [userRole]);

  // Dynamically group tiles based on user's authorized access
  const adminTiles = allowedTiles.filter(t => t.category === "ADMIN");
  const coreTiles = allowedTiles.filter(t => t.category === "CORE");
  const auditTiles = allowedTiles.filter(t => t.category === "AUDIT");

  return (
    <div className="flex-1 flex flex-col w-full h-full p-4 md:p-6 lg:p-8 overflow-y-auto no-scrollbar relative z-10">
      
      {/* Overview Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 shrink-0 bg-white/50 p-6 rounded-3xl border border-white/60 shadow-sm backdrop-blur-md">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-slate-900 drop-shadow-sm">
            System Overview
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                {session?.user?.branchName || "Global Node"}
              </span>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">•</span>
            <div className="flex items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700 bg-indigo-50/80 px-2.5 py-1 rounded-lg border border-indigo-100">
                {userRole} ACCESS
              </span>
            </div>
          </div>
        </div>

        {/* Global System Ticker */}
        <div className="flex items-center gap-4 lg:gap-6 bg-white/70 p-3 lg:p-4 rounded-2xl border border-blue-50/50 shadow-sm">
          <TickerItem label="Low Stock" value={stats.lowStock} color="rose" />
          <TickerItem label="Approvals" value={stats.pendingApprovals} color="purple" />
          <TickerItem label="Transit" value={stats.inTransit} color="cyan" />
          <div className="hidden lg:flex items-center gap-2 pl-4 border-l border-slate-200">
            <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin-slow" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Live</span>
          </div>
        </div>
      </div>

      {/* Role-Based Grids */}
      <div className="flex flex-col gap-8 pb-10">
        {adminTiles.length > 0 && (
          <DashboardSection title="Management & Administration" tiles={adminTiles} stats={stats} />
        )}
        
        {coreTiles.length > 0 && (
          <DashboardSection title="Core Operations" tiles={coreTiles} stats={stats} />
        )}
        
        {auditTiles.length > 0 && (
          <DashboardSection title="Audit & Compliance" tiles={auditTiles} stats={stats} />
        )}
      </div>
    </div>
  );
}

function DashboardSection({ title, tiles, stats }: { title: string, tiles: DashboardTile[], stats: DashboardStats }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">{title}</h2>
        <div className="h-px flex-1 bg-gradient-to-r from-slate-300/60 to-transparent" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {tiles.map((tile) => (
          <Link
            key={tile.id}
            href={tile.href}
            className="group relative flex flex-col p-6 rounded-3xl bg-white/60 backdrop-blur-sm border border-white/80 shadow-sm hover:shadow-md hover:border-blue-300/50 hover:bg-white/90 transition-all duration-300 overflow-hidden"
          >
            {/* Background color glow on hover */}
            <div className={`absolute -right-12 -top-12 w-40 h-40 bg-gradient-to-br ${tile.color} opacity-0 rounded-full blur-3xl group-hover:opacity-10 transition-opacity duration-500`} />
            
            <div className="flex justify-between items-start mb-6 relative z-10">
              <div className={`p-3.5 rounded-2xl bg-gradient-to-br ${tile.color} shadow-md group-hover:scale-105 transition-transform duration-300`}>
                <tile.icon className="w-5 h-5 text-white" />
              </div>
              
              {tile.statKey && stats[tile.statKey] > 0 && (
                <div className="px-3 py-1 rounded-xl text-[10px] font-black tracking-widest bg-rose-50/80 border border-rose-200/50 text-rose-600 shadow-sm animate-pulse">
                  {stats[tile.statKey]} ALERT
                </div>
              )}
            </div>

            <div className="relative z-10">
              <h3 className="text-lg font-bold tracking-tight text-slate-800 group-hover:text-blue-700 transition-colors">
                {tile.title}
              </h3>
              <p className="text-[13px] text-slate-500 font-medium leading-relaxed mt-1">
                {tile.descriptionSm}
              </p>
            </div>

            <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all duration-300">
               <ArrowUpRight className="w-5 h-5 text-blue-500" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TickerItem({ label, value, color }: { label: string, value: number, color: string }) {
  const colors = {
    rose: "text-rose-600 bg-rose-50/80 border-rose-100/50",
    purple: "text-purple-600 bg-purple-50/80 border-purple-100/50",
    cyan: "text-cyan-600 bg-cyan-50/80 border-cyan-100/50",
  }[color as 'rose' | 'purple' | 'cyan'];

  return (
    <div className="flex items-center gap-2">
      <span className="hidden sm:inline text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}:</span>
      <span className={`text-xs font-black px-2 py-0.5 rounded-lg border shadow-sm ${colors}`}>{value}</span>
    </div>
  );
}