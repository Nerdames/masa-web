"use client";

import React, { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { 
  History, FileSearch, Scale, 
  ArrowUpRight, Fingerprint, 
  RefreshCcw, Landmark
} from "lucide-react";
import { Role } from "@prisma/client";
import { Session } from "next-auth";

interface DashboardTile {
  id: string;
  title: string;
  descriptionSm: string;
  icon: React.ElementType;
  href: string;
  color: string;
  roles: Role[];
}

const AUDITOR_TILES: DashboardTile[] = [
  { 
    id: "flogs", 
    title: "Forensic Logs", 
    descriptionSm: "System-wide activity logs & hash chain verification.", 
    icon: Fingerprint, 
    href: "/audit/logs", 
    color: "from-slate-800 to-slate-950", 
    roles: [Role.AUDITOR, Role.ADMIN, Role.DEV] 
  },
  { 
    id: "approvals", 
    title: "Approval Queue", 
    descriptionSm: "Review VOID, PRICE_UPDATE & STOCK_ADJUST requests.", 
    icon: Scale, 
    href: "/audit/approvals", 
    color: "from-amber-600 to-orange-700", 
    roles: [Role.AUDITOR, Role.ADMIN, Role.MANAGER] 
  },
  { 
    id: "stk_audit", 
    title: "Stock Audit", 
    descriptionSm: "Inspect StockTakes & inventory discrepancies.", 
    icon: FileSearch, 
    href: "/audit/stock-takes", 
    color: "from-indigo-600 to-blue-700", 
    roles: [Role.AUDITOR, Role.ADMIN, Role.INVENTORY] 
  },
  { 
    id: "reconcile", 
    title: "Reconciliation", 
    descriptionSm: "Cross-reference POS sessions vs actual bank deposits.", 
    icon: RefreshCcw, 
    href: "/audit/reconciliation", 
    color: "from-emerald-600 to-teal-700", 
    roles: [Role.AUDITOR, Role.ADMIN] 
  },
  { 
    id: "returns", 
    title: "Refund Monitor", 
    descriptionSm: "Audit processed refunds & restocked items.", 
    icon: History, 
    href: "/terminal/refunds", 
    color: "from-rose-600 to-red-700", 
    roles: [Role.AUDITOR, Role.ADMIN, Role.MANAGER] 
  },
  { 
    id: "compliance", 
    title: "Node Integrity", 
    descriptionSm: "Monitor login IPs & device-level access logs.", 
    icon: Landmark, 
    href: "/audit/nodes", 
    color: "from-blue-700 to-indigo-900", 
    roles: [Role.AUDITOR, Role.DEV] 
  },
];

export default function AuditorHub({ session }: { session: Session }) {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  const user = session?.user;
  const userRole = (user?.role as Role) || Role.AUDITOR;

  useEffect(() => {
    const handleTheme = () => {
      const hour = new Date().getHours();
      setIsDark(hour < 7 || hour >= 19);
    };

    handleTheme();
    setMounted(true); // Prevents theme blinking on load

    const timer = setInterval(handleTheme, 60000);
    return () => clearInterval(timer);
  }, []);

  const allowedTiles = useMemo(() => 
    AUDITOR_TILES.filter(t => t.roles.includes(userRole)), 
  [userRole]);

  // Prevent flicker during hydration
  if (!mounted) return <div className="min-h-screen bg-slate-50 dark:bg-[#020617]" />;

  return (
    <main className={`min-h-[100dvh] w-screen flex flex-col transition-colors duration-1000 overflow-x-hidden ${isDark ? "bg-[#020617] text-slate-200" : "bg-slate-50 text-slate-900"}`}>

      <div className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-8 flex flex-col justify-center">
        <section className="py-6 md:py-0">
          <div className="flex flex-col mb-6">
            <h2 className="text-3xl md:text-4xl font-black tracking-tighter">
              Audit <span className="text-slate-400 font-light">Hub</span>
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-12">
            {allowedTiles.map((tile) => (
              <Link key={tile.id} href={tile.href} className={`group relative p-8 rounded-3xl border transition-all duration-500 overflow-hidden
                ${isDark ? "bg-slate-900/40 border-slate-800 hover:border-slate-600" : "bg-white border-slate-200 hover:border-blue-600 shadow-sm hover:shadow-2xl hover:shadow-blue-500/10"}`}>
                
                {/* Visual Accent */}
                <div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-br ${tile.color} opacity-[0.04] rounded-full -mr-20 -mt-20 transition-transform group-hover:scale-150 duration-700`} />
                
                <div className={`inline-flex p-4 rounded-2xl bg-gradient-to-br ${tile.color} mb-6 shadow-xl shadow-black/10 transition-transform group-hover:-translate-y-1`}>
                  <tile.icon className="w-6 h-6 text-white" />
                </div>
                
                <h3 className="text-xl font-black mb-2 tracking-tight group-hover:text-blue-500 transition-colors">{tile.title}</h3>
                <p className="text-xs font-medium opacity-50 leading-relaxed max-w-[90%]">{tile.descriptionSm}</p>
                
                {/* ARROW: Fixed visibility logic */}
                <div className="absolute top-8 right-8 p-2 rounded-full bg-slate-100 dark:bg-slate-800 opacity-100 transition-all duration-300 group-hover:bg-blue-600 group-hover:text-white">
                  <ArrowUpRight className="w-4 h-4" />
                </div>

                <div className="mt-6 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="h-1 w-1 rounded-full bg-blue-500" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Access Node</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}