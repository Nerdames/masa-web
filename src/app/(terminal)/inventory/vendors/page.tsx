"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Search,
  Plus,
  Users,
  Phone,
  Mail,
  CheckCircle2,
  RefreshCw,
  Edit3,
  Loader2,
  Package,
  Filter,
  Download,
} from "lucide-react";
import { saveAs } from "file-saver";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { VendorDetailPanel } from "@/modules/inventory/components/VendorDetailPanel";
import { CreateEditVendorModal } from "@/modules/inventory/components/CreateEditVendorModal";

/**
 * VendorsWorkspace (Production-ready)
 */

/* -------------------------
  Types
------------------------- */

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface IVendorPO {
  id: string;
  poNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
}

interface IVendorGRN {
  id: string;
  grnNumber: string;
  createdAt: string;
}

interface IVendor {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  _count?: { purchaseOrders: number; grns: number };
  performanceScore?: number;
  totalRevenue?: number;
  salesVelocity?: number;
  productsSupplied?: number;
  totalStockValue?: number;
  // Included provisions for the updated VendorDetailPanel
  purchaseOrders?: IVendorPO[];
  grns?: IVendorGRN[];
}

interface IActivityLog {
  id: string;
  action: string;
  actorRole?: string | null;
  createdAt: string;
  severity: Severity;
  description: string;
  requestId?: string | null;
  previousHash?: string | null;
  hash?: string | null;
}

interface VendorsResponse {
  summary: { totalVendors: number; totalRevenue: number };
  leaders: { topVendor: IVendor | null; fastestVendor: IVendor | null; bestOverall: IVendor | null };
  vendors: IVendor[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

const DEFAULT_LIMIT = 25;
const EXPORT_LIMIT = 10000;

/* -------------------------
  Main Component
------------------------- */

export default function VendorsWorkspace({ organizationId }: { organizationId: string }) {
  const { dispatch } = useAlerts();
  const { openPanel, closePanel } = useSidePanel();

  const [vendors, setVendors] = useState<IVendor[]>([]);
  const [logs, setLogs] = useState<IActivityLog[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");
  const [sort, setSort] = useState<"name_asc" | "name_desc" | "orders_desc" | "createdAt_desc">("name_asc");
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [pagination, setPagination] = useState<{ total: number; page: number; limit: number; totalPages: number } | null>(null);
  const [total, setTotal] = useState(0);

  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<IVendor | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<IVendor | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Time-aware theme
  useEffect(() => {
    const applyTheme = () => {
      const hour = new Date().getHours();
      const isNight = hour >= 19 || hour < 7;
      if (isNight) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    };
    applyTheme();
    const id = setInterval(applyTheme, 60000);
    return () => clearInterval(id);
  }, []);

  /* -------------------------
    Data Loaders
  ------------------------- */

  const buildQuery = (opts?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string | "all";
    sort?: string;
    from?: string | null;
    to?: string | null;
    exportAll?: boolean;
  }) => {
    const q = new URLSearchParams();
    q.set("page", String(opts?.page ?? page));
    q.set("limit", String(opts?.limit ?? limit));
    if (opts?.search ?? searchTerm) q.set("search", opts?.search ?? searchTerm);
    if (opts?.status && opts.status !== "all") q.set("status", opts.status);
    if (opts?.sort ?? sort) q.set("sort", opts?.sort ?? sort);
    if (opts?.from ?? fromDate) q.set("from", opts?.from ?? (fromDate ?? ""));
    if (opts?.to ?? toDate) q.set("to", opts?.to ?? (toDate ?? ""));
    if (opts?.exportAll) q.set("export", "true");
    return q.toString();
  };

  const loadVendors = useCallback(
    async (opts?: { page?: number; limit?: number; search?: string }) => {
      startTransition(async () => {
        try {
          const q = buildQuery({ page: opts?.page, limit: opts?.limit, search: opts?.search });
          const res = await fetch(`/api/vendors?${q.toString()}`);
          const data: VendorsResponse | { error?: string } = await res.json();
          if (!res.ok) throw new Error((data as any).error || "Failed to load vendors");

          setVendors((data as VendorsResponse).vendors || []);
          setPagination((data as VendorsResponse).pagination || null);
          setTotal((data as VendorsResponse).pagination?.total || 0);
          setPage((data as VendorsResponse).pagination?.page || opts?.page || page);
        } catch (err: any) {
          dispatch({ kind: "TOAST", type: "WARNING", title: "Sync Error", message: err.message || "Failed to load vendors" });
          setVendors([]);
          setPagination(null);
          setTotal(0);
        }
      });
    },
    [dispatch, limit, page, searchTerm, statusFilter, sort, fromDate, toDate]
  );

  const loadLogs = useCallback(async () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/logs?resource=VENDOR&limit=20`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load logs");
        setLogs(data.logs || []);
      } catch (err: any) {
        console.error("Audit retrieval failed:", err);
        setLogs([]);
      }
    });
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, sort, fromDate, toDate, limit]);

  useEffect(() => {
    loadVendors({ page, limit });
  }, [page, limit, searchTerm, statusFilter, sort, fromDate, toDate]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const refreshAll = useCallback(() => {
    loadVendors({ page, search: searchTerm });
    loadLogs();
  }, [loadVendors, loadLogs, page, searchTerm]);

  /* -------------------------
    Archive / Delete Handler
  ------------------------- */

  // Refactored to return a Promise so the VendorDetailPanel can await the resolution
  // and handle its own local loading/toast states properly.
  const handleArchive = async (id: string, force = false): Promise<void> => {
    const res = await fetch(`/api/vendors?id=${encodeURIComponent(id)}${force ? '&force=true' : ''}`, {
      method: "DELETE",
      headers: { "Accept": "application/json" },
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      setSelectedVendor(null);
      refreshAll();
      closePanel(); // Auto-close the panel on successful archive
      return;
    }

    const blockedMessage = data?.error || "Archive failed. See server response.";
    const isActiveProductsBlock = res.status === 400 && /Cannot archive vendor with active products/i.test(blockedMessage);

    if (isActiveProductsBlock) {
      const forceConfirm = confirm(
        "This vendor has active product links. " +
        "If you proceed with force, the system will detach the vendor from related products (vendorId will be set to null) and then archive the vendor. " +
        "Inventory records will be preserved. Do you want to force archive?"
      );

      if (!forceConfirm) {
        throw new Error("Archive aborted by user. Detach required to proceed.");
      }

      // Recursively attempt with force flag
      return handleArchive(id, true);
    }

    throw new Error(blockedMessage);
  };

  /* -------------------------
    Side panel opener 
  ------------------------- */

  const openVendorPanel = (vendor: IVendor) => {
    setSelectedVendor(vendor);
    openPanel(
      <VendorDetailPanel
        vendor={vendor}
        onClose={() => {
          setSelectedVendor(null);
          closePanel();
        }}
        onEdit={() => {
          setEditingVendor(vendor);
          setIsModalOpen(true);
        }}
        onArchive={() => handleArchive(vendor.id)}
      />
    );
  };

  /* -------------------------
    Derived Stats & Filtering
  ------------------------- */

  const stats = useMemo(() => {
    const active = vendors.filter((v) => !v.deletedAt).length;
    const totalOrders = vendors.reduce((acc, v) => acc + (v._count?.purchaseOrders || 0), 0);
    const topVendor = [...vendors].sort((a, b) => (b._count?.purchaseOrders || 0) - (a._count?.purchaseOrders || 0))[0];
    return { active, totalOrders, topVendorName: topVendor?.name || "N/A" };
  }, [vendors]);

  const filteredVendors = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return vendors.filter((v) => {
      if (term) {
        const inName = v.name.toLowerCase().includes(term);
        const inEmail = (v.email || "").toLowerCase().includes(term);
        const inPhone = (v.phone || "").toLowerCase().includes(term);
        if (!inName && !inEmail && !inPhone) return false;
      }
      if (statusFilter !== "all") {
        if (statusFilter === "active" && v.deletedAt) return false;
        if (statusFilter === "archived" && !v.deletedAt) return false;
      }
      if (fromDate) {
        if (new Date(v.createdAt) < new Date(fromDate)) return false;
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setDate(end.getDate() + 1);
        if (new Date(v.createdAt) >= end) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sort === "name_asc") return a.name.localeCompare(b.name);
      if (sort === "name_desc") return b.name.localeCompare(a.name);
      if (sort === "orders_desc") return (b._count?.purchaseOrders || 0) - (a._count?.purchaseOrders || 0);
      if (sort === "createdAt_desc") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return 0;
    });
  }, [vendors, searchTerm, statusFilter, sort, fromDate, toDate]);

  /* -------------------------
    Export Logic
  ------------------------- */

  const exportCSV = async (all = false) => {
    try {
      const q = buildQuery({ exportAll: all, limit: all ? EXPORT_LIMIT : limit, page: 1 });
      const res = await fetch(`/api/vendors?${q}`);
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const items: IVendor[] = data.vendors || [];
      const header = ["id", "name", "email", "phone", "address", "status", "purchaseOrders", "grns", "createdAt"];
      const rows = items.map((it) => [
        it.id,
        it.name,
        it.email || "",
        it.phone || "",
        it.address || "",
        !it.deletedAt ? "ACTIVE" : "ARCHIVED",
        String(it._count?.purchaseOrders || 0),
        String(it._count?.grns || 0),
        it.createdAt || "",
      ]);
      const csv = [header.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      saveAs(blob, `vendors_directory_${new Date().toISOString()}.csv`);
    } catch (e: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Export Error", message: e.message || "Export error" });
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

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

      <header className="w-full flex flex-col bg-white dark:bg-slate-900 border-b border-black/[0.04] dark:border-slate-800 shrink-0 sticky top-0 z-[30] transition-colors">
        <div className="w-full flex items-center justify-between px-4 py-2 h-14">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-emerald-600 to-teal-500 rounded-lg shadow-sm">
              <Users className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[16px] font-bold tracking-tight text-slate-900 dark:text-white">Vendor Directory</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter nodes..."
                className="bg-slate-100/80 dark:bg-slate-800/80 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-48 lg:w-64 rounded-md focus:ring-1 focus:ring-emerald-500 outline-none dark:text-white transition-colors"
              />
            </div>

            <button
              onClick={() => loadVendors({ page })}
              disabled={isPending}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin text-emerald-500" : ""}`} />
            </button>

            <button
              onClick={() => setShowFilters((s) => !s)}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors flex items-center justify-center"
            >
              <Filter className="w-4 h-4" />
            </button>

            <div className="hidden md:flex gap-2 items-center">
              <button
                onClick={() => exportCSV(false)}
                className="h-8 px-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>

            <button
              onClick={() => {
                setEditingVendor(null);
                setIsModalOpen(true);
              }}
              className="flex h-8 px-3 bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-emerald-700 transition-all items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Register Node</span>
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="w-full px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-500 dark:text-slate-400">Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 text-sm outline-none">
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-500 dark:text-slate-400">Sort</label>
              <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 text-sm outline-none">
                <option value="name_asc">Name (A-Z)</option>
                <option value="name_desc">Name (Z-A)</option>
                <option value="orders_desc">Orders (High → Low)</option>
                <option value="createdAt_desc">Newest First</option>
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

            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => exportCSV(true)} className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold uppercase transition-colors">Export All CSV</button>
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col xl:flex-row pb-12">
        <main className="flex-1 px-4 lg:px-6 flex flex-col gap-6">
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <StatCard title="Total Registered" value={String(stats.active)} icon={Users} color="emerald" />
            <StatCard title="Active Commitments" value={String(stats.totalOrders)} sub="Aggregated PO Volume" icon={Package} color="blue" />
            <StatCard title="Prime Supplier" value={stats.topVendorName} icon={CheckCircle2} color="amber" />
          </section>

          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex flex-col min-h-[500px] transition-colors">
            <div className="overflow-x-auto custom-scrollbar flex-1">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80">
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Node / ID</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Communication</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Flow Data</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredVendors.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-20 text-center text-slate-400 text-[11px] font-bold uppercase">
                        No records found within directory.
                      </td>
                    </tr>
                  ) : (
                    filteredVendors.map((vendor) => (
                      <tr
                        key={vendor.id}
                        onClick={() => openVendorPanel(vendor)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer"
                      >
                        <td className="px-5 py-3">
                          <div className="flex flex-col">
                            <span className="text-[13px] font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                              {vendor.name}
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono mt-0.5 uppercase tracking-tighter">
                              {vendor.id}
                            </span>
                          </div>
                        </td>

                        <td className="px-5 py-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                              <Mail className="w-3 h-3 text-slate-400" /> {vendor.email || "—"}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                              <Phone className="w-3 h-3 text-slate-400" /> {vendor.phone || "—"}
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-3">
                          <div className="flex justify-center gap-4">
                            <div className="flex flex-col items-center">
                              <span className="text-[11px] font-bold text-slate-900 dark:text-white">
                                {vendor._count?.purchaseOrders}
                              </span>
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Orders</span>
                            </div>
                            <div className="flex flex-col items-center">
                              <span className="text-[11px] font-bold text-slate-900 dark:text-white">
                                {vendor._count?.grns}
                              </span>
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">GRNs</span>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-widest border ${
                              !vendor.deletedAt
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                                : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
                            }`}
                          >
                            {!vendor.deletedAt ? "ACTIVE" : "ARCHIVED"}
                          </span>
                        </td>

                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-1.5 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                            {!vendor.deletedAt && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingVendor(vendor);
                                  setIsModalOpen(true);
                                }}
                                className="p-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 transition-colors"
                                title="Update Profile"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between sticky bottom-0 bg-white dark:bg-slate-900">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Showing <strong>{Math.min((page - 1) * limit + 1, total || 0)}</strong> - <strong>{Math.min(page * limit, total || 0)}</strong> of <strong>{total}</strong>
              </div>
              <div className="flex items-center gap-3">
                <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs outline-none">
                  <option value={10}>10 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                </select>

                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-bold disabled:opacity-50">Prev</button>
                  <div className="px-3 text-xs font-mono">{page} / {totalPages}</div>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-bold disabled:opacity-50">Next</button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {isModalOpen && (
        <CreateEditVendorModal
          vendor={editingVendor}
          organizationId={organizationId}
          onClose={() => {
            setIsModalOpen(false);
            setEditingVendor(null);
          }}
          onRefresh={() => {
            refreshAll();
          }}
        />
      )}
    </div>
  );
}

/* -------------------------
  Subcomponents
------------------------- */

function StatCard({ title, value, sub, icon: Icon, color }: any) {
  const colorMap: any = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    blue: "text-blue-600 dark:text-blue-400",
    amber: "text-amber-600 dark:text-amber-400",
  };

  const iconColorMap: any = {
    emerald: "text-emerald-200 dark:text-emerald-900/50",
    blue: "text-blue-200 dark:text-blue-900/50",
    amber: "text-amber-200 dark:text-amber-900/50",
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-colors">
      <p className={`text-[10px] font-bold uppercase tracking-wider ${colorMap[color] || "text-slate-500 dark:text-slate-400"}`}>
        {title}
      </p>

      <div className="flex items-end justify-between mt-2">
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
          {value}
        </h3>
        <Icon className={`w-5 h-5 ${iconColorMap[color] || "text-slate-300 dark:text-slate-600"}`} />
      </div>

      {sub && (
        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">
          {sub}
        </span>
      )}
    </div>
  );
}