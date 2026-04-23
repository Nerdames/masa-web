"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Filter,
  X,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  Lock,
  ClipboardCheck,
  ShieldAlert,
  DollarSign,
  PackageMinus,
  Mail,
  KeyRound,
  UserX,
  FileMinus,
  UserCheck,
  Clock
} from "lucide-react";
import { saveAs } from "file-saver";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSession } from "next-auth/react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";

/* -------------------------
Types & Interfaces (Aligned with MASA Schema)
------------------------- */

type Role = "ADMIN" | "MANAGER" | "SALES" | "INVENTORY" | "CASHIER" | "DEV" | "AUDITOR";

export enum ApprovalStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  EXPIRED = "EXPIRED",
}

export enum CriticalAction {
  EMAIL_CHANGE = "EMAIL_CHANGE",
  PASSWORD_CHANGE = "PASSWORD_CHANGE",
  PRICE_UPDATE = "PRICE_UPDATE",
  STOCK_ADJUST = "STOCK_ADJUST",
  STOCK_TRANSFER = "STOCK_TRANSFER",
  VOID_INVOICE = "VOID_INVOICE",
  USER_LOCK_UNLOCK = "USER_LOCK_UNLOCK",
}

export interface IApprovalRequest {
  id: string;
  organizationId: string;
  branchId?: string | null;
  requesterId: string;
  approverId?: string | null;
  actionType: CriticalAction;
  status: ApprovalStatus;
  requiredRole: Role;
  changes: any; // JSON representation of changes
  rejectionNote?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  createdAt: string;
  updatedAt: string;
  requester: { id: string; name: string; email: string };
  approver?: { id: string; name: string; email: string } | null;
  branch?: { id: string; name: string } | null;
}

interface WorkspaceStats {
  totalPending: number;
  approvedRecently: number;
  rejectedRecently: number;
  criticalAlerts: number; // e.g., security actions
}

const DEFAULT_LIMIT = 25;
const EXPORT_LIMIT = 10000;

/* -------------------------
Helper: Safe JSON Fetch
------------------------- */
async function safeFetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const text = await res.text();
  
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
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

export default function ApprovalsWorkspace({ branchId }: { branchId?: string }) {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();
  const { openPanel, closePanel } = useSidePanel();

  const orgId = (session?.user as any)?.organizationId;
  const userRole = (session?.user as any)?.role as Role | undefined;
  
  // RBAC checks based on schema enums
  const isAuthorizedApprover = ["ADMIN", "MANAGER", "AUDITOR", "DEV"].includes(userRole || "");
  const userCanExport = ["ADMIN", "MANAGER", "AUDITOR", "DEV"].includes(userRole || "");

  // Data State
  const [approvals, setApprovals] = useState<IApprovalRequest[]>([]);

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | "all">("PENDING");
  const [actionFilter, setActionFilter] = useState<string | "all">("all");
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
    if (actionFilter !== "all") q.set("actionType", actionFilter);
    if (fromDate) q.set("from", fromDate);
    if (toDate) q.set("to", toDate);
    if (opts?.exportAll) q.set("export", "true");
    
    return q.toString();
  };

  /* -------------------------
  Load Workspace Data
  ------------------------- */
  const loadWorkspaceData = (opts?: { page?: number; limit?: number }) => {
    if (!orgId) return;
    startTransition(async () => {
      setError(null);
      try {
        const q = buildQuery({ page: opts?.page, limit: opts?.limit });
        const data = await safeFetchJson(`/api/approvals?${q}`);
        
        setApprovals(data.items || []);
        setTotal(data.total ?? 0);
      } catch (err: any) {
        setError(err?.message || "Sync error.");
        dispatch({ kind: "TOAST", type: "ERROR", title: "Sync Fault", message: err?.message });
      }
    });
  };

  useEffect(() => { setPage(1); }, [searchTerm, statusFilter, actionFilter, fromDate, toDate, limit]);
  
  useEffect(() => {
    loadWorkspaceData({ page });
  }, [orgId, branchId, page, limit, searchTerm, statusFilter, actionFilter, fromDate, toDate]);

  /* -------------------------
  Stats Calculation
  ------------------------- */
  const stats = useMemo<WorkspaceStats>(() => {
    const totalPending = approvals.filter((a) => a.status === ApprovalStatus.PENDING).length;
    const approvedRecently = approvals.filter((a) => a.status === ApprovalStatus.APPROVED).length;
    const rejectedRecently = approvals.filter((a) => a.status === ApprovalStatus.REJECTED).length;
    const criticalAlerts = approvals.filter((a) => 
      a.status === ApprovalStatus.PENDING && 
      [CriticalAction.EMAIL_CHANGE, CriticalAction.PASSWORD_CHANGE, CriticalAction.USER_LOCK_UNLOCK].includes(a.actionType)
    ).length;
    
    return { totalPending, approvedRecently, rejectedRecently, criticalAlerts };
  }, [approvals]);

  /* -------------------------
  Export CSV
  ------------------------- */
  const exportCSV = async (all = false) => {
    try {
      if (all && !userCanExport) throw new Error("Permission denied for global export.");
      const q = buildQuery({ exportAll: all, limit: all ? EXPORT_LIMIT : limit, page: 1 });
      const data = await safeFetchJson(`/api/approvals?${q}`);
      
      const items: IApprovalRequest[] = data.items || [];
      if (items.length === 0) throw new Error("No data available to export.");

      const header = ["RequestID", "ActionType", "Status", "Requester", "TargetNode", "CreatedAt", "Approver"];
      const rows = items.map((it) => [
        it.id,
        it.actionType,
        it.status,
        it.requester?.name || "Unknown",
        it.branch?.name || "Global",
        it.createdAt,
        it.approver?.name || "Pending"
      ]);

      const csv = [header.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
      
      saveAs(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `approval_audit_${new Date().toISOString()}.csv`);
      dispatch({ kind: "PUSH", type: "SUCCESS", title: "Export Complete", message: "Audit log exported to terminal." });
    } catch (e: any) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Export Fault", message: e?.message });
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  /* -------------------------
  Panel Handlers & Configs
  ------------------------- */
  const handleOpenDetailPanel = (approval: IApprovalRequest) => {
    openPanel(
      <ApprovalDetailView
        approval={approval}
        onClose={closePanel}
        onRefresh={() => loadWorkspaceData()}
        isAuthorizedApprover={isAuthorizedApprover}
      />,
      "Authorization Matrix"
    );
  };

  const getStatusConfig = (status: ApprovalStatus) => {
    switch (status) {
      case ApprovalStatus.APPROVED: return { label: "APPROVED", classes: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800", icon: CheckCircle2 };
      case ApprovalStatus.PENDING: return { label: "PENDING", classes: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800", icon: Clock };
      case ApprovalStatus.REJECTED: return { label: "REJECTED", classes: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800", icon: X };
      case ApprovalStatus.EXPIRED: return { label: "EXPIRED", classes: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700", icon: AlertCircle };
      default: return { label: status, classes: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700", icon: AlertCircle };
    }
  };

  const getActionConfig = (action: CriticalAction) => {
    switch (action) {
      case CriticalAction.PRICE_UPDATE: return { label: "Price Matrix Update", icon: DollarSign, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" };
      case CriticalAction.STOCK_ADJUST: return { label: "Inventory Adjustment", icon: PackageMinus, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-900/30" };
      case CriticalAction.STOCK_TRANSFER: return { label: "Inter-Node Transfer", icon: ClipboardCheck, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" };
      case CriticalAction.VOID_INVOICE: return { label: "Void Invoice", icon: FileMinus, color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30" };
      case CriticalAction.USER_LOCK_UNLOCK: return { label: "Account Lockdown", icon: UserX, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30" };
      case CriticalAction.EMAIL_CHANGE: return { label: "Identity Override", icon: Mail, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30" };
      case CriticalAction.PASSWORD_CHANGE: return { label: "Security Key Reset", icon: KeyRound, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30" };
      default: return { label: action, icon: ShieldAlert, color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-800" };
    }
  };

  /* -------------------------
  Render
  ------------------------- */
  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans relative overflow-hidden transition-colors duration-300">
      {isPending && (
        <div className="absolute inset-0 flex justify-center items-center bg-white/40 dark:bg-slate-950/40 backdrop-blur-sm z-[200]">
          <Loader2 className="w-12 h-12 text-purple-600 dark:text-purple-500 animate-spin" />
        </div>
      )}

      {/* Header */}
      <header className="w-full flex flex-col bg-white dark:bg-slate-900 border-b border-black/[0.04] dark:border-slate-800 shrink-0 sticky top-0 z-[40] transition-colors">
        <div className="w-full flex items-center justify-between px-4 py-2 min-w-0 h-14">
          <div className="min-w-0 flex-1 md:flex-none flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-purple-600 to-indigo-500 rounded-lg shadow-sm">
              <ClipboardCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="truncate text-[16px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight font-mono uppercase">Approvals</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide uppercase">Price updates, adjustments & critical actions</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:relative sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search UUID or Requester..."
                className="bg-slate-100/80 dark:bg-slate-800/80 border-none py-1.5 pl-8 pr-4 text-[11px] font-bold font-mono w-48 md:w-64 rounded-md focus:ring-1 focus:ring-purple-500 transition-all outline-none dark:text-white uppercase"
              />
            </div>
            <button onClick={() => loadWorkspaceData({ page })} disabled={isPending} className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin text-purple-500" : ""}`} />
            </button>
            <button onClick={() => setShowFilters((s) => !s)} className={`p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors ${showFilters ? 'bg-slate-100 dark:bg-slate-800' : ''}`} title="Toggle Filters">
              <Filter className="w-4 h-4" />
            </button>
            <div className="hidden md:flex gap-2 items-center">
              <button onClick={() => exportCSV(false)} className="h-8 px-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-2">
                <Download className="w-3.5 h-3.5" /> Export Audit Log
              </button>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        {showFilters && (
          <div className="w-full px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap gap-3 items-center animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded text-[11px] font-bold py-1 px-2 outline-none focus:ring-1 focus:ring-purple-500 dark:text-white uppercase cursor-pointer">
                <option value="all">ALL STATUSES</option>
                {Object.values(ApprovalStatus).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Action Type</span>
              <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded text-[11px] font-bold py-1 px-2 outline-none focus:ring-1 focus:ring-purple-500 dark:text-white uppercase cursor-pointer">
                <option value="all">ALL ACTIONS</option>
                {Object.values(CriticalAction).map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
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
            <StatCard title="Awaiting Authorization" value={stats.totalPending} icon={Clock} color="purple" />
            <StatCard title="Approved Audits" value={stats.approvedRecently} icon={CheckCircle2} color="emerald" />
            <StatCard title="Rejected / Denied" value={stats.rejectedRecently} icon={X} color="red" />
            <StatCard title="Critical Security Alerts" value={stats.criticalAlerts} icon={ShieldAlert} color="amber" />
          </section>

          {/* Table */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex flex-col min-h-[500px] bg-white dark:bg-slate-900 transition-colors shadow-sm">
            <div className="overflow-x-auto custom-scrollbar flex-1">
              <table className="w-full text-left whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80">
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Protocol Matrix</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Requester / Node</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Payload Trace</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {approvals.length === 0 && !isPending ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-20 text-center text-slate-400 text-[11px] font-bold uppercase tracking-widest">
                        <div className="flex flex-col items-center gap-2">
                          <ClipboardCheck className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                          No authorization records found.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    approvals.map((a) => {
                      const status = getStatusConfig(a.status);
                      const action = getActionConfig(a.actionType);
                      const StatusIcon = status.icon;
                      const ActionIcon = action.icon;

                      return (
                        <tr
                          key={a.id}
                          onClick={() => handleOpenDetailPanel(a)}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group select-none"
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${action.bg}`}>
                                <ActionIcon className={`w-4 h-4 ${action.color}`} />
                              </div>
                              <div>
                                <div className="text-[13px] font-bold text-slate-900 dark:text-white font-mono group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{action.label}</div>
                                <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">REQ: {a.id.slice(-8)}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex flex-col">
                              <span className="text-[13px] font-bold text-slate-700 dark:text-slate-300">{a.requester.name}</span>
                              <span className="text-[9px] text-slate-400 uppercase font-black">{a.branch ? a.branch.name : "GLOBAL NODE"}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md text-slate-700 dark:text-slate-300">
                              {new Date(a.createdAt).toLocaleDateString()}
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

            {/* Pagination Footer */}
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold py-1 px-1.5 outline-none dark:text-white uppercase cursor-pointer">
                  {[25, 50, 100].map((l) => <option key={l} value={l}>{l} Rows</option>)}
                </select>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest hidden sm:inline-block">Total Requests: {total}</span>
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

function StatCard({ title, value, icon: Icon, color }: { title: string, value: number | string, icon: any, color: 'emerald' | 'purple' | 'amber' | 'red' }) {
  const cMap = { emerald: "text-emerald-500", purple: "text-purple-500", amber: "text-amber-500", red: "text-red-500" };
  const bgMap = { emerald: "text-emerald-500/20", purple: "text-purple-500/20", amber: "text-amber-500/20", red: "text-red-500/20" };
  
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

/* -------------------------
Approval Detail Panel
------------------------- */
function ApprovalDetailView({ 
  approval, 
  onClose, 
  onRefresh, 
  isAuthorizedApprover 
}: { 
  approval: IApprovalRequest; 
  onClose: () => void; 
  onRefresh: () => void;
  isAuthorizedApprover: boolean;
}) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();

  const [isProcessing, setIsProcessing] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const isPending = approval.status === ApprovalStatus.PENDING;

  const handleAction = async (action: "APPROVED" | "REJECTED") => {
    if (action === "REJECTED" && !rejectNote) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Missing Input", message: "A rejection note is required for audit logs." });
      return;
    }

    setIsProcessing(true);
    try {
      const payload = {
        status: action,
        rejectionNote: action === "REJECTED" ? rejectNote : null,
      };

      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to process authorization.`);
      }

      dispatch({ kind: "PUSH", type: "SUCCESS", title: "Authorization Logged", message: `Protocol has been ${action.toLowerCase()}.` });
      onRefresh();
      onClose();
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Process Failed", message: err?.message || "Failed to finalize decision." });
    } finally {
      setIsProcessing(false);
    }
  };

  const formattedChanges = useMemo(() => {
    try {
      return JSON.stringify(approval.changes, null, 2);
    } catch {
      return "Unable to parse forensic JSON payload.";
    }
  }, [approval.changes]);

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-2xl relative">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 sticky top-0">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-purple-600" /> Matrix Authorization
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono uppercase">ID: {approval.id}</p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={toggleFullScreen} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors" title="Toggle Fullscreen">
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors" title="Close Panel">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* Requester Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-100 dark:border-slate-700">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <UserCheck className="w-3 h-3" /> Requester Profile
            </h4>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{approval.requester.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{approval.requester.email}</p>
          </div>
          
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-100 dark:border-slate-700 flex flex-col justify-center">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Protocol Trace</h4>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                approval.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                approval.status === 'REJECTED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}>
                {approval.status}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">on {new Date(approval.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Payload / Changes */}
        <div>
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <ClipboardCheck className="w-3 h-3" /> Forensic Payload Details
          </h4>
          <div className="bg-[#1E1E1E] dark:bg-black rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-2 bg-slate-800 dark:bg-slate-900 border-b border-slate-700 flex justify-between">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{approval.actionType.replace(/_/g, ' ')}</span>
              <span className="text-[10px] font-mono text-emerald-400">Verified Struct</span>
            </div>
            <pre className="p-4 text-[12px] font-mono text-slate-300 overflow-x-auto">
              <code>{formattedChanges}</code>
            </pre>
          </div>
        </div>

        {/* Existing Note if Rejected */}
        {approval.status === ApprovalStatus.REJECTED && approval.rejectionNote && (
          <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-lg">
            <h4 className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">Rejection Reason</h4>
            <p className="text-sm text-red-800 dark:text-red-300">{approval.rejectionNote}</p>
          </div>
        )}

        {/* Approver Info if Finished */}
        {approval.approver && (
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-3 rounded border border-slate-100 dark:border-slate-700">
            <ShieldAlert className="w-4 h-4" />
            <span>Authorized by <strong>{approval.approver.name}</strong> on {new Date(approval.updatedAt).toLocaleString()}</span>
          </div>
        )}

        {/* Rejection Input Form (If actively rejecting) */}
        {showRejectInput && isPending && isAuthorizedApprover && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 animate-in slide-in-from-bottom-2">
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">Denial Audit Note</label>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="State the reason for rejecting this protocol..."
              className="w-full min-w-0 border border-slate-200 dark:border-slate-700 rounded-lg text-sm p-3 focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-950 dark:text-white resize-none transition-colors"
              rows={3}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setShowRejectInput(false)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-white uppercase">Cancel</button>
              <button 
                onClick={() => handleAction("REJECTED")} 
                disabled={isProcessing || !rejectNote}
                className="px-4 py-1.5 bg-red-600 text-white rounded font-bold text-xs uppercase disabled:opacity-50 flex items-center gap-2"
              >
                {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Execute Denial
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Footer */}
      {isPending && isAuthorizedApprover && !showRejectInput && (
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 sticky bottom-0">
          <button
            onClick={() => setShowRejectInput(true)}
            disabled={isProcessing}
            className="flex-1 py-2.5 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors disabled:opacity-60"
          >
            Reject Request
          </button>

          <button
            onClick={() => handleAction("APPROVED")}
            disabled={isProcessing}
            className="flex-1 py-2.5 bg-purple-600 text-white hover:bg-purple-700 text-xs font-bold uppercase tracking-wider rounded-lg shadow-sm transition-colors flex justify-center items-center gap-2"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Authorize Matrix
          </button>
        </div>
      )}
    </div>
  );
}