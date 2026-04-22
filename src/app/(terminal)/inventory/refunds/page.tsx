"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Search,
  Plus,
  RefreshCw,
  Filter,
  Download,
  Loader2,
  Package,
  Lock,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  Clock,
  RotateCcw,
  Ban
} from "lucide-react";
import { saveAs } from "file-saver";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSession } from "next-auth/react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { CreateRefundPanel } from "@/modules/inventory/components/CreateRefundPanel"
import { RefundDetailView } from "@/modules/inventory/components/RefundDetailView"

/* -------------------------
   Types & Interfaces
------------------------- */

type Role = "ADMIN" | "MANAGER" | "SALES" | "INVENTORY" | "CASHIER" | "DEV" | "AUDITOR";

export enum ApprovalStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  EXPIRED = "EXPIRED",
}

interface IRefundItem {
  id?: string;
  branchProductId: string;
  quantity: number;
  refundAmount: number;
  restocked: boolean;
  branchProduct?: {
    product?: { name?: string; sku?: string; uom?: { abbreviation?: string } };
  };
}

interface IRefund {
  id: string;
  refundNumber: string;
  status: ApprovalStatus;
  totalRefunded: number;
  reason?: string;
  createdAt: string;
  invoiceId: string;
  invoice?: { invoiceNumber: string; customer?: { name?: string } };
  processedBy?: { name?: string };
  approvedBy?: { name?: string };
  items: IRefundItem[];
}

interface IFinancialAccount {
  id: string;
  name: string;
  balance: number | string;
  type: string;
}

const DEFAULT_LIMIT = 25;
const EXPORT_LIMIT = 5000;

/* -------------------------
   Helper: Safe JSON Fetch
------------------------- */
async function safeFetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (res.headers.get("content-type")?.includes("text/csv")) {
    return res; 
  }
  
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error(`Fetch JSON failed for ${url}. Response text:`, text.substring(0, 200));
    throw new Error(`Server returned an invalid response (${res.status} ${res.statusText}).`);
  }

  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed with status ${res.status}`);
  }
  return data;
}

/* ==============================================================================
   MAIN WORKSPACE COMPONENT
============================================================================== */

export default function RefundsWorkspace({ branchId }: { branchId: string }) {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();
  const { openPanel, closePanel } = useSidePanel();

  const orgId = (session?.user as any)?.organizationId;
  const userRole = (session?.user as any)?.role as Role | undefined;
  const isOrgOwner = (session?.user as any)?.isOrgOwner;

  // RBAC
  const userCanExport = isOrgOwner || ["ADMIN", "MANAGER", "AUDITOR", "DEV"].includes(userRole || "");
  const canProcessRefund = isOrgOwner || ["ADMIN", "MANAGER", "AUDITOR", "DEV"].includes(userRole || "");

  // Data State
  const [refunds, setRefunds] = useState<IRefund[]>([]);
  const [accounts, setAccounts] = useState<IFinancialAccount[]>([]);
  const [branchProducts, setBranchProducts] = useState<any[]>([]);

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | "all">("all");
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [total, setTotal] = useState(0);

  // UI State
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  /* -------------------------
     Time-Aware Theme
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
     Query Builder
  ------------------------- */
  const buildQuery = (opts?: { page?: number; limit?: number; exportAll?: boolean }) => {
    const q = new URLSearchParams();
    if (orgId) q.set("orgId", orgId);
    if (branchId) q.set("branchId", branchId);
    q.set("page", String(opts?.page ?? page));
    q.set("limit", String(opts?.limit ?? limit));

    if (searchTerm) q.set("search", searchTerm);
    if (statusFilter !== "all") q.set("status", statusFilter);
    if (fromDate) q.set("from", fromDate);
    if (toDate) q.set("to", toDate);
    if (opts?.exportAll) q.set("export", "true");

    return q.toString();
  };

  /* -------------------------
     Load Dependencies
  ------------------------- */
  useEffect(() => {
    if (!orgId) return;
    let mounted = true;
    (async () => {
      try {
        const data = await safeFetchJson(`/api/refunds?meta=dependencies&orgId=${orgId}&branchId=${branchId}`);
        if (!mounted) return;
        setAccounts(data.accounts || []);
        setBranchProducts(data.branchProducts || []);
      } catch (e) {
        console.warn("Dependencies load failed:", e);
      }
    })();
    return () => { mounted = false; };
  }, [orgId, branchId]);

  /* -------------------------
     Load Workspace Data
  ------------------------- */
  const loadWorkspaceData = (opts?: { page?: number; limit?: number }) => {
    if (!orgId) return;
    startTransition(async () => {
      setError(null);
      try {
        const q = buildQuery({ page: opts?.page, limit: opts?.limit });
        const data = await safeFetchJson(`/api/refunds?${q}`);
        setRefunds(data.items || []);
        setTotal(data.total ?? 0);
      } catch (err: any) {
        setError(err?.message || "Sync error.");
        dispatch({ kind: "TOAST", type: "ERROR", title: "Sync Fault", message: err?.message });
      }
    });
  };

  useEffect(() => { setPage(1); }, [searchTerm, statusFilter, fromDate, toDate, limit]);
  useEffect(() => {
    loadWorkspaceData({ page });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, branchId, page, limit, searchTerm, statusFilter, fromDate, toDate]);

  /* -------------------------
     Stats Calculation
  ------------------------- */
  const stats = useMemo(() => {
    const totalValue = refunds.reduce((acc, curr) => acc + Number(curr.totalRefunded || 0), 0);
    const pending = refunds.filter((t) => t.status === ApprovalStatus.PENDING).length;
    const approved = refunds.filter((t) => t.status === ApprovalStatus.APPROVED).length;
    const rejected = refunds.filter((t) => t.status === ApprovalStatus.REJECTED).length;
    return { totalValue, pending, approved, rejected };
  }, [refunds]);

  /* -------------------------
     Export CSV
  ------------------------- */
  const exportCSV = async (all = false) => {
    try {
      if (all && !userCanExport) throw new Error("Permission denied for global export.");
      const q = buildQuery({ exportAll: true, limit: all ? EXPORT_LIMIT : limit, page: 1 });
      
      const res = await safeFetchJson(`/api/refunds?${q}`);
      const blob = await (res as Response).blob();
      saveAs(blob, `refunds_log_${new Date().toISOString()}.csv`);
      
      dispatch({ kind: "PUSH", type: "SUCCESS", title: "Export Complete", message: "Refunds record exported." });
    } catch (e: any) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Export Fault", message: e?.message });
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  /* -------------------------
     Panel Handlers
  ------------------------- */
  const handleOpenCreatePanel = () => {
    openPanel(
      <CreateRefundPanel
        branchProducts={branchProducts}
        onClose={closePanel}
        onSuccess={() => { closePanel(); loadWorkspaceData({ page: 1 }); }}
      />,
      "Initiate Return"
    );
  };

  const handleOpenDetailPanel = (refund: IRefund) => {
    openPanel(
      <RefundDetailView
        refund={refund}
        accounts={accounts}
        canProcess={canProcessRefund}
        onClose={closePanel}
        onRefresh={() => loadWorkspaceData()}
      />,
      "Return Details"
    );
  };

  const getStatusConfig = (status: ApprovalStatus) => {
    switch (status) {
      case ApprovalStatus.APPROVED: return { label: "APPROVED", classes: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800", icon: CheckCircle2 };
      case ApprovalStatus.PENDING: return { label: "PENDING", classes: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800", icon: Clock };
      case ApprovalStatus.REJECTED: return { label: "REJECTED", classes: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800", icon: AlertOctagon };
      default: return { label: status, classes: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700", icon: Ban };
    }
  };

  /* -------------------------
     Render
  ------------------------- */
  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans relative overflow-hidden transition-colors duration-300">
      {isPending && (
        <div className="absolute inset-0 flex justify-center items-center bg-white/40 dark:bg-slate-950/40 backdrop-blur-sm z-[200]">
          <Loader2 className="w-12 h-12 text-red-500 dark:text-red-500 animate-spin" />
        </div>
      )}

      {/* Header */}
      <header className="w-full flex flex-col bg-white dark:bg-slate-900 border-b border-black/[0.04] dark:border-slate-800 shrink-0 sticky top-0 z-[40] transition-colors">
        <div className="w-full flex items-center justify-between px-4 py-2 min-w-0 h-14">
          <div className="min-w-0 flex-1 md:flex-none flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-red-600 to-orange-500 rounded-lg shadow-sm">
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="truncate text-[16px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight font-mono uppercase">Returns & Refunds</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide uppercase">Reverse Logistics & Payouts</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:relative sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search Reference or Invoice..."
                className="bg-slate-100/80 dark:bg-slate-800/80 border-none py-1.5 pl-8 pr-4 text-[11px] font-bold font-mono w-48 md:w-64 rounded-md focus:ring-1 focus:ring-red-500 transition-all outline-none dark:text-white uppercase"
              />
            </div>
            <button onClick={() => loadWorkspaceData({ page })} disabled={isPending} className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin text-red-500" : ""}`} />
            </button>
            <button onClick={() => setShowFilters((s) => !s)} className={`p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors ${showFilters ? 'bg-slate-100 dark:bg-slate-800' : ''}`} title="Toggle Filters">
              <Filter className="w-4 h-4" />
            </button>
            <div className="hidden md:flex gap-2 items-center">
              <button onClick={() => exportCSV(false)} className="h-8 px-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-2">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
            <button onClick={handleOpenCreatePanel} className="hidden md:flex h-8 px-3 bg-red-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-red-700 transition-all items-center gap-1.5 shadow-sm">
              <Plus className="w-3.5 h-3.5" /> Initiate Return
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        {showFilters && (
          <div className="w-full px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap gap-3 items-center animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Protocol Status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded text-[11px] font-bold py-1 px-2 outline-none focus:ring-1 focus:ring-red-500 dark:text-white uppercase cursor-pointer">
                <option value="all">ALL PROTOCOLS</option>
                {Object.values(ApprovalStatus).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Timeframe</span>
              <div className="flex items-center bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 p-0.5">
                <input type="date" value={fromDate || ""} onChange={(e) => setFromDate(e.target.value || null)} className="bg-transparent border-none text-[10px] font-bold px-2 py-0.5 outline-none dark:text-white invert-0 dark:invert uppercase cursor-pointer" />
                <span className="text-slate-300 dark:text-slate-600 px-1">—</span>
                <input type="date" value={toDate || ""} onChange={(e) => setToDate(e.target.value || null)} className="bg-transparent border-none text-[10px] font-bold px-2 py-0.5 outline-none dark:text-white invert-0 dark:invert uppercase cursor-pointer" />
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => exportCSV(true)} disabled={!userCanExport} className={`px-3 py-1 rounded-md ${userCanExport ? "bg-red-600 hover:bg-red-700 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"} text-[11px] font-bold uppercase transition-colors`}>
                Export All CSV
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col pb-12">
        <main className="flex-1 px-4 lg:px-6 flex flex-col gap-6 pt-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-lg flex items-center gap-3 text-red-600 dark:text-red-400 animate-in fade-in">
              <Lock className="w-4 h-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">{error}</span>
            </div>
          )}

          {/* Stats */}
          <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Value Refunded" value={`₦${stats.totalValue.toLocaleString()}`} icon={RotateCcw} color="blue" />
            <StatCard title="Pending Approvals" value={stats.pending} icon={Clock} color="amber" />
            <StatCard title="Approved Returns" value={stats.approved} icon={CheckCircle2} color="emerald" />
            <StatCard title="Rejected / Void" value={stats.rejected} icon={AlertOctagon} color="red" />
          </section>

          {/* Table */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex flex-col min-h-[500px] bg-white dark:bg-slate-900 transition-colors shadow-sm">
            <div className="overflow-x-auto custom-scrollbar flex-1">
              <table className="w-full text-left whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80">
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Protocol Reference</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target Invoice</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Value Output (₦)</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Protocol Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {refunds.length === 0 && !isPending ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-20 text-center text-slate-400 text-[11px] font-bold uppercase tracking-widest">
                        <div className="flex flex-col items-center gap-2">
                          <Package className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                          No reverse logistics found.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    refunds.map((t) => {
                      const status = getStatusConfig(t.status);
                      const StatusIcon = status.icon;

                      return (
                        <tr
                          key={t.id}
                          onClick={() => handleOpenDetailPanel(t)}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                        >
                          <td className="px-5 py-3">
                            <div className="text-[13px] font-bold text-slate-900 dark:text-white font-mono group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">{t.refundNumber}</div>
                            <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">By {t.processedBy?.name || "System"}</div>
                          </td>
                          <td className="px-5 py-3">
                            <div className="text-[12px] font-bold text-slate-700 dark:text-slate-300">{t.invoice?.invoiceNumber || "N/A"}</div>
                            <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{t.invoice?.customer?.name || "Walk-In"}</div>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="text-[13px] font-bold text-slate-900 dark:text-white">
                              {Number(t.totalRefunded).toLocaleString()}
                            </div>
                            <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                              {t.items.reduce((s, i) => s + i.quantity, 0)} Units
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

            {/* Pagination Footer */}
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold py-1 px-1.5 outline-none dark:text-white uppercase cursor-pointer">
                  {[25, 50, 100].map((l) => <option key={l} value={l}>{l} Rows</option>)}
                </select>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest hidden sm:inline-block">Total Records: {total}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 uppercase tracking-widest transition-colors cursor-pointer">Prev</button>
                <div className="px-3 text-xs font-mono font-bold text-slate-700 dark:text-slate-300">{page} / {totalPages}</div>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 uppercase tracking-widest transition-colors cursor-pointer">Next</button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ==============================================================================
   SUB-COMPONENTS 
============================================================================== */

function StatCard({ title, value, icon: Icon, color }: { title: string, value: number | string, icon: any, color: 'emerald' | 'blue' | 'amber' | 'red' }) {
  const cMap = { emerald: "text-emerald-500", blue: "text-blue-500", amber: "text-amber-500", red: "text-red-500" };
  const bgMap = { emerald: "text-emerald-500/20", blue: "text-blue-500/20", amber: "text-amber-500/20", red: "text-red-500/20" };

  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-colors">
      <p className={`text-[10px] font-bold ${cMap[color]} uppercase tracking-wider`}>{title}</p>
      <div className="flex justify-between items-end mt-2">
        <h3 className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{value}</h3>
        <Icon className={`w-6 h-6 ${bgMap[color]}`} />
      </div>
    </div>
  );
}