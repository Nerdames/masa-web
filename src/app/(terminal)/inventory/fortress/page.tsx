"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Package,
  TrendingDown,
  RefreshCw,
  Loader2,
  Lock,
  Download,
  Filter,
} from "lucide-react";
import { saveAs } from "file-saver";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

/**
 * FortressInventoryWorkspace
 *
 * Updated frontend page aligned with:
 * - Prisma schema (BranchProduct / Product shapes)
 * - Backend route: app/api/inventory/fortress/route.ts
 *
 * Features:
 * - Inventory and Ledger views (type=inventory | ledger)
 * - Meta loads for vendors & categories
 * - Server-side pagination + client-side precise status filtering
 * - Export CSV (single page or full export) guarded by role-based check
 * - Defensive error handling for backend error shape { error: string }
 * - Keeps all original UI/UX and logic, fixes mismatches and aligns query params
 */

/* -------------------------
   Types
   ------------------------- */

type Role = "ADMIN" | "MANAGER" | "SALES" | "INVENTORY" | "CASHIER" | "DEV" | "AUDITOR";
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface IProductRef {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  category?: { id: string; name: string } | null;
  uom?: { id: string; name: string; abbreviation: string } | null;
}

interface IBranchProduct {
  id: string;
  stock: number;
  stockVersion: number;
  reorderLevel: number;
  safetyStock: number;
  sellingPrice: number;
  costPrice: number;
  vendor?: { id: string; name: string } | null;
  product: IProductRef;
  lastSoldAt?: string | null;
  lastRestockedAt?: string | null;
}

interface ILedgerItem {
  id: string;
  action: string;
  description: string;
  severity?: Severity | null;
  createdAt: string;
  actorId?: string | null;
  actorType?: string | null;
  personnelName?: string | null;
  personnelRole?: string | null;
  metadata?: Record<string, any>;
  requestId?: string | null;
}

interface FetchResultInventory {
  items: IBranchProduct[];
  total: number;
  page: number;
  limit: number;
}

interface FetchResultLedger {
  items: ILedgerItem[];
  total: number;
  page: number;
  limit: number;
}

/* -------------------------
   Constants
   ------------------------- */

const DEFAULT_LIMIT = 25;
const EXPORT_LIMIT = 10000;

/* -------------------------
   Component
   ------------------------- */

export default function FortressInventoryWorkspace({ branchId }: { branchId: string }) {
  const router = useRouter();
  const { data: session } = useSession();

  const [viewType, setViewType] = useState<"inventory" | "ledger">("inventory");

  const [inventory, setInventory] = useState<IBranchProduct[]>([]);
  const [ledger, setLedger] = useState<ILedgerItem[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [vendorFilter, setVendorFilter] = useState<string | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "critical" | "reorder" | "optimal">("all");
  const [sort, setSort] = useState<"name" | "stock_asc" | "stock_desc" | "valuation_desc" | "last_sold">("name");

  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [total, setTotal] = useState(0);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const [showFilters, setShowFilters] = useState(false);

  /* -------------------------
     Theme: time-aware dark mode (kept from original)
     ------------------------- */
  useEffect(() => {
    const applyTimeAwareTheme = () => {
      const hour = new Date().getHours();
      if (hour >= 19 || hour < 7) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    };
    applyTimeAwareTheme();
    const themeInterval = setInterval(applyTimeAwareTheme, 60000);
    return () => clearInterval(themeInterval);
  }, []);

  /* -------------------------
     Permission helper (frontend guard)
     - Backend enforces EXPORT permission; frontend uses conservative role check
     - Roles allowed to export: ADMIN, MANAGER, AUDITOR, DEV
     ------------------------- */
  const userRole = (session?.user as any)?.role as Role | undefined;
  const userIsOrgOwner = (session?.user as any)?.isOrgOwner as boolean | undefined;
  const userCanExport = useMemo(() => {
    if (!session?.user) return false;
    if (userIsOrgOwner) return true;
    if (!userRole) return false;
    return ["ADMIN", "MANAGER", "AUDITOR", "DEV"].includes(userRole);
  }, [session]);

  /* -------------------------
     Query builder (now includes type param)
     - Accepts overrides via opts
     ------------------------- */
  const buildQuery = (opts?: {
    page?: number;
    limit?: number;
    search?: string;
    vendor?: string | "all";
    category?: string | "all";
    status?: string | "all";
    sort?: string;
    from?: string | null;
    to?: string | null;
    exportAll?: boolean;
    type?: "inventory" | "ledger";
  }) => {
    const q = new URLSearchParams();
    q.set("branchId", branchId);
    q.set("type", opts?.type ?? viewType);
    q.set("page", String(opts?.page ?? page));
    q.set("limit", String(opts?.limit ?? limit));
    const searchVal = opts?.search ?? searchTerm;
    if (searchVal) q.set("search", searchVal);
    if (opts?.vendor && opts.vendor !== "all") q.set("vendorId", opts.vendor);
    if (opts?.category && opts.category !== "all") q.set("categoryId", opts.category);
    if (opts?.status && opts.status !== "all") q.set("status", opts.status);
    if (opts?.sort ?? sort) q.set("sort", opts?.sort ?? sort);
    if (opts?.from ?? fromDate) q.set("from", opts?.from ?? (fromDate ?? ""));
    if (opts?.to ?? toDate) q.set("to", opts?.to ?? (toDate ?? ""));
    if (opts?.exportAll) q.set("export", "true");
    return q.toString();
  };

  /* -------------------------
     Load meta lists (vendors, categories)
     ------------------------- */
  useEffect(() => {
    if (!branchId) return;
    let mounted = true;
    (async () => {
      try {
        const [vRes, cRes] = await Promise.all([
          fetch(`/api/inventory/fortress?meta=vendors&branchId=${branchId}`),
          fetch(`/api/inventory/fortress?meta=categories&branchId=${branchId}`),
        ]);
        if (!mounted) return;
        if (vRes.ok) {
          const vJson = await vRes.json();
          setVendors(vJson.items || []);
        }
        if (cRes.ok) {
          const cJson = await cRes.json();
          setCategories(cJson.items || []);
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
     Load workspace data (inventory or ledger)
     - Uses buildQuery with type param
     - Handles backend error shape { error: string }
     ------------------------- */
  const loadWorkspaceData = (opts?: { page?: number; limit?: number }) => {
    if (!branchId) return;
    startTransition(async () => {
      setError(null);
      try {
        const q = buildQuery({ page: opts?.page, limit: opts?.limit, type: viewType });
        const res = await fetch(`/api/inventory/fortress?${q}`);
        if (res.status === 403) {
          // backend returns 403 for RBAC
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "ACCESS_DENIED: You are not authorized for this branch.");
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "Sync failure with Fortress vault.");
        }
        const data = await res.json();
        if (viewType === "ledger") {
          const ledgerData: FetchResultLedger = data;
          setLedger(ledgerData.items || []);
          setTotal(ledgerData.total ?? 0);
        } else {
          const invData: FetchResultInventory = data;
          setInventory(invData.items || []);
          setTotal(invData.total ?? 0);
        }
      } catch (err: any) {
        console.error("Fortress Integration Error:", err);
        setError(err?.message || "Failed to sync fortress data.");
      }
    });
  };

  /* -------------------------
     Reset page when filters change
     ------------------------- */
  useEffect(() => {
    setPage(1);
  }, [searchTerm, vendorFilter, categoryFilter, statusFilter, sort, fromDate, toDate, limit, viewType]);

  /* -------------------------
     Fetch when dependencies change
     ------------------------- */
  useEffect(() => {
    loadWorkspaceData({ page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, page, limit, searchTerm, vendorFilter, categoryFilter, statusFilter, sort, fromDate, toDate, viewType]);

  /* -------------------------
     Stats (inventory only)
     - Keep same client-side precise status logic
     ------------------------- */
  const stats = useMemo(() => {
    if (viewType === "ledger") {
      return {
        totalItems: ledger.length,
        criticalStock: 0,
        lowStock: 0,
        assetValuation: 0,
      };
    }
    const totalItems = inventory.length;
    const criticalStock = inventory.filter((i) => i.stock <= (i.safetyStock ?? 0)).length;
    const lowStock = inventory.filter((i) => i.stock > (i.safetyStock ?? 0) && i.stock <= (i.reorderLevel ?? 0)).length;
    const assetValuation = inventory.reduce((acc, curr) => acc + (curr.stock * (Number(curr.costPrice) || 0)), 0);
    return { totalItems, criticalStock, lowStock, assetValuation };
  }, [inventory, ledger, viewType]);

  /* -------------------------
     Client-side filtered inventory (precise status)
     ------------------------- */
  const filteredInventory = useMemo(() => {
    if (viewType === "ledger") return [];
    const term = searchTerm.trim().toLowerCase();
    return inventory
      .filter((item) => {
        if (vendorFilter !== "all" && item.vendor?.id !== vendorFilter) return false;
        if (categoryFilter !== "all" && item.product.category?.id !== categoryFilter) return false;
        if (term) {
          const inSku = item.product.sku?.toLowerCase().includes(term);
          const inName = item.product.name?.toLowerCase().includes(term);
          const inCat = (item.product.category?.name || "").toLowerCase().includes(term);
          if (!inSku && !inName && !inCat) return false;
        }
        if (statusFilter !== "all") {
          if (statusFilter === "critical" && !(item.stock <= (item.safetyStock ?? 0))) return false;
          if (statusFilter === "reorder" && !(item.stock > (item.safetyStock ?? 0) && item.stock <= (item.reorderLevel ?? 0))) return false;
          if (statusFilter === "optimal" && !(item.stock > (item.reorderLevel ?? 0))) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === "name") return a.product.name.localeCompare(b.product.name);
        if (sort === "stock_asc") return a.stock - b.stock;
        if (sort === "stock_desc") return b.stock - a.stock;
        if (sort === "valuation_desc") return (b.stock * Number(b.costPrice || 0)) - (a.stock * Number(a.costPrice || 0));
        if (sort === "last_sold") {
          const da = a.lastSoldAt ? new Date(a.lastSoldAt).getTime() : 0;
          const db = b.lastSoldAt ? new Date(b.lastSoldAt).getTime() : 0;
          return db - da;
        }
        return 0;
      });
  }, [inventory, searchTerm, vendorFilter, categoryFilter, statusFilter, sort, viewType]);

  /* -------------------------
     Status config helper (keeps original styling)
     ------------------------- */
  const getStatusConfig = (stock: number, reorder: number, safety: number) => {
    if (stock <= safety)
      return {
        label: "CRITICAL",
        classes:
          "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
        icon: AlertTriangle,
      };
    if (stock <= reorder)
      return {
        label: "REORDER",
        classes:
          "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
        icon: TrendingDown,
      };
    return {
      label: "OPTIMAL",
      classes:
        "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
      icon: CheckCircle2,
    };
  };

  /* -------------------------
     Export CSV (inventory or ledger)
     - For ledger export, we export ledger columns
     - Backend enforces export permission; frontend hides button if not allowed
     ------------------------- */
  const exportCSV = async (all = false) => {
    try {
      // If user tries to export all but frontend guard denies, stop early
      if (all && !userCanExport) {
        setError("You do not have permission to export all data.");
        return;
      }

      const q = buildQuery({
        exportAll: all,
        limit: all ? EXPORT_LIMIT : limit,
        page: 1,
        type: viewType,
      });

      const res = await fetch(`/api/inventory/fortress?${q}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Export failed");
      }
      const data = await res.json();

      if (viewType === "ledger") {
        const items: ILedgerItem[] = data.items || [];
        const header = ["id", "action", "description", "severity", "personnelName", "personnelRole", "createdAt", "requestId"];
        const rows = items.map((it) => [
          it.id,
          it.action,
          it.description || "",
          it.severity || "",
          it.personnelName || "",
          it.personnelRole || "",
          it.createdAt || "",
          it.requestId || "",
        ]);
        const csv = [header.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        saveAs(blob, `fortress_ledger_${new Date().toISOString()}.csv`);
      } else {
        const items: IBranchProduct[] = data.items || [];
        const header = [
          "id",
          "sku",
          "name",
          "category",
          "uom",
          "stock",
          "stockVersion",
          "reorderLevel",
          "safetyStock",
          "sellingPrice",
          "costPrice",
          "vendor",
          "lastSoldAt",
          "lastRestockedAt",
        ];
        const rows = items.map((it) => [
          it.id,
          it.product.sku,
          it.product.name,
          it.product.category?.name || "",
          it.product.uom?.abbreviation || "",
          String(it.stock),
          String(it.stockVersion),
          String(it.reorderLevel),
          String(it.safetyStock ?? ""),
          String(it.sellingPrice ?? ""),
          String(it.costPrice ?? ""),
          it.vendor?.name || "",
          it.lastSoldAt || "",
          it.lastRestockedAt || "",
        ]);
        const csv = [header.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        saveAs(blob, `fortress_inventory_${new Date().toISOString()}.csv`);
      }
    } catch (e: any) {
      setError(e?.message || "Export error");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  /* -------------------------
     Render
     ------------------------- */
  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans relative overflow-hidden transition-colors duration-300">
      {isPending && (
        <div className="absolute inset-0 flex flex-col justify-center items-center bg-white/60 dark:bg-slate-950/60 backdrop-blur-[2px] z-[200]">
          <Loader2 className="w-10 h-10 text-blue-600 dark:text-blue-500 animate-spin" />
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mt-3">Synchronizing Inventory...</span>
        </div>
      )}

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
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide">End-to-End Forensic Traceability</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:relative sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={viewType === "ledger" ? "Search ledger (action, description)..." : "SKU_REGISTRY_SEARCH..."}
                className="bg-slate-100/80 dark:bg-slate-800/80 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-48 md:w-64 rounded-md focus:ring-1 focus:ring-blue-500 transition-all outline-none dark:text-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setViewType("inventory");
                }}
                className={`px-2 py-1 rounded-md text-[11px] font-bold ${viewType === "inventory" ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"}`}
              >
                Inventory
              </button>
              <button
                onClick={() => {
                  setViewType("ledger");
                }}
                className={`px-2 py-1 rounded-md text-[11px] font-bold ${viewType === "ledger" ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"}`}
              >
                Ledger
              </button>
            </div>

            <button
              onClick={() => loadWorkspaceData({ page })}
              disabled={isPending}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors flex items-center justify-center disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin text-blue-500" : ""}`} />
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
              onClick={() => router.push("/inventory/purchase-orders")}
              className="hidden md:flex h-8 px-3 bg-blue-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-blue-700 transition-all items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Provision</span>
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="w-full px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap gap-3 items-center">
            {viewType === "inventory" ? (
              <>
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
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 text-sm outline-none">
                    <option value="all">All Statuses</option>
                    <option value="critical">Critical</option>
                    <option value="reorder">Reorder</option>
                    <option value="optimal">Optimal</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400">Sort</label>
                  <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 text-sm outline-none">
                    <option value="name">Name</option>
                    <option value="stock_desc">Stock (High → Low)</option>
                    <option value="stock_asc">Stock (Low → High)</option>
                    <option value="valuation_desc">Valuation (High → Low)</option>
                    <option value="last_sold">Last Sold</option>
                  </select>
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
              <button
                onClick={() => exportCSV(true)}
                disabled={!userCanExport}
                className={`px-3 py-1 rounded-md ${userCanExport ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed" } text-[11px] font-bold uppercase transition-colors`}
              >
                Export All CSV
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar pb-12">
        {error && (
          <div className="mx-4 lg:mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-lg flex items-center gap-3 text-red-600 dark:text-red-400">
            <Lock className="w-4 h-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">{error}</span>
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4 lg:px-6 py-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between shadow-sm transition-colors">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Active SKUs</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalItems}</h3>
              <Package className="w-5 h-5 text-slate-300 dark:text-slate-600" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between shadow-sm transition-colors">
            <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Asset Valuation</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white"><span className="text-sm text-slate-400 dark:text-slate-500 font-medium mr-1">₦</span>{stats.assetValuation.toLocaleString()}</h3>
              <CheckCircle2 className="w-5 h-5 text-blue-200 dark:text-blue-900/50" />
            </div>
          </div>

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

        <main className="px-4 lg:px-6 flex flex-col xl:flex-row gap-6 relative">
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex flex-col min-h-[500px] transition-colors">
            <div className="overflow-x-auto custom-scrollbar flex-1">
              {viewType === "ledger" ? (
                /* Ledger table */
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50">
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Action</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Description</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Severity</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actor</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                    {ledger.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                        <td className="px-5 py-3">
                          <div className="text-[13px] font-bold text-slate-900 dark:text-white">{log.action}</div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{log.description}</div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{log.severity || "INFO"}</div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{log.personnelName || "System"} {log.personnelRole ? `(${log.personnelRole})` : ""}</div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{new Date(log.createdAt).toLocaleString()}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                /* Inventory table (original, aligned) */
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50">
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Product Registry</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Pricing (₦)</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Ledger Stock</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">System Health</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                    {filteredInventory.map((item) => {
                      const status = getStatusConfig(item.stock, item.reorderLevel, item.safetyStock ?? 0);
                      const StatusIcon = status.icon;
                      return (
                        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div>
                                <div className="text-[13px] font-bold text-slate-900 dark:text-white">{item.product.name}</div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                                  {item.product.sku}
                                  <span className="inline-block w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                                  v{item.stockVersion}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-3">
                            <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wide">
                              {item.product.category?.name || "UNGROUPED"}
                            </span>
                          </td>

                          <td className="px-5 py-3 text-right">
                            <div className="text-[13px] font-bold text-slate-900 dark:text-white">{Number(item.sellingPrice || 0).toLocaleString()}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">Cost: {Number(item.costPrice || 0).toLocaleString()}</div>
                          </td>

                          <td className="px-5 py-3 text-right">
                            <div className="flex items-baseline justify-end gap-1">
                              <span className="text-[14px] font-bold text-slate-900 dark:text-white">{item.stock}</span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">{item.product.uom?.abbreviation || "unit"}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Min: {item.safetyStock ?? 0} | Re: {item.reorderLevel}
                            </div>
                          </td>

                          <td className="px-5 py-3 text-center">
                            <div className="flex justify-center">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-bold tracking-widest border ${status.classes}`}>
                                <StatusIcon className="w-3 h-3" />
                                {status.label}
                              </span>
                            </div>
                          </td>

                          <td className="px-5 py-3 text-right">
                            <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button className="p-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 transition-colors">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button className="p-1.5 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 border border-slate-200 dark:border-slate-700 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
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
    </div>
  );
}
