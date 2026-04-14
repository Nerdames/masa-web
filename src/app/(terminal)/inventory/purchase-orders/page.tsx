"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  Search,
  Plus,
  Eye,
  FileText,
  ShoppingCart,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  ArrowUpRight,
  Filter,
  X,
  Trash2,
  Save,
  Download,
  Loader2,
  Package,
  User,
  Calendar,
  Lock,
} from "lucide-react";
import { saveAs } from "file-saver";
import { useAlerts } from "@/core/components/feedback/AlertProvider"; // adjust path to your AlertProvider
import { useSession } from "next-auth/react";

/**
 * PurchaseOrdersWorkspace
 *
 * Redesigned to match FortressInventoryWorkspace:
 * - Switch between PO (purchase orders) and Ledger (activity logs)
 * - Server-side pagination, export (page / all), filters, search
 * - Initiate PO modal remains inline and fully functional
 * - Uses useAlerts for PUSH and TOAST notifications
 *
 * Assumptions:
 * - API endpoint: /api/inventory/purchase-orders
 * - Query params: branchId, type (po|ledger), page, limit, search, status, from, to, export=true
 * - Meta endpoints: ?meta=vendors, ?meta=products
 */

type Role = "ADMIN" | "MANAGER" | "SALES" | "INVENTORY" | "CASHIER" | "DEV" | "AUDITOR";

enum POStatus {
  DRAFT = "DRAFT",
  ISSUED = "ISSUED",
  PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED",
  FULFILLED = "FULFILLED",
  CANCELLED = "CANCELLED",
}

enum Severity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

interface IPOItem {
  id?: string;
  productId: string;
  quantityOrdered: number;
  unitCost: number;
}

interface IPurchaseOrder {
  id: string;
  poNumber: string;
  status: POStatus;
  totalAmount: number;
  expectedDate: string | null;
  createdAt: string;
  vendor: { id: string; name: string; email?: string | null };
  items: (IPOItem & { product?: { name?: string; sku?: string } })[];
  createdBy?: { name?: string } | null;
}

interface IActivityLog {
  id: string;
  action: string;
  actorRole?: string | null;
  createdAt: string;
  severity?: Severity;
  description?: string;
  requestId?: string | null;
}

/* -------------------------
   Constants
------------------------- */

const DEFAULT_LIMIT = 25;
const EXPORT_LIMIT = 10000;

/* -------------------------
   Component
------------------------- */

export default function PurchaseOrdersWorkspace({ branchId }: { branchId: string }) {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();

  const [viewType, setViewType] = useState<"po" | "ledger">("po");
  const [orders, setOrders] = useState<IPurchaseOrder[]>([]);
  const [ledger, setLedger] = useState<IActivityLog[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; sku: string; costPrice?: number }[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | "all">("all");
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [total, setTotal] = useState(0);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<IPurchaseOrder | null>(null);

  const userRole = (session?.user as any)?.role as Role | undefined;
  const userIsOrgOwner = (session?.user as any)?.isOrgOwner as boolean | undefined;
  const userCanExport = useMemo(() => {
    if (!session?.user) return false;
    if (userIsOrgOwner) return true;
    if (!userRole) return false;
    return ["ADMIN", "MANAGER", "AUDITOR", "DEV"].includes(userRole);
  }, [session]);

  /* -------------------------
     Time-aware theme (kept)
  ------------------------- */
  useEffect(() => {
    const applyTheme = () => {
      const hour = new Date().getHours();
      if (hour >= 19 || hour < 7) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    };
    applyTheme();
    const t = setInterval(applyTheme, 60000);
    return () => clearInterval(t);
  }, []);

  /* -------------------------
     Query builder
  ------------------------- */
  const buildQuery = (opts?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    from?: string | null;
    to?: string | null;
    exportAll?: boolean;
    type?: "po" | "ledger";
  }) => {
    const q = new URLSearchParams();
    if (branchId) q.set("branchId", branchId);
    q.set("type", opts?.type ?? viewType);
    q.set("page", String(opts?.page ?? page));
    q.set("limit", String(opts?.limit ?? limit));
    const searchVal = opts?.search ?? searchTerm;
    if (searchVal) q.set("search", searchVal);
    const statusVal = opts?.status ?? statusFilter;
    if (statusVal && statusVal !== "all") q.set("status", statusVal);
    if (opts?.from ?? fromDate) q.set("from", opts?.from ?? (fromDate ?? ""));
    if (opts?.to ?? toDate) q.set("to", opts?.to ?? (toDate ?? ""));
    if (opts?.exportAll) q.set("export", "true");
    return q.toString();
  };

  /* -------------------------
     Load meta lists (vendors, products)
  ------------------------- */
  useEffect(() => {
    if (!branchId) return;
    let mounted = true;
    (async () => {
      try {
        const [vRes, pRes] = await Promise.all([
          fetch(`/api/inventory/purchase-orders?meta=vendors&branchId=${branchId}`),
          fetch(`/api/inventory/purchase-orders?meta=products&branchId=${branchId}`),
        ]);
        if (!mounted) return;
        if (vRes.ok) {
          const vJson = await vRes.json();
          setVendors(vJson.items || []);
        }
        if (pRes.ok) {
          const pJson = await pRes.json();
          setProducts(pJson.items || []);
        }
      } catch (e) {
        console.warn("Meta load failed", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [branchId]);

  /* -------------------------
     Load workspace data (PO or Ledger)
  ------------------------- */
  const loadWorkspaceData = (opts?: { page?: number; limit?: number }) => {
    if (!branchId) return;
    startTransition(async () => {
      setError(null);
      try {
        const q = buildQuery({ page: opts?.page, limit: opts?.limit, type: viewType });
        const res = await fetch(`/api/inventory/purchase-orders?${q}`);
        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "ACCESS_DENIED: You are not authorized for this branch.");
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "Failed to fetch purchase orders.");
        }
        const data = await res.json();
        // API returns { items, total, page, limit } for both branches
        if (viewType === "ledger") {
          setLedger(data.items || []);
          setTotal(data.total ?? 0);
        } else {
          setOrders(data.items || []);
          setTotal(data.total ?? 0);
        }
      } catch (err: any) {
        console.error("PO Workspace Error:", err);
        setError(err?.message || "Failed to sync purchase orders.");
        dispatch({
          kind: "TOAST",
          type: "SYSTEM",
          title: "Sync error",
          message: err?.message || "Failed to sync purchase orders.",
        });
      }
    });
  };

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, fromDate, toDate, limit, viewType]);

  useEffect(() => {
    loadWorkspaceData({ page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, page, limit, searchTerm, statusFilter, fromDate, toDate, viewType]);

  /* -------------------------
     Stats (PO view)
  ------------------------- */
  const stats = useMemo(() => {
    if (viewType === "ledger") {
      return { totalEvents: ledger.length };
    }
    const totalValue = orders.reduce((acc, curr) => acc + Number(curr.totalAmount || 0), 0);
    const pending = orders.filter((o) => o.status === POStatus.ISSUED).length;
    const fulfilled = orders.filter((o) => o.status === POStatus.FULFILLED).length;
    const overdue = orders.filter((o) => o.status !== POStatus.FULFILLED && o.expectedDate && new Date(o.expectedDate) < new Date()).length;
    return { totalValue, pending, fulfilled, overdue };
  }, [orders, ledger, viewType]);

  /* -------------------------
     Export CSV (page or all)
  ------------------------- */
  const exportCSV = async (all = false) => {
    try {
      if (all && !userCanExport) {
        setError("You do not have permission to export all data.");
        dispatch({
          kind: "TOAST",
          type: "SYSTEM",
          title: "Export denied",
          message: "You do not have permission to export all data.",
        });
        return;
      }
      const q = buildQuery({
        exportAll: all,
        limit: all ? EXPORT_LIMIT : limit,
        page: 1,
        type: viewType,
      });
      const res = await fetch(`/api/inventory/purchase-orders?${q}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Export failed");
      }
      // If backend returns CSV directly (text/csv), handle it; otherwise build CSV from JSON
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/csv")) {
        const blob = await res.blob();
        saveAs(blob, `${viewType === "ledger" ? "po_ledger" : "purchase_orders"}_${new Date().toISOString()}.csv`);
        dispatch({
          kind: "PUSH",
          type: "INVENTORY",
          title: "Export ready",
          message: `CSV export for ${viewType === "ledger" ? "ledger" : "purchase orders"} is ready.`,
        });
        return;
      }
      const data = await res.json();
      if (viewType === "ledger") {
        const items: IActivityLog[] = data.items || [];
        const header = ["id", "action", "description", "severity", "actorRole", "createdAt", "requestId"];
        const rows = items.map((it) => [
          it.id,
          it.action,
          it.description || "",
          it.severity || "",
          it.actorRole || "",
          it.createdAt || "",
          it.requestId || "",
        ]);
        const csv = [header.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        saveAs(blob, `po_ledger_${new Date().toISOString()}.csv`);
      } else {
        const items: IPurchaseOrder[] = data.items || [];
        const header = ["id", "poNumber", "vendor", "status", "totalAmount", "expectedDate", "createdAt", "createdBy", "itemsCount"];
        const rows = items.map((it) => [
          it.id,
          it.poNumber,
          it.vendor?.name || "",
          it.status,
          String(it.totalAmount ?? ""),
          it.expectedDate ? new Date(it.expectedDate).toISOString() : "",
          it.createdAt || "",
          it.createdBy?.name || "",
          String((it.items || []).length),
        ]);
        const csv = [header.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        saveAs(blob, `purchase_orders_${new Date().toISOString()}.csv`);
      }
      dispatch({
        kind: "PUSH",
        type: "INVENTORY",
        title: "Export started",
        message: `Export for ${viewType === "ledger" ? "ledger" : "purchase orders"} completed.`,
      });
    } catch (e: any) {
      console.error("Export error", e);
      setError(e?.message || "Export error");
      dispatch({
        kind: "TOAST",
        type: "SYSTEM",
        title: "Export failed",
        message: e?.message || "Export failed",
      });
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  /* -------------------------
     Status config helper
  ------------------------- */
  const getStatusConfig = (status: POStatus) => {
    switch (status) {
      case POStatus.FULFILLED:
        return { label: "FULFILLED", classes: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800", icon: CheckCircle2 };
      case POStatus.ISSUED:
        return { label: "ISSUED", classes: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800", icon: Clock };
      case POStatus.PARTIALLY_RECEIVED:
        return { label: "PARTIAL", classes: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800", icon: Filter };
      case POStatus.CANCELLED:
        return { label: "CANCELLED", classes: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800", icon: AlertCircle };
      default:
        return { label: "DRAFT", classes: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700", icon: FileText };
    }
  };

  /* -------------------------
     Create PO modal handler will use alerts
  ------------------------- */
  async function createPO(payload: any) {
    try {
      const res = await fetch("/api/inventory/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to create PO");
      }
      // success
      dispatch({
        kind: "PUSH",
        type: "TRANSACTIONAL",
        title: "Purchase Order Created",
        message: `PO ${data.poNumber || data.id || ""} created successfully.`,
      });
      // refresh
      loadWorkspaceData({ page: 1 });
      return data;
    } catch (err: any) {
      dispatch({
        kind: "TOAST",
        type: "SYSTEM",
        title: "Create PO failed",
        message: err?.message || "Failed to create PO",
      });
      throw err;
    }
  }

  /* -------------------------
     Render
  ------------------------- */
  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans relative overflow-hidden transition-colors duration-300">
      {isPending && (
        <div className="absolute inset-0 flex justify-center items-center bg-white/40 dark:bg-slate-950/40 backdrop-blur-sm z-[200]">
          <Loader2 className="w-12 h-12 text-emerald-600 dark:text-emerald-500 animate-spin" />
        </div>
      )}

      <header className="w-full flex flex-col bg-white dark:bg-slate-900 border-b border-black/[0.04] dark:border-slate-800 shrink-0 sticky top-0 z-[40] transition-colors">
        <div className="w-full flex items-center justify-between px-4 py-2 min-w-0 h-14">
          <div className="min-w-0 flex-1 md:flex-none flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-emerald-600 to-teal-500 rounded-lg shadow-sm">
              <ShoppingCart className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="truncate text-[16px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">Purchase Orders</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide">Procurement ledger & order registry</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:relative sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={viewType === "ledger" ? "Search ledger (action, description)..." : "Search PO or Vendor..."}
                className="bg-slate-100/80 dark:bg-slate-800/80 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-48 md:w-64 rounded-md focus:ring-1 focus:ring-emerald-500 transition-all outline-none dark:text-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewType("po")}
                className={`px-2 py-1 rounded-md text-[11px] font-bold ${viewType === "po" ? "bg-emerald-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"}`}
              >
                PO
              </button>
              <button
                onClick={() => setViewType("ledger")}
                className={`px-2 py-1 rounded-md text-[11px] font-bold ${viewType === "ledger" ? "bg-emerald-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"}`}
              >
                Ledger
              </button>
            </div>

            <button onClick={() => loadWorkspaceData({ page })} disabled={isPending} className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin text-emerald-500" : ""}`} />
            </button>

            <button onClick={() => setShowFilters((s) => !s)} className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors">
              <Filter className="w-4 h-4" />
            </button>

            <div className="hidden md:flex gap-2 items-center">
              <button onClick={() => exportCSV(false)} className="h-8 px-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-2">
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>

            <button onClick={() => setCreateModalOpen(true)} className="hidden md:flex h-8 px-3 bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-emerald-700 transition-all items-center gap-1.5 shadow-sm">
              <Plus className="w-3.5 h-3.5" />
              <span>Initiate PO</span>
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="w-full px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap gap-3 items-center">
            {viewType === "po" ? (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400">Status</label>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 text-sm outline-none">
                    <option value="all">All</option>
                    <option value="DRAFT">DRAFT</option>
                    <option value="ISSUED">ISSUED</option>
                    <option value="PARTIALLY_RECEIVED">PARTIAL</option>
                    <option value="FULFILLED">FULFILLED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400">From</label>
                  <input type="date" value={fromDate ?? ""} onChange={(e) => setFromDate(e.target.value || null)} className="rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 text-sm outline-none" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400">To</label>
                  <input type="date" value={toDate ?? ""} onChange={(e) => setToDate(e.target.value || null)} className="rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 text-sm outline-none" />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400">From</label>
                  <input type="date" value={fromDate ?? ""} onChange={(e) => setFromDate(e.target.value || null)} className="rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 text-sm outline-none" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400">To</label>
                  <input type="date" value={toDate ?? ""} onChange={(e) => setToDate(e.target.value || null)} className="rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 text-sm outline-none" />
                </div>
              </>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => exportCSV(true)} disabled={!userCanExport} className={`px-3 py-1 rounded-md ${userCanExport ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"} text-[11px] font-bold uppercase transition-colors`}>
                Export All CSV
              </button>
            </div>
          </div>
        )}
      </header>

<div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col xl:flex-row pb-12">
  <main className="flex-1 px-4 lg:px-6 flex flex-col gap-6">
    {/* Error Alert - Integrated into the new spacing flow */}
    {error && (
      <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-lg flex items-center gap-3 text-red-600 dark:text-red-400">
        <Lock className="w-4 h-4" />
        <span className="text-[11px] font-bold uppercase tracking-wider">{error}</span>
      </div>
    )}

    {/* Stat Section */}
    <section className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
      {viewType === "po" ? (
        <>
          <StatCard title="Asset Pipeline" value={`₦${(stats as any).totalValue?.toLocaleString?.() ?? "0"}`} icon={ShoppingCart} color="emerald" />
          <StatCard title="Active Requests" value={(stats as any).pending ?? 0} icon={Clock} color="blue" />
          <StatCard title="Overdue Receipts" value={(stats as any).overdue ?? 0} icon={AlertCircle} color="red" />
          <StatCard title="Cycle Completed" value={(stats as any).fulfilled ?? 0} icon={CheckCircle2} color="emerald" />
        </>
      ) : (
        <div className="col-span-1 md:col-span-4 bg-slate-50/50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[13px] font-bold">Audit Ledger</h3>
              <p className="text-[11px] text-slate-500">Recent activity and cryptographic audit events</p>
            </div>
            <div className="text-[11px] font-mono text-slate-500 bg-white dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-800">
              {(stats as any).totalEvents} events
            </div>
          </div>
        </div>
      )}
    </section>

    {/* Main Table Container */}
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex flex-col min-h-[500px] transition-colors bg-white dark:bg-slate-900">
      <div className="overflow-x-auto custom-scrollbar flex-1">
        {viewType === "ledger" ? (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80">
                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Action</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Description</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Severity</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actor</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-20 text-center text-slate-400 text-[11px] font-bold uppercase">No ledger events found.</td>
                </tr>
              ) : (
                ledger.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="px-5 py-3">
                      <div className="text-[13px] font-bold text-slate-900 dark:text-white">{log.action}</div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{log.description}</div>
                    </td>
                    <td className="px-5 py-3 text-[11px] text-slate-500 dark:text-slate-400">{log.severity || "INFO"}</td>
                    <td className="px-5 py-3 text-[11px] text-slate-500 dark:text-slate-400">{log.actorRole || "SYSTEM"}</td>
                    <td className="px-5 py-3 text-right text-[11px] text-slate-500 font-mono">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80">
                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Order Registry</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Vendor Node</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Commitment (₦)</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Protocol Status</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-20 text-center text-slate-400 text-[11px] font-bold uppercase">No purchase orders found.</td>
                </tr>
              ) : (
                orders.map((order) => {
                  const status = getStatusConfig(order.status as POStatus);
                  const StatusIcon = status.icon;
                  return (
                    <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-5 py-3">
                        <div className="text-[13px] font-bold text-slate-900 dark:text-white">{order.poNumber}</div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">By {order.createdBy?.name || "System"}</div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{order.vendor?.name}</div>
                        <div className="text-[10px] text-slate-400 truncate w-32">{order.vendor?.email}</div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="text-[13px] font-bold text-slate-900 dark:text-white">{Number(order.totalAmount).toLocaleString()}</div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase">{order.items.length} SKUs</div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <div className="flex justify-center">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold tracking-widest border ${status.classes}`}>
                            <StatusIcon className="w-3 h-3" />
                            {status.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1.5 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setSelectedPO(order)} className="p-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-700 transition-colors">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button className="p-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 transition-colors">
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Sticky Refined Pagination Footer */}
      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between sticky bottom-0 bg-white dark:bg-slate-900">
        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          Showing <strong>{Math.min((page - 1) * limit + 1, total || 0)}</strong> - <strong>{Math.min(page * limit, total || 0)}</strong> of <strong>{total}</strong>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={limit} 
            onChange={(e) => setLimit(Number(e.target.value))} 
            className="rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs outline-none border-none font-bold text-slate-600 dark:text-slate-300"
          >
            <option value={10}>10 per page</option>
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
          </select>

          <div className="flex items-center gap-1">
            <button 
              onClick={() => setPage((p) => Math.max(1, p - 1))} 
              disabled={page <= 1} 
              className="px-3 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-bold disabled:opacity-50 transition-colors hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              Prev
            </button>
            <div className="px-3 text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
              {page} / {totalPages}
            </div>
            <button 
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))} 
              disabled={page >= totalPages} 
              className="px-3 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-bold disabled:opacity-50 transition-colors hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  </main>
</div>

      {/* Initiate PO modal */}
      {isCreateModalOpen && (
        <CreatePOModal
          vendors={vendors}
          products={products}
          onClose={() => setCreateModalOpen(false)}
          onCreate={async (payload: any) => {
            try {
              await createPO(payload);
              setCreateModalOpen(false);
            } catch {
              // createPO already dispatched alerts
            }
          }}
        />
      )}

      {/* PO detail panel */}
      {selectedPO && <PODetailPanel po={selectedPO} onClose={() => setSelectedPO(null)} />}
    </div>
  );
}

/* -------------------------
   Inline components
------------------------- */

function StatCard({ title, value, icon: Icon, color }: any) {
  const colorMap: any = { emerald: "text-emerald-600 dark:text-emerald-400", blue: "text-blue-600 dark:text-blue-400", red: "text-red-600 dark:text-red-400" };
  const iconColorMap: any = { emerald: "text-emerald-200 dark:text-emerald-900/40", blue: "text-blue-200 dark:text-blue-900/40", red: "text-red-200 dark:text-red-900/40" };
  return (
    <div className="bg-white dark:bg-slate-900 p-4 lg:p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-colors">
      <p className={`text-[10px] font-bold ${colorMap[color] || "text-slate-500"} uppercase tracking-wider`}>{title}</p>
      <div className="flex items-end justify-between mt-2">
        <h3 className={`text-xl lg:text-2xl font-bold ${color === "emerald" ? "text-slate-900 dark:text-white" : colorMap[color]}`}>{value}</h3>
        <Icon className={`w-5 h-5 ${iconColorMap[color]}`} />
      </div>
    </div>
  );
}

/* -------------------------
   Create PO Modal
------------------------- */

function CreatePOModal({ vendors, products, onClose, onCreate }: any) {
  const [vendorId, setVendorId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<IPOItem[]>([{ productId: "", quantityOrdered: 1, unitCost: 0 }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { dispatch: dispatch } = useAlerts();

  const addItem = () => setItems([...items, { productId: "", quantityOrdered: 1, unitCost: 0 }]);
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));
  const updateItem = (index: number, field: keyof IPOItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === "productId") {
      const prod = products.find((p: any) => p.id === value);
      if (prod) newItems[index].unitCost = prod.costPrice ?? newItems[index].unitCost;
    }
    setItems(newItems);
  };

  const totalAmount = items.reduce((sum, item) => sum + (item.quantityOrdered * item.unitCost), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!vendorId) {
      setError("Vendor is required");
      setIsSubmitting(false);
      return;
    }
    if (!items || items.length === 0) {
      setError("At least one line item is required");
      setIsSubmitting(false);
      return;
    }

    try {
      const payload = { vendorId, expectedDate: expectedDate || null, notes, items };
      await onCreate(payload);
      dispatch({
        kind: "TOAST",
        type: "TRANSACTIONAL",
        title: "PO created",
        message: `Purchase order created successfully.`,
      });
    } catch (err: any) {
      setError(err?.message || "Failed to create PO");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Initiate Purchase Order</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Secure protocol & audit logging enabled</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-xs font-bold border border-red-100">{error}</div>}

          <form id="po-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">Vendor Node</label>
                <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} required className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors">
                  <option value="">Select Vendor...</option>
                  {vendors.map((v: any) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">Expected Arrival</label>
                <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors" />
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Line Items</span>
                <button type="button" onClick={addItem} className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 hover:text-emerald-700">
                  <Plus className="w-3 h-3" /> Add SKU
                </button>
              </div>

              <div className="p-4 space-y-3 dark:bg-slate-900/50">
                {items.map((item, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row gap-3 items-end">
                    <div className="flex-1 w-full">
                      <label className="block text-[10px] text-slate-500 dark:text-slate-400 uppercase mb-1">Product Registry</label>
                      <select value={item.productId} onChange={(e) => updateItem(idx, "productId", e.target.value)} required className="w-full border border-slate-200 dark:border-slate-700 rounded-md text-sm p-2 outline-none focus:border-emerald-500 dark:bg-slate-950 dark:text-white transition-colors">
                        <option value="">Select Product...</option>
                        {products.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            [{p.sku}] {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="w-full sm:w-24">
                      <label className="block text-[10px] text-slate-500 dark:text-slate-400 uppercase mb-1">Qty</label>
                      <input type="number" min="1" value={item.quantityOrdered} onChange={(e) => updateItem(idx, "quantityOrdered", Number(e.target.value))} required className="w-full border border-slate-200 dark:border-slate-700 rounded-md text-sm p-2 outline-none focus:border-emerald-500 dark:bg-slate-950 dark:text-white transition-colors" />
                    </div>

                    <div className="w-full sm:w-32">
                      <label className="block text-[10px] text-slate-500 dark:text-slate-400 uppercase mb-1">Unit Cost (₦)</label>
                      <input type="number" min="0" value={item.unitCost} onChange={(e) => updateItem(idx, "unitCost", Number(e.target.value))} required className="w-full border border-slate-200 dark:border-slate-700 rounded-md text-sm p-2 outline-none focus:border-emerald-500 dark:bg-slate-950 dark:text-white transition-colors" />
                    </div>

                    <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors disabled:opacity-30">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="bg-slate-50 dark:bg-slate-800 px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end items-center gap-4">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Commitment</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white">₦{totalAmount.toLocaleString()}</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">Protocol Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Add compliance or delivery instructions..." className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white resize-none transition-colors"></textarea>
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors uppercase tracking-wider">
            Cancel
          </button>
          <button type="submit" form="po-form" disabled={isSubmitting} onClick={handleSubmit} className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors uppercase tracking-wider disabled:opacity-70">
            {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Generate Order
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------
   PO Detail Panel
------------------------- */

function PODetailPanel({ po, onClose }: { po: IPurchaseOrder; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-slate-900/20 dark:bg-slate-950/50 backdrop-blur-sm z-[90] transition-opacity" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl z-[100] flex flex-col animate-in slide-in-from-right duration-300 border-l dark:border-slate-800 transition-colors">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white dark:from-slate-800/50 dark:to-slate-900">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {po.poNumber}
              <span className="px-2 py-0.5 rounded text-[9px] font-bold tracking-widest bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 uppercase">{po.status}</span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Created on {new Date(po.createdAt).toLocaleDateString()}</p>
          </div>

          <div className="flex items-center gap-2">
            <button className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-full transition-colors" title="Export PDF">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Package className="w-3 h-3" /> Vendor Node
            </h4>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
              <p className="text-sm font-bold text-slate-900 dark:text-white">{po.vendor?.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{po.vendor?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5" /> Expected
              </h4>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : "N/A"}</p>
            </div>

            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <User className="w-2.5 h-2.5" /> Initiated
              </h4>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{po.createdBy?.name || "System"}</p>
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Order Registry Items</h4>
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Item</th>
                    <th className="px-3 py-2 text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Qty</th>
                    <th className="px-3 py-2 text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Total</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs dark:bg-slate-900/50">
                  {po.items.map((item: any, idx: number) => (
                    <tr key={idx}>
                      <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300">[{item.product?.sku}] {item.product?.name}</td>
                      <td className="px-3 py-2.5 text-right text-slate-500 dark:text-slate-400">{item.quantityOrdered}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-900 dark:text-white">₦{(item.quantityOrdered * item.unitCost).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>

                <tfoot className="bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                  <tr>
                    <td colSpan={2} className="px-3 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase text-right tracking-wider">Total Commitment</td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-slate-900 dark:text-white">₦{Number(po.totalAmount).toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between gap-3">
          <button className="flex-1 py-2 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors">Void Order</button>
          <button className="flex-1 py-2 bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors">Receive Goods</button>
        </div>
      </div>
    </>
  );
}
