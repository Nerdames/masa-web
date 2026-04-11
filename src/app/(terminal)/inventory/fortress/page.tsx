"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { 
  Search, Plus, Edit2, Trash2, ShieldCheck, 
  AlertTriangle, CheckCircle2, Package, 
  TrendingDown, 
  RefreshCw
} from "lucide-react";
import { getFortressInventory, getFortressLedger } from "@/modules/inventory/actions";

// -----------------------------
// SCHEMA-ALIGNED TYPES
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

interface IBranchProduct {
  id: string;
  organizationId: string;
  branchId: string;
  productId: string;
  stock: number;
  stockVersion: number;
  reorderLevel: number;
  safetyStock: number;
  sellingPrice: number;
  costPrice: number;
  product: {
    name: string;
    sku: string;
    barcode: string | null;
    category: { name: string } | null;
    uom: { abbreviation: string } | null;
  };
}

interface IActivityLog {
  id: string;
  action: string;
  actorRole: Role | null;
  createdAt: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
}

export default function FortressInventoryWorkspace({ branchId }: { branchId: string }) {
  // -----------------------------
  // STATE MANAGEMENT
  // -----------------------------
  const [inventory, setInventory] = useState<IBranchProduct[]>([]);
  const [logs, setLogs] = useState<IActivityLog[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Replaces the standard 'loading' boolean with React 18's useTransition
  // for smoother, non-blocking UI updates during re-fetches
  const [isPending, startTransition] = useTransition();

  // -----------------------------
  // REAL API: FORTRESS PROTOCOL
  // -----------------------------
  const loadWorkspaceData = () => {
    startTransition(async () => {
      try {
        // Parallel fetching for maximum speed
        const [invData, logData] = await Promise.all([
          getFortressInventory(branchId),
          getFortressLedger(branchId)
        ]);
        
        // Type casting applied here to map Prisma return types to UI interfaces
        setInventory(invData as unknown as IBranchProduct[]);
        setLogs(logData as unknown as IActivityLog[]);
      } catch (error) {
        console.error("Fortress Integration Error:", error);
      }
    });
  };

  useEffect(() => {
    // Initial mount data load
    if (branchId) {
      loadWorkspaceData();
    }
  }, [branchId]);

  // -----------------------------
  // DERIVED STATISTICS & FILTERS
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
    if (stock <= safety) return { label: "CRITICAL", classes: "bg-red-50 text-red-700 border-red-200", icon: AlertTriangle };
    if (stock <= reorder) return { label: "REORDER", classes: "bg-amber-50 text-amber-700 border-amber-200", icon: TrendingDown };
    return { label: "OPTIMAL", classes: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 };
  };

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] text-slate-900 font-sans relative overflow-hidden">
      
      {/* Centered Global Progress Indicator */}
      {isPending && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500/40 animate-pulse z-50" />
      )}

      <header className="w-full flex flex-col bg-white border-b border-black/[0.04] shrink-0 sticky top-0 z-[40]">
        <div className="w-full flex items-center justify-between px-4 py-2 min-w-0 h-14">
          <div className="min-w-0 flex-1 md:flex-none flex items-center gap-3">
            <h1 className="truncate text-[16px] font-bold tracking-tight text-slate-900">
              Inventory Fortress
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:relative sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="SKU_REGISTRY_SEARCH..."
                className="bg-slate-100/80 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-48 md:w-64 rounded-md focus:ring-1 focus:ring-blue-500 transition-all outline-none"
              />
            </div>
            
            <button 
              onClick={loadWorkspaceData}
              disabled={isPending}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors flex items-center justify-center disabled:opacity-50"
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

      {/* Scrollable Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-12">
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 px-6 py-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200/60 flex flex-col justify-between">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Active SKUs</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-2xl font-bold text-slate-900">{stats.totalItems}</h3>
              <Package className="w-5 h-5 text-slate-300" />
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200/60 flex flex-col justify-between">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Asset Valuation</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-2xl font-bold text-slate-900"><span className="text-sm text-slate-400 font-medium mr-1">₦</span>{stats.assetValuation.toLocaleString()}</h3>
              <CheckCircle2 className="w-5 h-5 text-emerald-200" />
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200/60 flex flex-col justify-between">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Reorder Warning</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-2xl font-bold text-amber-600">{stats.lowStock}</h3>
              <TrendingDown className="w-5 h-5 text-amber-200" />
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200/60 flex flex-col justify-between">
            <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Critical Stock</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-2xl font-bold text-red-600">{stats.criticalStock}</h3>
              <AlertTriangle className="w-5 h-5 text-red-200" />
            </div>
          </div>
        </section>

        <main className="px-6 flex flex-col xl:flex-row gap-6">
          
          {/* LEFT: DATA TABLE */}
          <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden flex flex-col min-h-[500px]">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200/80">
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Product Registry</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Pricing (₦)</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Ledger Stock</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">System Health</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInventory.map((item) => {
                    const status = getStatusConfig(item.stock, item.reorderLevel, item.safetyStock);
                    const StatusIcon = status.icon;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div>
                              <div className="text-[13px] font-bold text-slate-900">{item.product.name}</div>
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                                {item.product.sku}
                                <span className="inline-block w-1 h-1 rounded-full bg-slate-300"></span>
                                v{item.stockVersion}
                              </div>
                            </div>
                          </div>
                        </td>
                        
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wide">
                            {item.product.category?.name || "N/A"}
                          </span>
                        </td>

                        <td className="px-5 py-3 text-right">
                          <div className="text-[13px] font-bold text-slate-900">{item.sellingPrice.toLocaleString()}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5 font-medium">Cost: {item.costPrice.toLocaleString()}</div>
                        </td>

                        <td className="px-5 py-3 text-right">
                          <div className="flex items-baseline justify-end gap-1">
                            <span className="text-[14px] font-bold text-slate-900">{item.stock}</span>
                            <span className="text-[10px] text-slate-500 font-bold uppercase">{item.product.uom?.abbreviation || 'unit'}</span>
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
                            <button className="p-1.5 bg-white hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600 border border-slate-200 transition-colors" title="Edit Product">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button className="p-1.5 bg-white hover:bg-red-50 rounded text-slate-400 hover:text-red-600 border border-slate-200 transition-colors" title="Void / Disable">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredInventory.length === 0 && !isPending && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500 text-sm">
                        No products found matching registry criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT: FORENSIC AUDIT ASIDE (Immutable Read-Only View) */}
          <aside className="w-full xl:w-[320px] flex-shrink-0">
            <div className="bg-white p-5 rounded-xl border border-slate-200/60 h-full max-h-[500px] overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between mb-5 sticky top-0 bg-white pb-3 border-b border-slate-100 z-10">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-slate-700" />
                  <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">Audit Ledger</h4>
                </div>
                <span className="flex relative h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
              </div>
              
              <div className="space-y-4">
                {logs.map((log) => (
                  <div key={log.id} className="relative pl-3">
                    <div className="absolute left-0 top-1.5 bottom-[-16px] w-px bg-slate-100 last:hidden"></div>
                    <div className={`absolute left-[-3px] top-1.5 w-1.5 h-1.5 rounded-full ring-2 ring-white ${
                      log.severity === 'CRITICAL' ? 'bg-red-500' :
                      log.severity === 'HIGH' ? 'bg-orange-500' :
                      log.severity === 'MEDIUM' ? 'bg-blue-500' : 'bg-slate-300'
                    }`}></div>

                    <div className="bg-slate-50/50 rounded-md p-2.5 border border-slate-100/80">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                          {log.action}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">
                          {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-700 mt-1 leading-snug">{log.description}</p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="text-[9px] font-bold text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded">
                          {log.actorRole || 'SYSTEM'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {logs.length === 0 && !isPending && (
                  <p className="text-[11px] text-slate-400 text-center py-4">No recent audit events.</p>
                )}
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}