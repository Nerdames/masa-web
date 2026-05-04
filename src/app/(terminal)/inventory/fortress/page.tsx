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
  Truck,
  ShieldCheck,
  Clock,
  Lock
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
  approvalPending?: boolean; 
  isLocked?: boolean;        
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

  /* -------------------------
      Auth & Permission Logic
  ------------------------- */
  const user = session?.user;
  
  // Resolve active branch from session (Primary branch or first allowed)
  const activeBranchId = user?.branchId || user?.allowedBranches?.[0]?.id;
  
  // Permission guards based on session augmentation
  const canAccessValuation = useMemo(() => {
    return user?.role === "ADMIN" || 
           user?.role === "AUDITOR" || 
           user?.permissions?.includes("READ:VALUATION");
  }, [user]);

  const canEditInventory = useMemo(() => {
    return user?.permissions?.includes("UPDATE:INVENTORY") || 
           ["ADMIN", "MANAGER"].includes(user?.role || "");
  }, [user]);

  /* -------------------------
      Data Fetching
  ------------------------- */

  const fetchMeta = useCallback(async () => {
    if (!activeBranchId) return;
    try {
      const [vRes, cRes] = await Promise.all([
        fetch(`/api/inventory/fortress?branchId=${activeBranchId}&meta=vendors`),
        fetch(`/api/inventory/fortress?branchId=${activeBranchId}&meta=categories`)
      ]);
      
      if (vRes.ok && cRes.ok) {
        const vData = await vRes.json();
        const cData = await cRes.json();
        setVendors(vData.items || []);
        setCategories(cData.items || []);
      }
    } catch (err) {
      console.error("[METADATA_SYNC_ERROR]", err);
    }
  }, [activeBranchId]);

  const fetchData = useCallback(async () => {
    if (!activeBranchId || sessionStatus !== "authenticated") return;
    
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
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.message || "Synchronization failure with Fortress API");
        }

        const json = await res.json();
        setItems(json.items || []);
        setTotal(json.total || 0);
      } catch (err: any) {
        dispatch({
          kind: "TOAST",
          type: "WARNING",
          title: "Vault Sync Error",
          message: err.message || "Failed to retrieve live stock data."
        });
      } finally {
        setLoading(false);
      }
    });
  }, [activeBranchId, sessionStatus, page, limit, search, statusFilter, vendorFilter, categoryFilter, sort, dispatch]);

  /* -------------------------
      Lifecycle
  ------------------------- */

  useEffect(() => {
    if (activeBranchId) fetchMeta();
  }, [activeBranchId, fetchMeta]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 400);
    return () => clearTimeout(timer);
  }, [fetchData]);

  // Reset pagination on filter change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, vendorFilter, categoryFilter, sort, limit]);

  /* -------------------------
      Derived Stats & Helpers
  ------------------------- */

  const stats = useMemo(() => {
    const criticalStock = items.filter(i => i.stock <= i.safetyStock).length;
    const lowStock = items.filter(i => i.stock > i.safetyStock && i.stock <= i.reorderLevel).length;
    const pendingApprovals = items.filter(i => i.approvalPending).length;
    
    const assetValuation = canAccessValuation 
      ? items.reduce((acc, curr) => acc + (curr.stock * curr.costPrice), 0) 
      : 0;

    return { criticalStock, lowStock, assetValuation, pendingApprovals };
  }, [items, canAccessValuation]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const openEditPanel = (item: UiBranchProduct) => {
    if (!canEditInventory) {
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Access Denied",
        message: "You do not have permissions to modify registry entries."
      });
      return;
    }

    openPanel(
      <InventoryEditPanel 
        item={item} 
        onSuccess={() => { fetchData(); closePanel(); }} 
        onClose={closePanel} 
      />
    );
  };

  const getStatusConfig = (item: UiBranchProduct) => {
    if (item.isLocked) {
        return {
          label: "LOCKED",
          classes: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
          icon: Lock,
        };
    }
    if (item.approvalPending) {
        return {
          label: "PENDING",
          classes: "bg-amber-100 text-amber-700 border-amber-200 animate-pulse dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800",
          icon: Clock,
        };
    }
    if (item.stock <= item.safetyStock) {
      return {
        label: "CRITICAL",
        classes: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
        icon: AlertTriangle,
      };
    }
    if (item.stock <= item.reorderLevel) {
      return {
        label: "REORDER",
        classes: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
        icon: TrendingDown,
      };
    }
    return {
      label: "OPTIMAL",
      classes: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
      icon: CheckCircle2,
    };
  };

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans relative overflow-hidden transition-colors duration-300">
      
      {/* Loading Overlay */}
      {(isPending || loading) && items.length === 0 && (
        <div className="absolute inset-0 flex flex-col justify-center items-center bg-white/60 dark:bg-slate-950/60 backdrop-blur-[2px] z-[200]">
          <Loader2 className="w-10 h-10 text-indigo-600 dark:text-indigo-500 animate-spin" />
          <span className="text-[10px] font-black tracking-[0.3em] text-slate-500 uppercase mt-4">Initializing Secure Sync...</span>
        </div>
      )}

      {/* HEADER SECTION */}
      <header className="w-full flex flex-col bg-white dark:bg-slate-900 border-b border-black/[0.04] dark:border-slate-800 shrink-0 sticky top-0 z-[40] transition-colors">
        <div className="w-full flex items-center justify-between px-4 py-2 min-w-0 h-14">
          <div className="min-w-0 flex-1 md:flex-none flex items-center gap-3">
            <div className="p-1.5 bg-slate-900 dark:bg-indigo-600 rounded-lg shadow-sm">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="truncate text-[14px] font-black tracking-widest text-slate-900 dark:text-white leading-tight uppercase">
                Inventory Fortress
              </h1>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Branch_Node: {activeBranchId?.slice(-8) || "N/A"}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:relative sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="SEARCH_REGISTRY..."
                className="bg-slate-100/80 dark:bg-slate-800/80 border-none py-1.5 pl-8 pr-4 text-[11px] font-bold w-48 md:w-64 rounded-md focus:ring-1 focus:ring-indigo-500 transition-all outline-none dark:text-white placeholder:text-slate-400"
              />
            </div>

            <button
              onClick={fetchData}
              disabled={isPending || loading}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors flex items-center justify-center disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isPending || loading ? "animate-spin text-indigo-500" : ""}`} />
            </button>

            <button
              onClick={() => setShowFilters((s) => !s)}
              className={`p-1.5 rounded-md transition-colors flex items-center justify-center ${showFilters ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <Filter className="w-4 h-4" />
            </button>

            <div className="hidden md:flex gap-2 items-center border-l border-slate-200 dark:border-slate-800 pl-3 ml-1">
              <button className="h-8 px-3 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-wider rounded-md hover:opacity-90 transition-all flex items-center gap-2">
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
              </button>
            </div>
          </div>
        </div>

        {/* EXPANDABLE FILTER BAR */}
        {showFilters && (
          <div className="w-full px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap gap-4 items-center animate-in slide-in-from-top-1 duration-200">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Vendor_Origin</label>
              <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="rounded bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-bold outline-none border border-slate-200 dark:border-slate-700">
                <option value="all">ALL_VENDORS</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name.toUpperCase()}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Category_Class</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-bold outline-none border border-slate-200 dark:border-slate-700">
                <option value="all">ALL_CATEGORIES</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Risk_Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-bold outline-none border border-slate-200 dark:border-slate-700">
                <option value="all">NO_FILTER</option>
                <option value="critical">CRITICAL_LEVEL</option>
                <option value="reorder">REORDER_NEEDED</option>
                <option value="optimal">OPTIMAL_STOCK</option>
              </select>
            </div>
          </div>
        )}
      </header>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-12">
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 px-4 lg:px-6 py-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Registry SKUs</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">{total}</h3>
              <Package className="w-4 h-4 text-slate-300" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between shadow-sm border-l-4 border-l-amber-500">
            <p className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">Pending Review</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">{stats.pendingApprovals}</h3>
              <Clock className="w-4 h-4 text-amber-200" />
            </div>
          </div>

          {canAccessValuation && (
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between shadow-sm">
              <p className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Total Valuation</p>
              <div className="flex items-end justify-between mt-2">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">₦{stats.assetValuation.toLocaleString()}</h3>
                <ShieldCheck className="w-4 h-4 text-indigo-200" />
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between shadow-sm">
            <p className="text-[9px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest">Low Stock</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">{stats.lowStock}</h3>
              <TrendingDown className="w-4 h-4 text-orange-200" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between shadow-sm border-l-4 border-l-red-600">
            <p className="text-[9px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest">Stockout Risk</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">{stats.criticalStock}</h3>
              <AlertTriangle className="w-4 h-4 text-red-200" />
            </div>
          </div>
        </section>

        <main className="px-4 lg:px-6 flex flex-col gap-6">
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden flex flex-col min-h-[500px] bg-white dark:bg-slate-900 shadow-sm">
            <div className="overflow-x-auto custom-scrollbar flex-1">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Identifier / Registry</th>
                    <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Category</th>
                    <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] text-right">Pricing (₦)</th>
                    <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] text-right">Available_Stock</th>
                    <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] text-center">Fortress_Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-24 text-center text-slate-400 text-[10px] font-black uppercase tracking-widest">
                        Zero Records Found in Local Node
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const status = getStatusConfig(item);
                      const StatusIcon = status.icon;

                      return (
                        <tr
                          key={item.id}
                          onClick={() => openEditPanel(item)}
                          className="hover:bg-slate-50 dark:hover:bg-indigo-900/10 transition-all group cursor-pointer"
                        >
                          <td className="px-5 py-4">
                            <div className="text-[13px] font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                              {item.product.name.toUpperCase()}
                            </div>
                            <div className="text-[9px] text-slate-400 font-bold uppercase mt-1 flex items-center gap-2">
                              <span className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{item.product.sku}</span>
                              {item.stockVersion && <span className="opacity-50">REL_{item.stockVersion}</span>}
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            <div className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase">
                              {item.product.category?.name || "UNCLASSIFIED"}
                            </div>
                          </td>

                          <td className="px-5 py-4 text-right">
                            <div className="text-[13px] font-black text-slate-900 dark:text-white">
                              {Number(item.sellingPrice || 0).toLocaleString()}
                            </div>
                            {canAccessValuation && (
                              <div className="text-[9px] text-slate-400 font-bold uppercase">
                                Cost: {Number(item.costPrice || 0).toLocaleString()}
                              </div>
                            )}
                          </td>

                          <td className="px-5 py-4 text-right">
                            <div className="flex items-baseline justify-end gap-1.5">
                              <span className={`text-[13px] font-black ${item.stock <= item.safetyStock ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>
                                {item.stock}
                              </span>
                              <span className="text-[9px] text-slate-400 font-bold uppercase">
                                {item.product.uom?.abbreviation || "UNT"}
                              </span>
                            </div>
                            <div className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">
                              BUF: {item.safetyStock} | THR: {item.reorderLevel}
                            </div>
                          </td>

                          <td className="px-5 py-4 text-center">
                            <div className="flex justify-center">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[9px] font-black uppercase tracking-widest shadow-sm ${status.classes}`}>
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
            <div className="px-5 py-4 bg-slate-50/80 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                   <span className="text-[9px] font-black text-slate-400 uppercase">Page_Size</span>
                    <select
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-black py-1 px-2 outline-none dark:text-white cursor-pointer"
                    >
                    {[25, 50, 100].map((l) => (
                        <option key={l} value={l}>{l}</option>
                    ))}
                    </select>
                </div>
                <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
                  Total_Entries: {total}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-4 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-30 transition-all hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Prev
                </button>
                <div className="px-4 text-[11px] font-black text-slate-900 dark:text-white bg-slate-200 dark:bg-slate-700 py-1 rounded">
                  {page} / {totalPages}
                </div>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-4 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-30 transition-all hover:bg-slate-100 dark:hover:bg-slate-800"
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