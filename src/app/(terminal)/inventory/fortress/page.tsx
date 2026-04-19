"use client";

import React, { useCallback, useEffect, useState, useTransition } from "react";
import {
  Search, Package, AlertTriangle, CheckCircle2, Download, Filter, 
  RefreshCw, Loader2, Edit3, ChevronLeft, ChevronRight, 
  Hash, Tag, Building2, ShieldAlert, Save, X, Banknote, Box, Info, TrendingDown
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";

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

  // Meta States
  const [vendors, setVendors] = useState<MetaData[]>([]);
  const [categories, setCategories] = useState<MetaData[]>([]);

  const user = session?.user as any;
  const activeBranchId = user?.branchId || user?.branches?.[0]?.id;

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

  const openEditPanel = (item: UiBranchProduct) => {
    openPanel(
      <InventoryEditPanel 
        item={item} 
        onSuccess={() => { fetchData(); closePanel(); }} 
        onClose={closePanel} 
      />
    );
  };

  const StatusBadge = ({ item }: { item: UiBranchProduct }) => {
    if (item.stock <= item.safetyStock) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 border border-red-200 dark:border-red-500/20">
          <ShieldAlert className="w-3 h-3" /> Critical
        </span>
      );
    }
    if (item.stock <= item.reorderLevel) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
          <AlertTriangle className="w-3 h-3" /> Reorder
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
        <CheckCircle2 className="w-3 h-3" /> Optimal
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 lg:p-8">
      {/* HEADER: Original "masa" Style */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
            <Package className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
              Fortress <span className="text-indigo-600">Inventory</span>
            </h1>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              Live Stock Control • {user?.branch?.name || "Global Context"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={fetchData}
            className="h-10 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-[10px] font-black text-slate-500 uppercase tracking-widest hover:border-indigo-500 transition-all flex items-center gap-2 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </button>
          <button className="h-10 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2">
            <Download className="w-3.5 h-3.5" />
            Audit Export
          </button>
        </div>
      </div>

      {/* ANALYTICS BRIEF */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total SKU", val: total, icon: Box, color: "text-blue-500", bg: "bg-blue-500/10" },
          { label: "Alerts", val: items.filter(i => i.stock <= i.safetyStock).length, icon: ShieldAlert, color: "text-red-500", bg: "bg-red-500/10" },
          { label: "Asset Value", val: `₦${items.reduce((acc, i) => acc + (i.stock * i.costPrice), 0).toLocaleString()}`, icon: Banknote, color: "text-emerald-500", bg: "bg-emerald-500/10" },
          { label: "Vendors", val: vendors.length, icon: Building2, color: "text-indigo-500", bg: "bg-indigo-500/10" }
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{stat.val}</h3>
              </div>
              <div className={`p-2.5 ${stat.bg} rounded-xl`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CONTROL BAR: Matches Provided Layout */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 mb-6 shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search SKU or name..."
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl text-[12px] font-medium outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select 
              className="bg-transparent border-none text-[11px] font-bold text-slate-600 dark:text-slate-400 outline-none"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">ALL STATUS</option>
              <option value="critical">CRITICAL</option>
              <option value="reorder">REORDER</option>
              <option value="optimal">OPTIMAL</option>
            </select>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <select 
              className="bg-transparent border-none text-[11px] font-bold text-slate-600 dark:text-slate-400 outline-none"
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
            >
              <option value="all">ALL VENDORS</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name.toUpperCase()}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl">
            <select 
              className="bg-transparent border-none text-[11px] font-bold text-slate-600 dark:text-slate-400 outline-none"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="name">SORT: NAME</option>
              <option value="stock_asc">STOCK: LOW</option>
              <option value="valuation_desc">VALUE: HIGH</option>
            </select>
          </div>
        </div>
      </div>

      {/* MAIN DATA GRID */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Item Specification</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">In-Stock</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Audit Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Unit Value</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && !items.length ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-8"><div className="h-10 bg-slate-100 dark:bg-slate-800/50 rounded-xl w-full"></div></td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold text-[12px] uppercase tracking-widest">Warehouse Empty</p>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center font-black text-indigo-600 text-[10px]">
                           {item.product.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-[14px] font-bold text-slate-900 dark:text-white">{item.product.name}</div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-tighter"><Hash className="w-2.5 h-2.5" /> {item.product.sku}</span>
                            <span className="flex items-center gap-1 text-[10px] font-black text-indigo-400 uppercase tracking-tighter"><Tag className="w-2.5 h-2.5" /> {item.product.category?.name || "Uncategorized"}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="text-[16px] font-black text-slate-900 dark:text-white">{item.stock}</div>
                      <div className="text-[9px] font-black text-slate-400 uppercase">{item.product.uom?.abbreviation || 'units'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center"><StatusBadge item={item} /></div>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="text-[14px] font-bold text-indigo-600 dark:text-indigo-400">₦{item.sellingPrice.toLocaleString()}</div>
                       <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cost: ₦{item.costPrice.toLocaleString()}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => openEditPanel(item)}
                        className="p-2.5 hover:bg-indigo-600 hover:text-white rounded-xl text-slate-400 transition-all border border-transparent hover:shadow-lg hover:shadow-indigo-500/20"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION: Standard Workspace Style */}
        <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Audit Stream: <span className="text-slate-900 dark:text-white">{items.length}</span> of <span className="text-slate-900 dark:text-white">{total}</span> SKU
          </div>
          <div className="flex items-center gap-1">
            <button 
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg disabled:opacity-20 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-4 text-[11px] font-black text-indigo-600 dark:text-indigo-400 underline decoration-2 underline-offset-4">{page} / {Math.ceil(total / limit) || 1}</div>
            <button 
              disabled={page * limit >= total}
              onClick={() => setPage(p => p + 1)}
              className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg disabled:opacity-20 transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------
   Inventory EditPanel
------------------------- */

function InventoryEditPanel({ item, onSuccess, onClose }: { item: any, onSuccess: () => void, onClose: () => void }) {
  const { dispatch } = useAlerts();
  const [formData, setFormData] = useState({
    sellingPrice: item.sellingPrice || 0,
    reorderLevel: item.reorderLevel || 0,
    safetyStock: item.safetyStock || 0
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/fortress?id=${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (!res.ok) throw new Error("Update rejected");
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Audit Synchronized", message: `${item.product.name} settings updated.` });
      onSuccess();
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Adjustment Failed", message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md h-full bg-white dark:bg-slate-950 shadow-2xl flex flex-col">
      <div className="px-6 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
        <div>
          <h2 className="text-[14px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Adjust Stock Policy</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Ref ID: {item.id.substring(0, 8)}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="p-4 bg-indigo-50/50 dark:bg-indigo-500/5 rounded-2xl border border-indigo-100/50 dark:border-indigo-500/10">
           <div className="flex items-start gap-3">
             <div className="bg-indigo-600 p-2 rounded-lg"><Box className="w-4 h-4 text-white" /></div>
             <div>
               <p className="text-[11px] font-black text-indigo-900 dark:text-indigo-300 uppercase tracking-wider">{item.product.name}</p>
               <p className="text-[10px] font-bold text-indigo-600/70 dark:text-indigo-400/70 mt-1 uppercase">Available: {item.stock} {item.product.uom?.abbreviation}</p>
             </div>
           </div>
        </div>

        <form id="edit-inventory-form" onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Unit Selling Price (₦)</label>
            <div className="relative group">
              <Banknote className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <input 
                type="number" 
                value={formData.sellingPrice}
                onChange={(e) => setFormData({...formData, sellingPrice: Number(e.target.value)})}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-12 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reorder Level</label>
              <div className="relative group">
                <TrendingDown className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <input 
                  type="number" 
                  value={formData.reorderLevel}
                  onChange={(e) => setFormData({...formData, reorderLevel: Number(e.target.value)})}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-12 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Safety Stock</label>
              <div className="relative group">
                <ShieldAlert className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-red-500 transition-colors" />
                <input 
                  type="number" 
                  value={formData.safetyStock}
                  onChange={(e) => setFormData({...formData, safetyStock: Number(e.target.value)})}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-12 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                  required
                />
              </div>
            </div>
          </div>
        </form>
      </div>

      <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center gap-3">
        <button 
          onClick={onClose}
          className="flex-1 h-11 text-[11px] font-black text-slate-500 uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-all"
        >
          Cancel
        </button>
        <button 
          form="edit-inventory-form"
          type="submit"
          disabled={submitting}
          className="flex-1 h-11 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black rounded-xl uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Commit
        </button>
      </div>
    </div>
  );
}