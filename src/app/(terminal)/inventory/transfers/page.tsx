"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  Search,
  Plus,
  ArrowRightLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Filter,
  Download,
  Loader2,
  Package,
  ChevronRight,
  Lock,
  AlertOctagon,
  XCircle,
  Container,
  Truck
} from "lucide-react";
import { saveAs } from "file-saver";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSession } from "next-auth/react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";

// Integrated Components
import { TransferApprovalPanel } from "@/modules/inventory/components/TransferApprovalPanel";
import { TransferDetailView } from "@/modules/inventory/components/TransferDetailView";
import { CreateTransferPanel } from "@/modules/inventory/components/CreateTransferPanel";

/* -------------------------
  Types & Interfaces (MASA Schema Aligned)
------------------------- */

type Role = "ADMIN" | "MANAGER" | "SALES" | "INVENTORY" | "CASHIER" | "DEV" | "AUDITOR";

export enum StockTransferStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  COMPLETED = "COMPLETED", // ADDED: Aligned with the new API schema migration
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
}

export interface ITransferItem {
  id: string;
  branchProductId: string;
  productId: string;
  quantity: number;
  product: { 
    name: string; 
    sku: string; 
    uom?: { abbreviation: string } 
  };
}

export interface IStockTransfer {
  id: string;
  transferNumber: string;
  status: StockTransferStatus;
  fromBranchId: string;
  toBranchId: string;
  fromBranch: { id: string; name: string };
  toBranch: { id: string; name: string };
  createdAt: string;
  notes?: string;
  items: ITransferItem[];
  createdBy?: { name: string } | null;
  approvedBy?: { name: string } | null;
}

interface WorkspaceStats {
  totalUnits: number;
  pending: number;
  inTransit: number;
  completed: number;
}

const DEFAULT_LIMIT = 25;

/* -------------------------
  Helper: API Interface
------------------------- */
async function safeFetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const text = await res.text();
  
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error(`Fetch JSON failed for ${url}. Response:`, text.substring(0, 200));
    throw new Error(`Critical System Fault: Server returned invalid protocol (${res.status}).`);
  }

  if (!res.ok) {
    throw new Error(data.error || data.message || `API Error: ${res.status}`);
  }

  return data;
}

/* ==============================================================================
   MAIN WORKSPACE COMPONENT
   ============================================================================== */

export default function TransferWorkspace({ branchId }: { branchId: string }) {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();
  const { openPanel, closePanel } = useSidePanel();

  const orgId = (session?.user as any)?.organizationId;
  const userRole = (session?.user as any)?.role as Role | undefined;
  
  // Access Control
  const isAuthorized = ["ADMIN", "MANAGER", "INVENTORY", "DEV"].includes(userRole || "");
  const userCanExport = ["ADMIN", "MANAGER", "AUDITOR", "DEV"].includes(userRole || "");

  // Data State
  const [transfers, setTransfers] = useState<IStockTransfer[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
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
  const [isExporting, setIsExporting] = useState(false);

  /* -------------------------
    Time-Aware Theme (Sync with shift hours)
  ------------------------- */
  useEffect(() => {
    const applyTheme = () => {
      const hour = new Date().getHours();
      if (hour >= 19 || hour < 7) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    };
    applyTheme();
  }, []);

  /* -------------------------
    Query Engine
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
    Load Dependencies (Branches & Local Inventory)
  ------------------------- */
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        const data = await safeFetchJson(`/api/transfers?meta=dependencies&orgId=${orgId}&branchId=${branchId}`);
        setBranches(data.branches || []);
        setBranchProducts(data.branchProducts || []);
      } catch (e) {
        console.warn("Logistics metadata sync failed.");
      }
    })();
  }, [orgId, branchId]);

  /* -------------------------
    Load Logistics Data
  ------------------------- */
  const loadWorkspaceData = (opts?: { page?: number; limit?: number }) => {
    if (!orgId) return;
    startTransition(async () => {
      setError(null);
      try {
        const q = buildQuery({ page: opts?.page, limit: opts?.limit });
        const data = await safeFetchJson(`/api/transfers?${q}`);
        
        setTransfers(data.items || []);
        setTotal(data.total ?? 0);
      } catch (err: any) {
        setError(err?.message || "Sync error.");
        dispatch({ kind: "TOAST", type: "ERROR", title: "Protocol Fault", message: err?.message });
      }
    });
  };

  useEffect(() => { setPage(1); }, [searchTerm, statusFilter, fromDate, toDate]);
  
  useEffect(() => { 
    loadWorkspaceData({ page }); 
  }, [orgId, branchId, page, limit, searchTerm, statusFilter, fromDate, toDate]);

  /* -------------------------
    Analytics Aggregator (Updated for 2-stage transfer)
  ------------------------- */
  const stats = useMemo<WorkspaceStats>(() => {
    const totalUnits = transfers.reduce((acc, curr) => acc + curr.items.reduce((sum, item) => sum + item.quantity, 0), 0);
    const pending = transfers.filter((t) => t.status === StockTransferStatus.PENDING).length;
    const inTransit = transfers.filter((t) => t.status === StockTransferStatus.APPROVED).length;
    const completed = transfers.filter((t) => t.status === StockTransferStatus.COMPLETED).length;
    return { totalUnits, pending, inTransit, completed };
  }, [transfers]);

  /* -------------------------
    Native CSV Export (Hit API Endpoint)
  ------------------------- */
  const exportCSV = async () => {
    try {
      if (!userCanExport) throw new Error("Unauthorized: Audit privileges required.");
      setIsExporting(true);

      const q = buildQuery({ exportAll: true });
      const res = await fetch(`/api/transfers?${q}`);
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to compile export data.");
      }

      // API natively returns text/csv now
      const blob = await res.blob();
      saveAs(blob, `MASA_TRANSFERS_${new Date().toISOString().slice(0, 10)}.csv`);
      dispatch({ kind: "PUSH", type: "SUCCESS", title: "Export Buffered", message: "Logistics record saved to terminal." });
    } catch (e: any) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Export Error", message: e?.message });
    } finally {
      setIsExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  /* -------------------------
    Panel Triggers
  ------------------------- */
  const handleOpenCreatePanel = () => {
    openPanel(
      <CreateTransferPanel
        originBranchId={branchId}
        branches={branches}
        branchProducts={branchProducts}
        onClose={closePanel}
        onCreate={async () => { 
          closePanel(); 
          loadWorkspaceData({ page: 1 }); 
        }}
      />,
      "INITIATE STOCK SYNC"
    );
  };

  const handleOpenDetailPanel = (transfer: IStockTransfer) => {
    openPanel(
      <TransferDetailView 
        transfer={transfer} 
        onClose={closePanel} 
        onRefresh={() => loadWorkspaceData()}
        currentUserBranchId={(session?.user as any)?.branchId}
      />, 
      "LOGISTICS MANIFEST"
    );
  };

  const handleOpenApprovePanel = (transfer: IStockTransfer) => {
    openPanel(
      <TransferApprovalPanel 
        transfer={transfer} 
        onClose={closePanel} 
        onRefresh={() => loadWorkspaceData()} 
      />, 
      "PROTOCOL AUTHORIZATION"
    );
  };

  const getStatusConfig = (status: StockTransferStatus) => {
    switch (status) {
      case StockTransferStatus.COMPLETED: return { label: "COMPLETED", classes: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800", icon: CheckCircle2 };
      case StockTransferStatus.APPROVED: return { label: "IN TRANSIT", classes: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800", icon: Truck };
      case StockTransferStatus.PENDING: return { label: "PENDING", classes: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800", icon: Clock };
      case StockTransferStatus.REJECTED: return { label: "REJECTED", classes: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800", icon: AlertOctagon };
      case StockTransferStatus.CANCELLED: return { label: "VOID", classes: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700", icon: XCircle };
      default: return { label: "UNKNOWN", classes: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700", icon: AlertCircle };
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans relative overflow-hidden transition-colors">
      {isPending && (
        <div className="absolute inset-0 flex justify-center items-center bg-white/40 dark:bg-slate-950/40 backdrop-blur-sm z-[200]">
          <Loader2 className="w-12 h-12 text-indigo-600 dark:text-indigo-500 animate-spin" />
        </div>
      )}

      {/* Industrial Header */}
      <header className="w-full flex flex-col bg-white dark:bg-slate-900 border-b border-black/[0.04] dark:border-slate-800 shrink-0 sticky top-0 z-[40]">
        <div className="w-full flex items-center justify-between px-4 py-2 min-w-0 h-14">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-indigo-600 rounded-lg shadow-sm">
              <ArrowRightLeft className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-[16px] font-bold tracking-tight font-mono uppercase">Inter-Node Logistics</h1>
              <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">Real-time Stock Transfer Audit</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:relative sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text" 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                placeholder="SEARCH UUID..."
                className="bg-slate-100 dark:bg-slate-800 border-none py-1.5 pl-8 pr-4 text-[11px] font-bold font-mono w-48 md:w-64 rounded-md outline-none uppercase placeholder:text-slate-400"
              />
            </div>
            <button onClick={() => loadWorkspaceData()} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors">
              <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin text-indigo-500" : ""}`} />
            </button>
            <button onClick={() => setShowFilters(!showFilters)} className={`p-1.5 rounded-md ${showFilters ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              <Filter className="w-4 h-4" />
            </button>
            <button 
              onClick={exportCSV} 
              disabled={isExporting}
              className="hidden md:flex h-8 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold uppercase rounded-md items-center gap-2 transition-colors disabled:opacity-50"
            >
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} 
              CSV
            </button>
            {isAuthorized && (
              <button onClick={handleOpenCreatePanel} className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold uppercase rounded-md flex items-center gap-1.5 shadow-sm shadow-indigo-500/20 transition-all active:scale-95">
                <Plus className="w-3.5 h-3.5" /> NEW TRANSFER
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="w-full px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap gap-4 items-center animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold py-1 px-2 uppercase outline-none cursor-pointer">
                <option value="all">ALL STATUSES</option>
                {Object.values(StockTransferStatus).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Period</span>
              <div className="flex items-center bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 p-0.5">
                <input type="date" value={fromDate || ""} onChange={(e) => setFromDate(e.target.value || null)} className="bg-transparent text-[10px] font-bold px-2 outline-none cursor-pointer dark:invert" />
                <span className="text-slate-300 px-1">—</span>
                <input type="date" value={toDate || ""} onChange={(e) => setToDate(e.target.value || null)} className="bg-transparent text-[10px] font-bold px-2 outline-none cursor-pointer dark:invert" />
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col pb-12">
        <main className="flex-1 px-4 lg:px-6 flex flex-col gap-6 pt-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 rounded-lg flex items-center gap-3 text-red-600 animate-in fade-in">
              <Lock className="w-4 h-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">{error}</span>
            </div>
          )}

          {/* Aggregated Stats */}
          <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Units Logged" value={stats.totalUnits} icon={Package} color="blue" />
            <StatCard title="Awaiting Processing" value={stats.pending} icon={Clock} color="amber" />
            <StatCard title="Active In Transit" value={stats.inTransit} icon={Truck} color="indigo" />
            <StatCard title="Completed Receipts" value={stats.completed} icon={CheckCircle2} color="emerald" />
          </section>

          {/* Audit Table */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex flex-col min-h-[500px] bg-white dark:bg-slate-900 shadow-sm">
            <div className="overflow-x-auto custom-scrollbar flex-1">
              <table className="w-full text-left whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Protocol UUID</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Route (Origin → Target)</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Payload</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {transfers.length === 0 && !isPending ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-24 text-center text-slate-400 text-[11px] font-bold uppercase tracking-widest">
                        <div className="flex flex-col items-center gap-3">
                          <Container className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-1" />
                          Buffer Empty: No logistics records found.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    transfers.map((t) => {
                      const status = getStatusConfig(t.status);
                      const StatusIcon = status.icon;
                      
                      // Allows processing if the user is authorized AND the transfer is in an intermediate state
                      const isActionable = isAuthorized && [StockTransferStatus.PENDING, StockTransferStatus.APPROVED].includes(t.status);

                      return (
                        <tr 
                          key={t.id} 
                          onClick={() => isActionable ? handleOpenApprovePanel(t) : handleOpenDetailPanel(t)} 
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                        >
                          <td className="px-5 py-3">
                            <div className="text-[13px] font-bold font-mono group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{t.transferNumber}</div>
                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">By {t.createdBy?.name || "System"}</div>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{t.fromBranch.name}</span>
                                <span className="text-[8px] text-slate-400 uppercase font-black tracking-tighter">Origin</span>
                              </div>
                              <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{t.toBranch.name}</span>
                                <span className="text-[8px] text-slate-400 uppercase font-black tracking-tighter">Target</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-md">
                              {t.items.reduce((sum, i) => sum + i.quantity, 0)} Units
                            </span>
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

            {/* Pagination Controls */}
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold py-1 px-1.5 uppercase outline-none cursor-pointer">
                  {[25, 50, 100].map((l) => <option key={l} value={l}>{l} Rows</option>)}
                </select>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest hidden sm:inline-block">Total Logs: {total}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-50 uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Prev</button>
                <div className="px-3 text-xs font-mono font-bold text-slate-600 dark:text-slate-300">{page} / {totalPages}</div>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-50 uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Next</button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: { title: string, value: number | string, icon: any, color: 'emerald' | 'blue' | 'amber' | 'red' | 'indigo' }) {
  const cMap = { emerald: "text-emerald-500", blue: "text-blue-500", amber: "text-amber-500", red: "text-rose-500", indigo: "text-indigo-500" };
  const bgMap = { emerald: "text-emerald-500/10 dark:bg-emerald-500/20", blue: "text-blue-500/10 dark:bg-blue-500/20", amber: "text-amber-500/10 dark:bg-amber-500/20", red: "text-rose-500/10 dark:bg-rose-500/20", indigo: "text-indigo-500/10 dark:bg-indigo-500/20" };
  const borderMap = { emerald: "border-emerald-100 dark:border-emerald-900/30", blue: "border-blue-100 dark:border-blue-900/30", amber: "border-amber-100 dark:border-amber-900/30", red: "border-rose-100 dark:border-rose-900/30", indigo: "border-indigo-100 dark:border-indigo-900/30" };
  
  return (
    <div className={`bg-white dark:bg-slate-900 p-5 rounded-xl border shadow-sm flex flex-col justify-between transition-colors ${borderMap[color]}`}>
      <p className={`text-[10px] font-black ${cMap[color]} uppercase tracking-wider`}>{title}</p>
      <div className="flex justify-between items-end mt-3">
        <h3 className="text-3xl font-black font-mono text-slate-900 dark:text-white leading-none">{value}</h3>
        <div className={`p-2 rounded-lg ${bgMap[color]}`}>
          <Icon className={`w-5 h-5 ${cMap[color]}`} />
        </div>
      </div>
    </div>
  );
}