"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  Search,
  Plus,
  Eye,
  PackageCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Filter,
  Download,
  Loader2,
  Check,
  X,
  Truck,
  FileText,
  Trash2,
} from "lucide-react";
import { saveAs } from "file-saver";
import { useSession } from "next-auth/react";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { Role, GRNStatus } from "@prisma/client";

/* -------------------------
Types & Interfaces (Strictly Aligned to Backend GET)
------------------------- */

interface IGoodsReceiptItem {
  id: string;
  poItemId?: string | null;
  productId: string;
  quantityAccepted: number;
  quantityRejected: number;
  unitCost: string | number; // Prisma Decimals serialize as strings or numbers
  product?: {
    name: string;
    sku: string;
  };
}

interface IGoodsReceipt {
  id: string;
  grnNumber: string;
  status: GRNStatus;
  receivedAt: string;
  createdAt: string;
  vendor?: { name: string } | null;
  purchaseOrder?: { poNumber: string } | null;
  receivedBy?: { name: string } | null;
  items: IGoodsReceiptItem[];
  notes?: string | null;
}

/* -------------------------
Constants
------------------------- */

const DEFAULT_LIMIT = 25;

/* -------------------------
Main Component
------------------------- */

export default function GoodsReceiptsWorkspace({ branchId }: { branchId: string }) {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();
  
  // Data State
  const [grns, setGrns] = useState<IGoodsReceipt[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<{ id: string; poNumber: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);

  // Filter & Pagination State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | "all">("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [total, setTotal] = useState(0);

  // UI State
  const [isPending, startTransition] = useTransition();
  const [showFilters, setShowFilters] = useState(false);
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [selectedGRN, setSelectedGRN] = useState<IGoodsReceipt | null>(null);

  // Authorization Logic
  const user = session?.user as any;
  const userRole = user?.role as Role | undefined;
  const userIsOrgOwner = !!user?.isOrgOwner;

  const userCanExport = useMemo(() => {
    if (userIsOrgOwner || userRole === "DEV" || userRole === "ADMIN") return true; 
    return userRole ? ["MANAGER", "AUDITOR"].includes(userRole) : false;
  }, [userIsOrgOwner, userRole]);

  /* -------------------------
  Data Actions
  ------------------------- */

  const loadWorkspaceData = () => {
    if (!branchId) return;
    startTransition(async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
          ...(searchTerm && { search: searchTerm }),
          ...(statusFilter !== "all" && { status: statusFilter }),
        });

        const res = await fetch(`/api/inventory/grns?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch goods receipts.");
        const data = await res.json();
        
        setGrns(data.items || []);
        setTotal(data.total ?? 0);
      } catch (err: any) {
        dispatch({ kind: "TOAST", type: "ERROR", title: "Sync error", message: err?.message });
      }
    });
  };

  useEffect(() => {
    if (!branchId) return;
    (async () => {
      // Fetch metadata for creation modal
      const [vRes, poRes, prodRes] = await Promise.all([
        fetch(`/api/inventory/purchase-orders?meta=vendors&orgId=${branchId}`),
        fetch(`/api/inventory/purchase-orders?status=ISSUED&limit=100`),
        fetch(`/api/inventory/products?limit=500`) // Assuming this endpoint exists for manual product entry
      ]);
      if (vRes.ok) { const v = await vRes.json(); setVendors(v.items || []); }
      if (poRes.ok) { const po = await poRes.json(); setPurchaseOrders(po.items || []); }
      if (prodRes.ok) { const prod = await prodRes.json(); setProducts(prod.items || []); }
    })();
  }, [branchId]);

  // Debounced load on filter change
  useEffect(() => {
    const timer = setTimeout(() => {
      loadWorkspaceData();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, page, limit, searchTerm, statusFilter]);

  const exportCSV = async () => {
    if (!userCanExport) return;
    const q = new URLSearchParams({ export: "true", ...(searchTerm && { search: searchTerm }), ...(statusFilter !== "all" && { status: statusFilter }) });
    const res = await fetch(`/api/inventory/grns?${q.toString()}`);
    const blob = await res.blob();
    saveAs(blob, `GRN_Export_${new Date().toISOString().split("T")[0]}.csv`);
  };

  /* -------------------------
  Calculated Stats
  ------------------------- */

  const stats = useMemo(() => {
    const totalValue = grns.reduce((acc, curr) => 
        acc + (curr.items?.reduce((s, it) => s + (Number(it.unitCost || 0) * Number(it.quantityAccepted || 0)), 0) || 0), 0);
    return {
      totalValue,
      pending: grns.filter(g => g.status === "PENDING").length,
      received: grns.filter(g => g.status === "RECEIVED").length,
      rejected: grns.filter(g => g.status === "REJECTED").length
    };
  }, [grns]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans relative overflow-hidden">
      {isPending && (
        <div className="absolute inset-0 flex justify-center items-center bg-white/40 dark:bg-slate-950/40 backdrop-blur-sm z-[200]">
          <Loader2 className="w-12 h-12 text-amber-500 animate-spin" />
        </div>
      )}

      {/* Header */}
      <header className="w-full flex flex-col bg-white dark:bg-slate-900 border-b border-black/[0.04] dark:border-slate-800 shrink-0 sticky top-0 z-[40]">
        <div className="w-full flex items-center justify-between px-4 py-2 h-14">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg shadow-sm">
              <PackageCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-[16px] font-bold text-slate-900 dark:text-white leading-tight">Goods Receipts</h1>
              <p className="text-[10px] text-slate-500 font-medium">Audit-proof inventory reconciliation.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                placeholder="Search GRN or Vendor..."
                className="bg-slate-100 dark:bg-slate-800 py-1.5 pl-8 pr-4 text-[11px] w-64 rounded-md focus:ring-1 focus:ring-amber-500 outline-none"
              />
            </div>
            <button onClick={() => loadWorkspaceData()} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={() => setShowFilters(!showFilters)} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md">
              <Filter className="w-4 h-4" />
            </button>
            <button onClick={() => setCreateModalOpen(true)} className="h-8 px-4 bg-amber-500 text-white text-[11px] font-bold uppercase rounded-md hover:bg-amber-600 transition-all flex items-center gap-2 shadow-sm">
              <Plus className="w-3.5 h-3.5" />
              <span>New GRN</span>
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-4 items-center animate-in slide-in-from-top-2">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="bg-slate-50 dark:bg-slate-800 rounded px-2 py-1.5 text-xs outline-none border border-slate-200 dark:border-slate-700">
              <option value="all">All Statuses</option>
              {Object.values(GRNStatus).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {userCanExport && (
              <button onClick={exportCSV} className="ml-auto text-[10px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-md">
                <Download className="w-3 h-3" /> EXPORT AUDIT
              </button>
            )}
          </div>
        )}
      </header>

      {/* Stats & Table */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 flex flex-col gap-6">
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Total Value (Page)" value={`₦${stats.totalValue.toLocaleString()}`} icon={PackageCheck} color="amber" />
          <StatCard title="Pending Review" value={stats.pending} icon={Clock} color="amber" />
          <StatCard title="Rejected" value={stats.rejected} icon={AlertCircle} color="red" />
          <StatCard title="Received" value={stats.received} icon={CheckCircle2} color="emerald" />
        </section>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col flex-1">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                  <th className="px-6 py-4">Receipt Info</th>
                  <th className="px-6 py-4">Vendor</th>
                  <th className="px-6 py-4 text-right">Value (₦)</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {grns.length === 0 && !isPending && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">No goods receipts found.</td>
                  </tr>
                )}
                {grns.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-[13px] font-bold text-slate-900 dark:text-white">{g.grnNumber}</div>
                      <div className="text-[9px] text-slate-400 font-medium">Ref: {g.purchaseOrder?.poNumber || "Manual Entry"}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[11px] font-bold">{g.vendor?.name || "Unknown"}</div>
                      <div className="text-[10px] text-slate-500 italic">{new Date(g.receivedAt).toLocaleDateString()}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-[13px] font-mono font-bold">
                        {g.items?.reduce((s, it) => s + (Number(it.unitCost || 0) * (it.quantityAccepted || 0)), 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <StatusBadge status={g.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setSelectedGRN(g)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-medium">Page {page} of {totalPages || 1} (Total: {total})</span>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Next</button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals & Panels */}
      {isCreateModalOpen && (
        <CreateGRNModal
          branchId={branchId}
          vendors={vendors}
          purchaseOrders={purchaseOrders}
          products={products}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={() => { setCreateModalOpen(false); loadWorkspaceData(); }}
        />
      )}

      {selectedGRN && (
        <GRNDetailPanel
          grn={selectedGRN}
          onClose={() => setSelectedGRN(null)}
        />
      )}
    </div>
  );
}

/* -------------------------
Sub-Components
------------------------- */

function StatCard({ title, value, icon: Icon, color }: any) {
  const colors: any = {
    amber: "text-amber-600 bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/20",
    emerald: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/20",
    red: "text-red-600 bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/20",
  };
  return (
    <div className={`p-5 rounded-xl border flex flex-col gap-2 ${colors[color]}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">{title}</span>
        <div className="p-1.5 bg-white/50 dark:bg-black/20 rounded-lg shadow-sm">
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <span className="text-2xl font-bold">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: GRNStatus }) {
  const config = {
    PENDING: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
    RECEIVED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
    REJECTED: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${config[status]}`}>
      {status}
    </span>
  );
}

/* -------------------------
Side Panels & Modals
------------------------- */

function GRNDetailPanel({ grn, onClose }: { grn: IGoodsReceipt, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-950 h-full shadow-2xl flex flex-col animate-in slide-in-from-right-10 duration-300">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">GRN Details</h2>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">{grn.grnNumber}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
              <label className="text-[9px] uppercase font-bold text-slate-400 block mb-1">Vendor</label>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{grn.vendor?.name || "N/A"}</p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
              <label className="text-[9px] uppercase font-bold text-slate-400 block mb-2">Status</label>
              <div><StatusBadge status={grn.status} /></div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" /> Items Breakdown
            </h3>
            <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                  <tr className="text-slate-500 font-bold uppercase text-[9px] tracking-wider">
                    <th className="px-4 py-3 text-left">Product</th>
                    <th className="px-4 py-3 text-center">Accepted</th>
                    <th className="px-4 py-3 text-center">Rejected</th>
                    <th className="px-4 py-3 text-right">Unit Cost (₦)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {grn.items.map((it: IGoodsReceiptItem) => (
                    <tr key={it.id} className="dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3">
                        <div className="font-bold">{it.product?.name || "Unknown"}</div>
                        <div className="text-[9px] text-slate-400 font-mono mt-0.5">{it.product?.sku}</div>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-emerald-600">{it.quantityAccepted}</td>
                      <td className="px-4 py-3 text-center font-bold text-red-500">{it.quantityRejected || 0}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold">{(Number(it.unitCost)).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {grn.notes && (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-900/30">
              <label className="text-[9px] uppercase font-bold text-amber-600 dark:text-amber-500 block mb-1">Notes</label>
              <p className="text-sm text-slate-700 dark:text-slate-300">{grn.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateGRNModal({ branchId, vendors, purchaseOrders, products, onClose, onSuccess }: any) {
  const { dispatch } = useAlerts();
  const [selectedVendor, setSelectedVendor] = useState("");
  const [selectedPO, setSelectedPO] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Auto-fill items if PO is selected
  useEffect(() => {
    if (selectedPO) {
        (async () => {
            const res = await fetch(`/api/inventory/purchase-orders/${selectedPO}`);
            if (res.ok) {
                const po = await res.json();
                setItems(po.items.map((i: any) => ({
                    productId: i.productId,
                    productName: i.product?.name,
                    quantityAccepted: i.quantityOrdered - i.quantityReceived,
                    quantityRejected: 0,
                    unitCost: Number(i.unitCost),
                    poItemId: i.id
                })));
                if(po.vendorId) setSelectedVendor(po.vendorId);
            }
        })();
    } else {
        setItems([]);
    }
  }, [selectedPO]);

  const handleSubmit = async () => {
    if (!selectedVendor || items.length === 0) return;
    
    // Validate Zod constraint: items must have productId, quantityAccepted > 0, unitCost >= 0
    const invalidItem = items.find(i => !i.productId || i.quantityAccepted <= 0);
    if (invalidItem) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Validation Error", message: "All items must have a product and accepted quantity > 0." });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        branchId,
        vendorId: selectedVendor || null,
        purchaseOrderId: selectedPO || null,
        notes: notes || null,
        items: items.map(i => ({
          poItemId: i.poItemId || null,
          productId: i.productId,
          quantityAccepted: Number(i.quantityAccepted),
          quantityRejected: Number(i.quantityRejected || 0),
          unitCost: Number(i.unitCost)
        }))
      };

      const res = await fetch("/api/inventory/grns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit GRN");
      
      dispatch({ kind: "PUSH", type: "SUCCESS", title: "GRN Created", message: `Generated ${data.grnNumber}` });
      onSuccess();
    } catch (e: any) { 
      dispatch({ kind: "TOAST", type: "ERROR", title: "Submission Failed", message: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 h-[85vh]">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-500">
                <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Generate Goods Receipt</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">Receive inventory and sync to ledger.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl border border-slate-100 dark:border-slate-800/60">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select Vendor <span className="text-red-500">*</span></label>
              <select 
                value={selectedVendor} 
                onChange={(e) => setSelectedVendor(e.target.value)}
                disabled={!!selectedPO} // Lock if PO is selected
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm focus:ring-2 ring-amber-500/20 outline-none transition-shadow disabled:opacity-50 text-slate-800 dark:text-slate-200"
              >
                <option value="">Choose a vendor...</option>
                {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Linked PO (Optional)</label>
              <select 
                value={selectedPO} 
                onChange={(e) => setSelectedPO(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm focus:ring-2 ring-amber-500/20 outline-none transition-shadow text-slate-800 dark:text-slate-200"
              >
                <option value="">Direct Entry (No Purchase Order)</option>
                {purchaseOrders.map((p: any) => <option key={p.id} value={p.id}>{p.poNumber}</option>)}
              </select>
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Notes (Optional)</label>
              <textarea 
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm focus:ring-2 ring-amber-500/20 outline-none transition-shadow text-slate-800 dark:text-slate-200"
                placeholder="Condition of goods, delivery notes..."
              />
            </div>
          </div>

          <div className="space-y-3">
             <div className="flex justify-between items-center">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Line Items</p>
                <button 
                    onClick={() => setItems([...items, { productId: "", quantityAccepted: 1, quantityRejected: 0, unitCost: 0 }])}
                    className="text-[10px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-md transition-colors"
                >
                    <Plus className="w-3 h-3" /> ADD MANUAL ITEM
                </button>
             </div>
             
             <div className="space-y-2">
                {items.map((it, idx) => (
                    <div key={idx} className="flex flex-wrap md:flex-nowrap gap-3 items-end bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="flex-1 min-w-[200px] space-y-1.5">
                            <label className="text-[9px] font-bold text-slate-400 uppercase">Product <span className="text-red-500">*</span></label>
                            <select
                                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg p-2 text-xs text-slate-800 dark:text-slate-200 outline-none focus:ring-2 ring-amber-500/20"
                                value={it.productId}
                                onChange={(e) => {
                                    const newItems = [...items];
                                    newItems[idx].productId = e.target.value;
                                    setItems(newItems);
                                }}
                            >
                              <option value="">Select a product...</option>
                              {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        <div className="w-24 space-y-1.5">
                            <label className="text-[9px] font-bold text-emerald-500 uppercase">Accepted <span className="text-red-500">*</span></label>
                            <input 
                                type="number" min="1"
                                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg p-2 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 ring-amber-500/20 text-center" 
                                value={it.quantityAccepted}
                                onChange={(e) => {
                                    const newItems = [...items];
                                    newItems[idx].quantityAccepted = Number(e.target.value);
                                    setItems(newItems);
                                }}
                            />
                        </div>
                        <div className="w-24 space-y-1.5">
                            <label className="text-[9px] font-bold text-red-400 uppercase">Rejected</label>
                            <input 
                                type="number" min="0"
                                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg p-2 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 ring-amber-500/20 text-center" 
                                value={it.quantityRejected}
                                onChange={(e) => {
                                    const newItems = [...items];
                                    newItems[idx].quantityRejected = Number(e.target.value);
                                    setItems(newItems);
                                }}
                            />
                        </div>
                        <div className="w-32 space-y-1.5">
                            <label className="text-[9px] font-bold text-slate-400 uppercase">Unit Cost (₦) <span className="text-red-500">*</span></label>
                            <input 
                                type="number" min="0" step="0.01"
                                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg p-2 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 ring-amber-500/20 text-right" 
                                value={it.unitCost}
                                onChange={(e) => {
                                    const newItems = [...items];
                                    newItems[idx].unitCost = Number(e.target.value);
                                    setItems(newItems);
                                }}
                            />
                        </div>
                        <button 
                            onClick={() => setItems(items.filter((_, i) => i !== idx))}
                            className="p-2 mb-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
                {items.length === 0 && (
                    <div className="py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
                        <PackageCheck className="w-10 h-10 mb-3 text-slate-300 dark:text-slate-700" />
                        <p className="text-xs font-medium text-slate-500">No items added yet. Select a PO or add manually.</p>
                    </div>
                )}
             </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} disabled={loading} className="px-6 py-2.5 text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors uppercase tracking-widest">Cancel</button>
          <button 
            onClick={handleSubmit} 
            disabled={loading || !selectedVendor || items.length === 0}
            className="flex items-center gap-2 px-8 py-2.5 bg-slate-900 dark:bg-amber-500 text-white text-[11px] font-bold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-widest shadow-md"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {loading ? "COMMITTING..." : "Commit Receipt"}
          </button>
        </div>
      </div>
    </div>
  );
}