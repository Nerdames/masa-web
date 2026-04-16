"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  Search,
  Plus,
  FileText,
  ShoppingCart,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Filter,
  Download,
  Loader2,
  Lock,
} from "lucide-react";
import { saveAs } from "file-saver";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSession } from "next-auth/react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import PODetailView from "@/modules/inventory/components/PODetailView"
import CreatePOPanel from "@/modules/inventory/components/CreatePOPanel"


type Role = "ADMIN" | "MANAGER" | "SALES" | "INVENTORY" | "CASHIER" | "DEV" | "AUDITOR";

enum POStatus {
  DRAFT = "DRAFT",
  ISSUED = "ISSUED",
  PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED",
  FULFILLED = "FULFILLED",
  CANCELLED = "CANCELLED",
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
  const { openPanel, closePanel } = useSidePanel();

  const orgId = (session?.user as any)?.organizationId;

  const [orders, setOrders] = useState<IPurchaseOrder[]>([]);
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

  const userRole = (session?.user as any)?.role as Role | undefined;
  const userIsOrgOwner = (session?.user as any)?.isOrgOwner as boolean | undefined;

  const userCanExport = useMemo(() => {
    if (!session?.user) return false;
    if (userIsOrgOwner) return true;
    if (!userRole) return false;
    return ["ADMIN", "MANAGER", "AUDITOR", "DEV"].includes(userRole);
  }, [session?.user, userIsOrgOwner, userRole]);

  /* -------------------------
  Time-aware theme
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
  }) => {
    const q = new URLSearchParams();
    if (orgId) q.set("orgId", orgId);
    if (branchId) q.set("branchId", branchId);

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
  Load meta lists
  ------------------------- */
  useEffect(() => {
    if (!orgId) return;
    let mounted = true;
    (async () => {
      try {
        const [vRes, pRes] = await Promise.all([
          fetch(`/api/inventory/purchase-orders?meta=vendors&orgId=${orgId}`),
          fetch(`/api/inventory/purchase-orders?meta=products&orgId=${orgId}${branchId ? `&branchId=${branchId}` : ''}`),
        ]);
        if (!mounted) return;

        if (vRes.ok) {
          const vJson = await vRes.json();
          setVendors(vJson.items || vJson.vendors || []);
        }
        if (pRes.ok) {
          const pJson = await pRes.json();
          setProducts(pJson.items || pJson.products || []);
        }
      } catch (e) {
        console.warn("Meta load failed", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [orgId, branchId]);

  /* -------------------------
  Load workspace data
  ------------------------- */
  const loadWorkspaceData = (opts?: { page?: number; limit?: number }) => {
    if (!orgId) return;

    startTransition(async () => {
      setError(null);
      try {
        const q = buildQuery({ page: opts?.page, limit: opts?.limit });
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
        
        // FIX: Normalize items so productId is guaranteed to be attached directly to the item object
        const normalizedOrders = (data.items || []).map((order: any) => ({
          ...order,
          items: (order.items || []).map((it: any) => ({
            ...it,
            // Fallback to nested product.id if productId is missing or undefined at the root
            productId: it.productId || it.product?.id || "",
          }))
        }));

        setOrders(normalizedOrders);
        setTotal(data.total ?? 0);
      } catch (err: any) {
        console.error("PO Workspace Error:", err);
        setError(err?.message || "Failed to sync purchase orders.");
        dispatch({
          kind: "TOAST",
          type: "ERROR",
          title: "Sync error",
          message: err?.message || "Failed to sync purchase orders.",
        });
      }
    });
  };

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, fromDate, toDate, limit]);

  useEffect(() => {
    loadWorkspaceData({ page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, branchId, page, limit, searchTerm, statusFilter, fromDate, toDate]);

  /* -------------------------
  Stats (PO view)
  ------------------------- */
  const stats = useMemo(() => {
    const totalValue = orders.reduce((acc, curr) => acc + Number(curr.totalAmount || 0), 0);
    const pending = orders.filter((o) => o.status === POStatus.ISSUED).length;
    const fulfilled = orders.filter((o) => o.status === POStatus.FULFILLED).length;
    const overdue = orders.filter((o) => o.status !== POStatus.FULFILLED && o.expectedDate && new Date(o.expectedDate) < new Date()).length;

    return { totalValue, pending, fulfilled, overdue };
  }, [orders]);

  /* -------------------------
  Export CSV
  ------------------------- */
  const exportCSV = async (all = false) => {
    try {
      if (all && !userCanExport) {
        setError("You do not have permission to export all data.");
        dispatch({
          kind: "TOAST",
          type: "ERROR",
          title: "Export denied",
          message: "You do not have permission to export all data.",
        });
        return;
      }
      const q = buildQuery({
        exportAll: all,
        limit: all ? EXPORT_LIMIT : limit,
        page: 1,
      });

      const res = await fetch(`/api/inventory/purchase-orders?${q}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Export failed");
      }
      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("text/csv")) {
        const blob = await res.blob();
        saveAs(blob, `purchase_orders_${new Date().toISOString()}.csv`);
        dispatch({
          kind: "PUSH",
          type: "SUCCESS",
          title: "Export ready",
          message: `CSV export for purchase orders is ready.`,
        });
        return;
      }
      const data = await res.json();

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

      dispatch({
        kind: "PUSH",
        type: "SUCCESS",
        title: "Export started",
        message: `Export for purchase orders completed.`,
      });
    } catch (e: any) {
      console.error("Export error", e);
      setError(e?.message || "Export error");
      dispatch({
        kind: "TOAST",
        type: "ERROR",
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
  Handlers
  ------------------------- */
  async function handleCreatePO(payload: any) {
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
        type: "SUCCESS",
        title: "Purchase Order Created",
        message: `PO ${data.poNumber || data.id || ""} created successfully.`,
      });
      loadWorkspaceData({ page: 1 });
      return data;
    } catch (err: any) {
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Create PO failed",
        message: err?.message || "Failed to create PO",
      });
      throw err;
    }
  }

  const handleOpenCreatePanel = () => {
    openPanel(
      <CreatePOPanel
        vendors={vendors}
        products={products}
        onClose={closePanel}
        onCreate={async (payload: any) => {
          await handleCreatePO(payload);
          closePanel();
        }}
      />,
      "Initiate PO"
    );
  };

  const handleOpenDetailPanel = (order: IPurchaseOrder) => {
    openPanel(<PODetailView po={order} onClose={closePanel} />, "Purchase Order Details");
  };

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
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide">Procurement registry & supply chain tracker</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:relative sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search PO or Vendor..."
                className="bg-slate-100/80 dark:bg-slate-800/80 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-48 md:w-64 rounded-md focus:ring-1 focus:ring-emerald-500 transition-all outline-none dark:text-white"
              />
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

            <button onClick={handleOpenCreatePanel} className="hidden md:flex h-8 px-3 bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-emerald-700 transition-all items-center gap-1.5 shadow-sm">
              <Plus className="w-3.5 h-3.5" />
              <span>Initiate PO</span>
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="w-full px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded text-[11px] font-medium py-1 px-2 outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white">
                <option value="all">All Protocols</option>
                {Object.values(POStatus).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Timeframe</span>
              <div className="flex items-center bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 p-0.5">
                <input type="date" value={fromDate || ""} onChange={(e) => setFromDate(e.target.value || null)} className="bg-transparent border-none text-[10px] font-medium px-2 py-0.5 outline-none dark:text-white invert-0 dark:invert" />
                <span className="text-slate-300 dark:text-slate-600 px-1">—</span>
                <input type="date" value={toDate || ""} onChange={(e) => setToDate(e.target.value || null)} className="bg-transparent border-none text-[10px] font-medium px-2 py-0.5 outline-none dark:text-white invert-0 dark:invert" />
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => exportCSV(true)} disabled={!userCanExport} className={`px-3 py-1 rounded-md ${userCanExport ?
                "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"} text-[11px] font-bold uppercase transition-colors`}>
                Export All CSV
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col xl:flex-row pb-12">
        <main className="flex-1 px-4 lg:px-6 flex flex-col gap-6">
          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-lg flex items-center gap-3 text-red-600 dark:text-red-400">
              <Lock className="w-4 h-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">{error}</span>
            </div>
          )}

          {/* Stat Section */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
            <StatCard title="Asset Pipeline" value={`₦${(stats as any).totalValue?.toLocaleString?.() ?? "0"}`} icon={ShoppingCart} color="emerald" />
            <StatCard title="Active Requests" value={(stats as any).pending ?? 0} icon={Clock} color="blue" />
            <StatCard title="Overdue Receipts" value={(stats as any).overdue ?? 0} icon={AlertCircle} color="red" />
            <StatCard title="Cycle Completed" value={(stats as any).fulfilled ?? 0} icon={CheckCircle2} color="emerald" />
          </section>

          {/* Main Table Container */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex flex-col min-h-[500px] transition-colors bg-white dark:bg-slate-900">
            <div className="overflow-x-auto custom-scrollbar flex-1">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80">
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Order Registry
                    </th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Vendor Node
                    </th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">
                      Commitment (₦)
                    </th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">
                      Protocol Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {orders.length === 0 ? (
                    <tr>
                      {/* colSpan is now 4 to match the 4 remaining header columns */}
                      <td colSpan={4} className="px-5 py-20 text-center text-slate-400 text-[11px] font-bold uppercase">
                        No purchase orders found.
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => {
                      const status = getStatusConfig(order.status as POStatus);
                      const StatusIcon = status.icon;

                      return (
                        <tr
                          key={order.id}
                          onClick={() => handleOpenDetailPanel(order)}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer select-none"
                        >
                          <td className="px-5 py-3">
                            <div className="text-[13px] font-bold text-slate-900 dark:text-white">
                              {order.poNumber}
                            </div>
                            <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                              By {order.createdBy?.name || "System"}
                            </div>
                          </td>

                          <td className="px-5 py-3">
                            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                              {order.vendor?.name}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate w-32">
                              {order.vendor?.email}
                            </div>
                          </td>

                          <td className="px-5 py-3 text-right">
                            <div className="text-[13px] font-bold text-slate-900 dark:text-white">
                              {Number(order.totalAmount).toLocaleString()}
                            </div>
                            <div className="text-[9px] text-slate-400 font-bold uppercase">
                              {order.items.length} SKUs
                            </div>
                          </td>

                          <td className="px-5 py-3 text-center">
                            <div className="flex justify-center">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${status.classes}`}
                              >
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
                <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold py-1 px-1.5 outline-none dark:text-white">
                  {[25, 50, 100].map((l) => (
                    <option key={l} value={l}>{l} Rows</option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  Total Records: {total}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-50 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
                  Prev
                </button>
                <div className="px-3 text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                  {page} / {totalPages}
                </div>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-50 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
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

/* -------------------------
Inline components for SidePanel
------------------------- */

function StatCard({ title, value, icon: Icon, color }: any) {
  const colorMap: any = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    blue: "text-blue-600 dark:text-blue-400",
    red: "text-red-600 dark:text-red-400"
  };
  const iconColorMap: any = {
    emerald: "text-emerald-200 dark:text-emerald-900/40",
    blue: "text-blue-200 dark:text-blue-900/40",
    red: "text-red-200 dark:text-red-900/40"
  };

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