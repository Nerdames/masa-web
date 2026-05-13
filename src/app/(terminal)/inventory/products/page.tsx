"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Search,
  Plus,
  Database,
  RefreshCw,
  Edit3,
  Loader2,
  Filter,
  Download,
  Package,
  Archive,
  BarChart3,
  TrendingUp
} from "lucide-react";
import { saveAs } from "file-saver";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
// Replaced Modal with Panel [cite: 4, 186]
import RegisterProductPanel from "@/modules/inventory/components/RegisterProductPanel";
import ProductDetailPanel from "@/modules/inventory/components/ProductDetailPanel";

/* -------------------------
   Types
   ------------------------- */

interface ICategory {
  id: string;
  name: string;
}

interface IUom {
  id: string;
  name: string;
  abbreviation: string;
}

interface IProduct {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  description?: string | null;
  baseCostPrice: number | string;
  costPrice: number | string;
  currency: string;
  categoryId?: string | null;
  uomId?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  category?: ICategory | null;
  uom?: IUom | null;
  createdBy?: { name: string | null } | null;
  updatedBy?: { name: string | null } | null;
}

interface ProductsResponse {
  items: IProduct[];
  total: number;
  page: number;
  limit: number;
}

const DEFAULT_LIMIT = 25;
const EXPORT_LIMIT = 10000;

/* -------------------------
   Main Component
   ------------------------- */

export default function ProductRegistryWorkspace({ organizationId }: { organizationId: string }) {
  const { dispatch } = useAlerts();
  const { openPanel, closePanel } = useSidePanel();

  const [products, setProducts] = useState<IProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("active");
  const [sort, setSort] = useState<"name_asc" | "name_desc" | "cost_desc" | "createdAt_desc">("name_asc");
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [total, setTotal] = useState(0);

  const [isPending, startTransition] = useTransition();
  const [selectedProduct, setSelectedProduct] = useState<IProduct | null>(null);
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
    exportAll?: boolean;
  }) => {
    const q = new URLSearchParams();
    q.set("page", String(opts?.page ?? page));
    q.set("limit", String(opts?.limit ?? limit));
    if (opts?.search ?? searchTerm) q.set("search", opts?.search ?? searchTerm);
    if (opts?.exportAll) q.set("export", "true");
    return q.toString();
  };

  const loadProducts = useCallback(
    async (opts?: { page?: number; limit?: number; search?: string }) => {
      startTransition(async () => {
        try {
          const q = buildQuery({ page: opts?.page, limit: opts?.limit, search: opts?.search });
          const res = await fetch(`/api/products?${q.toString()}`);
          const data: ProductsResponse | { error?: string } = await res.json();

          if (!res.ok) throw new Error((data as any).error || "Failed to load products");

          setProducts((data as ProductsResponse).items || []);
          setTotal((data as ProductsResponse).total || 0);
          setPage((data as ProductsResponse).page || opts?.page || page);
        } catch (err: any) {
          dispatch({ kind: "TOAST", type: "WARNING", title: "Sync Error", message: err.message || "Failed to load catalog" });
          setProducts([]);
          setTotal(0);
        }
      });
    },
    [dispatch, limit, page, searchTerm]
  );

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, sort, fromDate, toDate, limit]);

  useEffect(() => {
    loadProducts({ page, limit });
  }, [page, limit, loadProducts]);

  const refreshAll = useCallback(() => {
    loadProducts({ page, search: searchTerm });
  }, [loadProducts, page, searchTerm]);

  /* -------------------------
      Archive / Delete Handler
      ------------------------- */

  const handleArchive = async (id: string) => {
    const ok = confirm(
      "Are you sure you want to archive this master product? This action is immutable and will be recorded in the forensic audit log."
    );
    if (!ok) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/products?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { "Accept": "application/json" },
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          dispatch({
            kind: "TOAST",
            type: "SUCCESS",
            title: "Product Archived",
            message: "Master catalog entry archived successfully.",
          });
          setSelectedProduct(null);
          refreshAll();
          return;
        }

        throw new Error(data.error || "Archive failed. See server response.");
      } catch (err: any) {
        dispatch({
          kind: "TOAST",
          type: "WARNING",
          title: "Archive Failed",
          message: err?.message || "Unexpected error occurred.",
        });
      }
    });
  };

  /* -------------------------
      Panel Logic
      ------------------------- */

  const handleOpenRegisterPanel = (product?: IProduct) => {
    openPanel(
      <RegisterProductPanel
        organizationId={organizationId}
        product={product}
        onClose={closePanel}
        onSuccess={() => {
          refreshAll();
          closePanel();
        }}
      />
    );
  };

  const openProductPanel = (product: IProduct) => {
    setSelectedProduct(product);
    openPanel(
      <ProductDetailPanel
        product={product}
        onClose={() => {
          setSelectedProduct(null);
          closePanel();
        }}
        onEdit={() => handleOpenRegisterPanel(product)} // Integrated RegisterProductPanel [cite: 4, 186]
        onArchive={() => handleArchive(product.id)}
      />
    );
  };

  /* -------------------------
      Derived Stats & Filtering
      ------------------------- */

  const stats = useMemo(() => {
    const active = products.filter(p => !p.deletedAt).length;
    const archived = products.filter(p => p.deletedAt).length;
    const totalVal = products.reduce((acc, p) => acc + Number(p.baseCostPrice || 0), 0);
    return { active, archived, totalVal, totalCount: total };
  }, [products, total]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return products.filter((p) => {
      if (term) {
        const inName = p.name.toLowerCase().includes(term);
        const inSku = p.sku.toLowerCase().includes(term);
        const inBarcode = (p.barcode || "").toLowerCase().includes(term);
        if (!inName && !inSku && !inBarcode) return false;
      }
      if (statusFilter !== "all") {
        if (statusFilter === "active" && p.deletedAt) return false;
        if (statusFilter === "archived" && !p.deletedAt) return false;
      }
      if (fromDate) {
        if (new Date(p.createdAt) < new Date(fromDate)) return false;
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setDate(end.getDate() + 1);
        if (new Date(p.createdAt) >= end) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sort === "name_asc") return a.name.localeCompare(b.name);
      if (sort === "name_desc") return b.name.localeCompare(a.name);
      if (sort === "cost_desc") return Number(b.baseCostPrice) - Number(a.baseCostPrice);
      if (sort === "createdAt_desc") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return 0;
    });
  }, [products, searchTerm, statusFilter, sort, fromDate, toDate]);

  /* -------------------------
      Export Logic
      ------------------------- */

  const exportCSV = async (all = false) => {
    try {
      const q = buildQuery({ exportAll: all, limit: all ? EXPORT_LIMIT : limit, page: 1 });
      const res = await fetch(`/api/products?${q}`);
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const items: IProduct[] = data.items || [];

      const header = ["ID", "Name", "SKU", "Barcode", "Category", "UOM", "Base Cost", "Currency", "Status", "Created At"];
      const rows = items.map((it) => [
        it.id,
        it.name,
        it.sku,
        it.barcode || "",
        it.category?.name || "",
        it.uom?.abbreviation || "",
        String(it.baseCostPrice),
        it.currency,
        !it.deletedAt ? "ACTIVE" : "ARCHIVED",
        it.createdAt || "",
      ]);
      const csv = [header.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      saveAs(blob, `product_registry_${new Date().toISOString()}.csv`);
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
          <Loader2 className="w-12 h-12 text-indigo-600 dark:text-indigo-500 animate-spin" />
        </div>
      )}

      <header className="w-full flex flex-col bg-white dark:bg-slate-900 border-b border-black/[0.04] dark:border-slate-800 shrink-0 sticky top-0 z-[30] transition-colors">
        <div className="w-full flex items-center justify-between px-4 py-2 h-14">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-indigo-600 to-blue-500 rounded-lg shadow-sm">
              <Database className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[16px] font-bold tracking-tight text-slate-900 dark:text-white">Product Registry</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter catalog..."
                className="bg-slate-100/80 dark:bg-slate-800/80 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-48 lg:w-64 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none dark:text-white transition-colors"
              />
            </div>

            <button
              onClick={() => loadProducts({ page })}
              disabled={isPending}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin text-indigo-500" : ""}`} />
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
              onClick={() => handleOpenRegisterPanel()} // Replaced Modal Logic [cite: 186]
              className="flex h-8 px-3 bg-indigo-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-indigo-700 transition-all items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Register Product</span>
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
                <option value="cost_desc">Highest Cost</option>
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
              <button onClick={() => exportCSV(true)} className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold uppercase transition-colors">Export All CSV</button>
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col xl:flex-row p-4">
        <main className="flex-1 px-4 lg:px-4 flex flex-col gap-6">
          {/* Stat Cards Section - Consistent with Purchase Orders [cite: 145] */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
            <StatCard title="Total Registry" value={total} icon={Database} color="emerald" />
            <StatCard title="Active Catalog" value={stats.active} icon={Package} color="blue" />
            <StatCard title="Archived Items" value={stats.archived} icon={Archive} color="red" />
            <StatCard title="Registry Value" value={`₦${stats.totalVal.toLocaleString()}`} icon={BarChart3} color="emerald" />
          </section>

          {/* Main Table Container */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex flex-col min-h-[500px] transition-colors bg-white dark:bg-slate-900">
            <div className="overflow-x-auto custom-scrollbar flex-1">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80">
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Catalog Registry</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Classification</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Financials</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Protocol Status</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-20 text-center text-slate-400 text-[11px] font-bold uppercase">
                        No products found in registry.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((product) => (
                      <tr
                        key={product.id}
                        onClick={() => openProductPanel(product)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer select-none"
                      >
                        <td className="px-5 py-3">
                          <div className="text-[13px] font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {product.name}
                          </div>
                          <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 flex gap-2">
                            <span>SKU: {product.sku}</span>
                            {product.barcode && (
                              <>
                                <span className="text-slate-200 dark:text-slate-700">•</span>
                                <span>BC: {product.barcode}</span>
                              </>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-3">
                          <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-tight">
                            {product.category?.name || "Uncategorized"}
                          </div>
                          <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                            UoM: {product.uom?.name || "No Unit"}
                          </div>
                        </td>

                        <td className="px-5 py-3 text-right">
                          <div className="text-[13px] font-bold text-slate-900 dark:text-white">
                            {Number(product.baseCostPrice).toLocaleString()}
                          </div>
                          <div className="text-[9px] text-slate-400 font-bold uppercase">
                            Base Cost ({product.currency})
                          </div>
                        </td>

                        <td className="px-5 py-3 text-center">
                          <div className="flex justify-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${
                                !product.deletedAt
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                                  : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
                              }`}
                            >
                              {!product.deletedAt ? "ACTIVE" : "ARCHIVED"}
                            </span>
                          </div>
                        </td>

                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-1.5 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                            {!product.deletedAt && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenRegisterPanel(product);
                                }}
                                className="p-1.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                title="Update Catalog Entry"
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

            {/* Pagination Footer */}
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold py-1 px-1.5 outline-none dark:text-white cursor-pointer"
                >
                  {[10, 25, 50, 100].map((l) => (
                    <option key={l} value={l}>{l} Rows</option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  Total Records: {total}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-50 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Prev
                </button>
                <div className="px-3 text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                  {page} / {totalPages}
                </div>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-50 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
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

/* -------------------------
Helpers & Subcomponents
------------------------- */

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: "emerald" | "blue" | "red";
}

function StatCard({ title, value, icon: Icon, color }: StatCardProps) {
  const colorMap = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    blue: "text-blue-600 dark:text-blue-400",
    red: "text-red-600 dark:text-red-400"
  };
  const iconColorMap = {
    emerald: "text-emerald-200 dark:text-emerald-900/40",
    blue: "text-blue-200 dark:text-blue-900/40",
    red: "text-red-200 dark:text-red-900/40"
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-4 lg:p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between min-h-[100px] relative overflow-hidden group hover:border-slate-300 dark:hover:border-slate-700 transition-all">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{title}</p>
          <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{value}</h3>
        </div>
        <div className={`p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 ${colorMap[color]}`}>
           <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className={`absolute -right-2 -bottom-2 opacity-[0.03] dark:opacity-[0.05] group-hover:scale-110 transition-transform ${iconColorMap[color]}`}>
        <Icon className="w-16 h-16" />
      </div>
    </div>
  );
}