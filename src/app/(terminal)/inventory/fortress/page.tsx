"use client";

import React, { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Search,
  Package,
  AlertTriangle,
  CheckCircle2,
  Download,
  Filter,
  RefreshCw,
  Loader2,
  TrendingDown,
  Truck
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { InventoryEditPanel } from "@/modules/inventory/components/InventoryEditPanel";

/* -------------------------
   Types & Interfaces
------------------------- */

export type UiBranchProduct = {
  id: string;
  stock: number;
  stockVersion: number;
  reorderLevel: number;
  safetyStock: number;
  sellingPrice: number;
  costPrice: number;
  vendor: { id: string; name: string } | null;
  product: {
    id: string;
    name: string;
    sku: string;
    barcode?: string | null;
    category?: { id: string; name: string } | null;
    uom?: { id: string; name: string; abbreviation: string } | null;
  };
  lastSoldAt?: string | null;
  lastRestockedAt?: string | null;
};

interface MetaData {
  id: string;
  name: string;
}

/* -------------------------
   Main Workspace
------------------------- */

export default function FortressInventoryWorkspace() {
  const { data: session, status: sessionStatus } = useSession();
  const { dispatch } = useAlerts();
  const { openPanel, closePanel } = useSidePanel();
  const [isPending, startTransition] = useTransition();

  // Data State
  const [items, setItems] = useState<UiBranchProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sort, setSort] = useState("name");

  // UI States
  const [showFilters, setShowFilters] = useState(false);

  // Meta States
  const [vendors, setVendors] = useState<MetaData[]>([]);
  const [categories, setCategories] = useState<MetaData[]>([]);

  // Auth Context & Role Verification
  const user = session?.user as any;
  const activeBranchId = user?.branchId || user?.branches?.[0]?.id;
  const isAdmin = user?.role === "ADMIN";

  /* -------------------------
     Data Fetching
  ------------------------- */

  const fetchMeta = useCallback(async () => {
    try {
      const [vRes, cRes] = await Promise.all([
        fetch(`/api/inventory/fortress?branchId=${activeBranchId}&meta=vendors`),
        fetch(`/api/inventory/fortress?branchId=${activeBranchId}&meta=categories`)
      ]);
      const vData = await vRes.json();
      const cData = await cRes.json();
      setVendors(vData.items || []);
      setCategories(cData.items || []);
    } catch (err) {
      console.error("Meta fetch failed", err);
    }
  }, [activeBranchId]);

  const fetchData = useCallback(async () => {
    if (!activeBranchId) return;
    setLoading(true);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({
          branchId: activeBranchId,
          page: page.toString(),
          limit: limit.toString(),
          status: statusFilter,
          sort,
          search: search.trim(),
        });
        if (vendorFilter !== "all") params.append("vendorId", vendorFilter);
        if (categoryFilter !== "all") params.append("categoryId", categoryFilter);

        const res = await fetch(`/api/inventory/fortress?${params.toString()}`);
        if (!res.ok) throw new Error("Synchronization failure");
        const json = await res.json();
        setItems(json.items || []);
        setTotal(json.total || 0);
      } catch (err: any) {
        dispatch({
          kind: "TOAST",
          type: "WARNING",
          title: "Inventory Sync Error",
          message: err.message || "Failed to retrieve live stock data."
        });
      } finally {
        setLoading(false);
      }
    });
  }, [activeBranchId, page, limit, search, statusFilter, vendorFilter, categoryFilter, sort, dispatch]);

  useEffect(() => {
    if (activeBranchId) fetchMeta();
  }, [activeBranchId, fetchMeta]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (sessionStatus === "authenticated") fetchData();
    }, 400);
    return () => clearTimeout(timer);
  }, [fetchData, sessionStatus]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, vendorFilter, categoryFilter, sort, limit]);

  /* -------------------------
     Derived Stats & Helpers
  ------------------------- */

  const stats = useMemo(() => {
    const criticalStock = items.filter(i => i.stock <= i.safetyStock).length;
    const lowStock = items.filter(i => i.stock > i.safetyStock && i.stock <= i.reorderLevel).length;
    
    // Calculate Asset Valuation only if role permits to save cycles
    const assetValuation = isAdmin 
      ? items.reduce((acc, curr) => acc + (curr.stock * curr.costPrice), 0) 
      : 0;

    // Deduplicate active vendors dynamically based on current list
    const activeVendors = new Set(items.map(i => i.vendor?.id).filter(Boolean)).size;

    return { criticalStock, lowStock, assetValuation, activeVendors };
  }, [items, isAdmin]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const openEditPanel = (item: UiBranchProduct) => {
    openPanel(
      <InventoryEditPanel 
        item={item} 
        onSuccess={() => { fetchData(); closePanel(); }} 
        onClose={closePanel} 
      />
    );
  };

  const getStatusConfig = (stock: number, reorder: number, safety: number) => {
    if (stock <= safety) {
      return {
        label: "CRITICAL",
        classes: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
        icon: AlertTriangle,
      };
    }
    if (stock <= reorder) {
      return {
        label: "REORDER",
        classes: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
        icon: TrendingDown,
      };
    }
    return {
      label: "OPTIMAL",
      classes: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
      icon: CheckCircle2,
    };
  };

  /* -------------------------
     Render
  ------------------------- */

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans relative overflow-hidden transition-colors duration-300">
      
      {/* Loading Overlay */}
      {(isPending || loading) && items.length === 0 && (
        <div className="absolute inset-0 flex flex-col justify-center items-center bg-white/60 dark:bg-slate-950/60 backdrop-blur-[2px] z-[200]">
          <Loader2 className="w-10 h-10 text-blue-600 dark:text-blue-500 animate-spin" />
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mt-3">Synchronizing Inventory...</span>
        </div>
      )}

      {/* HEADER SECTION */}
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
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:relative sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="SKU_REGISTRY_SEARCH..."
                className="bg-slate-100/80 dark:bg-slate-800/80 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-48 md:w-64 rounded-md focus:ring-1 focus:ring-blue-500 transition-all outline-none dark:text-white"
              />
            </div>

            <button
              onClick={fetchData}
              disabled={isPending || loading}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors flex items-center justify-center disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isPending || loading ? "animate-spin text-blue-500" : ""}`} />
            </button>

            <button
              onClick={() => setShowFilters((s) => !s)}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors flex items-center justify-center"
            >
              <Filter className="w-4 h-4" />
            </button>

            <div className="hidden md:flex gap-2 items-center">
              <button className="h-8 px-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-2">
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* EXPANDABLE FILTER BAR */}
        {showFilters && (
          <div className="w-full px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-500 dark:text-slate-400">Vendor</label>
              <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 text-sm outline-none">
                <option value="all">All Vendors</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-500 dark:text-slate-400">Category</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 text-sm outline-none">
                <option value="all">All Categories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-500 dark:text-slate-400">Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 text-sm outline-none">
                <option value="all">All Statuses</option>
                <option value="critical">Critical</option>
                <option value="reorder">Reorder</option>
                <option value="optimal">Optimal</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-500 dark:text-slate-400">Sort</label>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 text-sm outline-none">
                <option value="name">Name</option>
                <option value="stock_asc">Stock (Low → High)</option>
                <option value="valuation_desc">Valuation (High → Low)</option>
              </select>
            </div>
          </div>
        )}
      </header>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-12">
        <section className={`grid grid-cols-1 md:grid-cols-2 ${isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4 px-4 lg:px-6 py-4`}>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between shadow-sm transition-colors">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Active SKUs</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{total}</h3>
              <Package className="w-5 h-5 text-slate-300 dark:text-slate-600" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between shadow-sm transition-colors">
            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Active Vendors</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{stats.activeVendors}</h3>
              <Truck className="w-5 h-5 text-emerald-200 dark:text-emerald-900/50" />
            </div>
          </div>

          {isAdmin && (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between shadow-sm transition-colors">
              <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Asset Valuation</p>
              <div className="flex items-end justify-between mt-2">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white"><span className="text-sm text-slate-400 dark:text-slate-500 font-medium mr-1">₦</span>{stats.assetValuation.toLocaleString()}</h3>
                <CheckCircle2 className="w-5 h-5 text-blue-200 dark:text-blue-900/50" />
              </div>
            </div>
          )}

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

        <main className="px-4 lg:px-6 flex flex-col gap-6">
          {/* Main Table Container */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex flex-col min-h-[500px] transition-colors bg-white dark:bg-slate-900">
            <div className="overflow-x-auto custom-scrollbar flex-1">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80">
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Product Registry</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Pricing (₦)</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Ledger Stock</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">System Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-20 text-center text-slate-400 text-[11px] font-bold uppercase">
                        Warehouse Empty or No Matching Filters.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const status = getStatusConfig(item.stock, item.reorderLevel, item.safetyStock);
                      const StatusIcon = status.icon;

                      return (
                        <tr
                          key={item.id}
                          onClick={() => openEditPanel(item)}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer select-none"
                        >
                          <td className="px-5 py-3">
                            <div className="text-[13px] font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {item.product.name}
                            </div>
                            <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 flex items-center gap-2">
                              {item.product.sku}
                              {item.stockVersion && <span>• V{item.stockVersion}</span>}
                            </div>
                          </td>

                          <td className="px-5 py-3">
                            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                              {item.product.category?.name || "UNGROUPED"}
                            </div>
                          </td>

                          <td className="px-5 py-3 text-right">
                            <div className="text-[13px] font-bold text-slate-900 dark:text-white">
                              {Number(item.sellingPrice || 0).toLocaleString()}
                            </div>
                            <div className="text-[9px] text-slate-400 font-bold uppercase">
                              Cost: {Number(item.costPrice || 0).toLocaleString()}
                            </div>
                          </td>

                          <td className="px-5 py-3 text-right">
                            <div className="flex items-baseline justify-end gap-1">
                              <span className="text-[13px] font-bold text-slate-900 dark:text-white">{item.stock}</span>
                              <span className="text-[9px] text-slate-400 font-bold uppercase">
                                {item.product.uom?.abbreviation || "unit"}
                              </span>
                            </div>
                            <div className="text-[9px] text-slate-400 font-bold uppercase">
                              Min: {item.safetyStock ?? 0} | Re: {item.reorderLevel}
                            </div>
                          </td>

                          <td className="px-5 py-3 text-center">
                            <div className="flex justify-center">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${status.classes}`}>
                                <StatusIcon className="w-3 h-3" />
                                {status.label}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold py-1 px-1.5 outline-none dark:text-white cursor-pointer"
                >
                  {[10, 25, 50].map((l) => (
                    <option key={l} value={l}>{l} Rows</option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  Total Records: {total}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-50 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Prev
                </button>
                <div className="px-3 text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                  {page} / {totalPages}
                </div>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-50 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}