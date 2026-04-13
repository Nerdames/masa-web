"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { 
  Search, Plus, Edit2, Trash2, ShieldCheck, 
  AlertTriangle, CheckCircle2, Package, 
  TrendingDown, RefreshCw, Loader2, Info,
  Lock
} from "lucide-react";

// -----------------------------
// SCHEMA-ALIGNED TYPES (Synchronized with Actions)
// -----------------------------
enum Role {
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  SALES = "SALES",
  INVENTORY = "INVENTORY",
  CASHIER = "CASHIER",
  DEV = "DEV",
  AUDITOR = "AUDITOR",
}

enum Severity { 
  LOW = "LOW", 
  MEDIUM = "MEDIUM", 
  HIGH = "HIGH", 
  CRITICAL = "CRITICAL" 
}

interface IBranchProduct {
  id: string;
  stock: number;
  stockVersion: number;
  reorderLevel: number;
  safetyStock: number;
  sellingPrice: number;
  costPrice: number;
  product: {
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    category: { id: string; name: string } | null;
    uom: { id: string; name: string; abbreviation: string } | null;
  };
}

interface IActivityLog {
  id: string;
  action: string;
  actorRole: Role | null;
  createdAt: string;
  severity: Severity;
  description: string;
  metadata?: any;
}

export default function FortressInventoryWorkspace({ branchId }: { branchId: string }) {
  const [inventory, setInventory] = useState<IBranchProduct[]>([]);
  const [logs, setLogs] = useState<IActivityLog[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // -----------------------------
  // TIME-AWARE THEME (19:00 - 07:00)
  // -----------------------------
  useEffect(() => {
    const applyTimeAwareTheme = () => {
      const hour = new Date().getHours();
      if (hour >= 19 || hour < 7) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    };
    applyTimeAwareTheme();
    const themeInterval = setInterval(applyTimeAwareTheme, 60000);
    return () => clearInterval(themeInterval);
  }, []);

  // -----------------------------
  // DATA SYNCHRONIZATION
  // -----------------------------
  const loadWorkspaceData = () => {
    if (!branchId) return;
    
    startTransition(async () => {
      setError(null);
      try {
        // Parallel fetch for Inventory and Ledger per updated API structure
        const [invRes, logRes] = await Promise.all([
          fetch(`/api/inventory/fortress?branchId=${branchId}&type=inventory&limit=100`),
          fetch(`/api/inventory/fortress?branchId=${branchId}&type=ledger&limit=20`)
        ]);

        if (invRes.status === 403 || logRes.status === 403) {
          throw new Error("ACCESS_DENIED: You are not authorized for this branch.");
        }

        if (!invRes.ok || !logRes.ok) throw new Error("Sync failure with Fortress vault.");

        const invData = await invRes.json();
        const logData = await logRes.json();

        setInventory(invData.items || []);
        setLogs(logData.items || []);
      } catch (err: any) {
        console.error("Fortress Integration Error:", err);
        setError(err.message);
      }
    });
  };

  useEffect(() => { 
    loadWorkspaceData(); 
  }, [branchId]);

  // -----------------------------
  // CALCULATIONS
  // -----------------------------
  const stats = useMemo(() => {
    const totalItems = inventory.length;
    const criticalStock = inventory.filter(i => i.stock <= i.safetyStock).length;
    const lowStock = inventory.filter(i => i.stock > i.safetyStock && i.stock <= i.reorderLevel).length;
    const assetValuation = inventory.reduce((acc, curr) => acc + (curr.stock * curr.costPrice), 0);
    return { totalItems, criticalStock, lowStock, assetValuation };
  }, [inventory]);

  const filteredInventory = inventory.filter((item) => {
    const term = searchTerm.toLowerCase();
    return (
      item.product.sku.toLowerCase().includes(term) ||
      item.product.name.toLowerCase().includes(term) ||
      (item.product.category?.name || "").toLowerCase().includes(term)
    );
  });

  const getStatusConfig = (stock: number, reorder: number, safety: number) => {
    if (stock <= safety) return { label: "CRITICAL", classes: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800", icon: AlertTriangle };
    if (stock <= reorder) return { label: "REORDER", classes: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800", icon: TrendingDown };
    return { label: "OPTIMAL", classes: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800", icon: CheckCircle2 };
  };

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans relative overflow-hidden transition-colors duration-300">

      {/* CENTERED LOADING ANIMATION */}
      {isPending && (
        <div className="absolute inset-0 flex justify-center items-center bg-white/60 dark:bg-slate-950/60 backdrop-blur-[2px] z-[200]">
           <div className="flex flex-col items-center gap-3">
             <Loader2 className="w-10 h-10 text-blue-600 dark:text-blue-500 animate-spin" />
             <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Synchronizing Ledger...</span>
           </div>
        </div>
      )}

      <header className="w-full flex flex-col bg-white dark:bg-slate-900 border-b border-black/[0.04] dark:border-slate-800 shrink-0 sticky top-0 z-[40] transition-colors">
        <div className="w-full flex items-center justify-between px-4 py-2 min-w-0 h-14">
          <div className="min-w-0 flex-1 md:flex-none flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-lg shadow-sm">
              <Package className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="truncate text-[16px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
                Inventory Fortress
              </h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide">End-to-End Forensic Traceability</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:relative sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="SKU_REGISTRY_SEARCH..."
                className="bg-slate-100/80 dark:bg-slate-800/80 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-48 md:w-64 rounded-md focus:ring-1 focus:ring-blue-500 transition-all outline-none dark:text-white"
              />
            </div>

            <button 
              onClick={loadWorkspaceData}
              disabled={isPending}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors flex items-center justify-center disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin text-blue-500" : ""}`} />
            </button>

            <button className="hidden md:flex h-8 px-3 bg-blue-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-blue-700 transition-all items-center gap-1.5 shadow-sm">
              <Plus className="w-3.5 h-3.5" />
              <span>Provision</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar pb-12">
        {/* ERROR STATE */}
        {error && (
          <div className="mx-4 lg:mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-lg flex items-center gap-3 text-red-600 dark:text-red-400">
            <Lock className="w-4 h-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">{error}</span>
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4 lg:px-6 py-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between shadow-sm transition-colors">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Active SKUs</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalItems}</h3>
              <Package className="w-5 h-5 text-slate-300 dark:text-slate-600" />
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between shadow-sm transition-colors">
            <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Asset Valuation</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white"><span className="text-sm text-slate-400 dark:text-slate-500 font-medium mr-1">₦</span>{stats.assetValuation.toLocaleString()}</h3>
              <CheckCircle2 className="w-5 h-5 text-blue-200 dark:text-blue-900/50" />
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between shadow-sm transition-colors">
            <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Reorder Warning</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.lowStock}</h3>
              <TrendingDown className="w-5 h-5 text-amber-200 dark:text-amber-900/50" />
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between shadow-sm transition-colors">
            <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">Critical Stock</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.criticalStock}</h3>
              <AlertTriangle className="w-5 h-5 text-red-200 dark:text-red-900/50" />
            </div>
          </div>
        </section>

        <main className="px-4 lg:px-6 flex flex-col xl:flex-row gap-6">
          <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200/60 dark:border-slate-800 overflow-hidden flex flex-col min-h-[500px] transition-colors">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80">
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Product Registry</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Pricing (₦)</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Ledger Stock</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">System Health</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredInventory.map((item) => {
                    const status = getStatusConfig(item.stock, item.reorderLevel, item.safetyStock);
                    const StatusIcon = status.icon;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div>
                              <div className="text-[13px] font-bold text-slate-900 dark:text-white">{item.product.name}</div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                                {item.product.sku}
                                <span className="inline-block w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                                v{item.stockVersion}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-3">
                          <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wide">
                            {item.product.category?.name || "UNGROUPED"}
                          </span>
                        </td>

                        <td className="px-5 py-3 text-right">
                          <div className="text-[13px] font-bold text-slate-900 dark:text-white">{item.sellingPrice.toLocaleString()}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5 font-medium">Cost: {item.costPrice.toLocaleString()}</div>
                        </td>

                        <td className="px-5 py-3 text-right">
                          <div className="flex items-baseline justify-end gap-1">
                            <span className="text-[14px] font-bold text-slate-900 dark:text-white">{item.stock}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">{item.product.uom?.abbreviation || 'unit'}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Min: {item.safetyStock} | Re: {item.reorderLevel}
                          </div>
                        </td>

                        <td className="px-5 py-3 text-center">
                          <div className="flex justify-center">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-bold tracking-widest border ${status.classes}`}>
                              <StatusIcon className="w-3 h-3" />
                              {status.label}
                            </span>
                          </div>
                        </td>

                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="p-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 transition-colors">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button className="p-1.5 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 border border-slate-200 dark:border-slate-700 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="w-full xl:w-[320px] flex-shrink-0">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 h-full max-h-[500px] overflow-y-auto custom-scrollbar shadow-sm transition-colors">
              <div className="flex items-center justify-between mb-5 sticky top-0 bg-white dark:bg-slate-900 pb-3 border-b border-slate-100 dark:border-slate-800 z-10 transition-colors">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                  <h4 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Audit Ledger</h4>
                </div>
                <span className="flex relative h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
              </div>

              <div className="space-y-4">
                {logs.map((log) => (
                  <div key={log.id} className="relative pl-3">
                    <div className="absolute left-0 top-1.5 bottom-[-16px] w-px bg-slate-100 dark:bg-slate-800 last:hidden"></div>
                    <div className={`absolute left-[-3px] top-1.5 w-1.5 h-1.5 rounded-full ring-2 ring-white dark:ring-slate-950 ${
                      log.severity === Severity.CRITICAL ? 'bg-red-500' :
                      log.severity === Severity.HIGH ? 'bg-orange-500' :
                      log.severity === Severity.MEDIUM ? 'bg-blue-500' : 'bg-slate-300'
                    }`}></div>

                    <div className="bg-slate-50/50 dark:bg-slate-800/30 rounded-md p-2.5 border border-slate-100/80 dark:border-slate-700/50 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest truncate max-w-[150px]">
                          {log.action}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-700 dark:text-slate-400 mt-1 leading-snug">{log.description}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[8px] font-bold text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-800 px-1.5 py-0.5 rounded uppercase">
                          {log.actorRole || 'SYSTEM'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {logs.length === 0 && !isPending && (
                  <div className="text-center py-8">
                     <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-slate-200 dark:text-slate-700" />
                     <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">Clean Vault</p>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}