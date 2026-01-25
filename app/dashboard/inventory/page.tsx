"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import type { Product } from "@/types/product";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";

type TagFilter = "ALL" | "LOW_STOCK" | "OUT_OF_STOCK";
type SortOrder = "az" | "newest" | "";

interface ProductsResponse {
  data: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalQuantity: number;
  totalValue: number;
  lowStockCount: number;
}

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(res => res.json());

const SkeletonRow = () => (
  <tr className="animate-pulse bg-white shadow-sm rounded-lg">
    {Array.from({ length: 8 }).map((_, i) => (
      <td key={i} className="p-3">
        <div className="h-4 bg-gray-200 rounded w-full" />
      </td>
    ))}
  </tr>
);

export default function InventoryPage() {
  const toast = useToast();
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("");
  const [filterTag, setFilterTag] = useState<TagFilter>("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sortOrder) params.set("sort", sortOrder);
    if (filterTag && filterTag !== "ALL") params.set("tag", filterTag);
    return params.toString();
  }, [page, debouncedSearch, sortOrder, filterTag]);

  const { data, isLoading, mutate } = useSWR<ProductsResponse>(
    `/api/dashboard/branches/products?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  const products = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));
  const totalQuantity = data?.totalQuantity ?? 0;
  const totalValue = data?.totalValue ?? 0;
  const lowStockCount = data?.lowStockCount ?? 0;

  const lowStockColorClass =
    lowStockCount === 0 ? "text-green-600" : lowStockCount <= 5 ? "text-amber-600" : "text-red-600";

  const stockTextClass = (tag?: string | null) => {
    if (tag === "OUT_OF_STOCK") return "text-red-700";
    if (tag === "LOW_STOCK") return "text-yellow-700";
    return "text-gray-900";
  };

  // List of IDs that can be deleted (not OUT_OF_STOCK)
  const selectableProductIds = useMemo(
    () => products.filter(p => p.tag !== "OUT_OF_STOCK").map(p => p.id),
    [products]
  );

  const toggleSelect = (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product || product.tag === "OUT_OF_STOCK") return; // cannot select OUT_OF_STOCK
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = selectableProductIds.every(id => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(selectableProductIds));
  };

  // Top checkbox state
  const isAllSelected = selectableProductIds.length > 0 && selectableProductIds.every(id => selectedIds.has(id));
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  const bulkDelete = async () => {
    const idsToDelete = [...selectedIds].filter(id => {
      const product = products.find(p => p.id === id);
      return product && product.tag !== "OUT_OF_STOCK";
    });

    if (idsToDelete.length === 0) {
      toast.addToast({ type: "info", message: "No deletable products selected" });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      return;
    }

    try {
      await Promise.all(idsToDelete.map(id =>
        fetch(`/api/dashboard/products/${id}`, { method: "DELETE" })
      ));
      toast.addToast({ type: "success", message: `${idsToDelete.length} products removed` });

      const remainingSelected = new Set([...selectedIds].filter(id => !idsToDelete.includes(id)));
      setSelectedIds(remainingSelected);
      setBulkDeleteOpen(false);
      mutate();
    } catch {
      toast.addToast({ type: "error", message: "Bulk delete failed" });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await mutate();
    setTimeout(() => setRefreshing(false), 300);
  };

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)]">

      {/* ================= Summary Cards ================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:bg-gray-50"
             onClick={() => setFilterTag("ALL")}>
          <div className="text-sm text-slate-500">Total Quantity</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{totalQuantity}</div>
        </div>

        <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:bg-gray-50"
             onClick={() => setFilterTag("ALL")}>
          <div className="text-sm text-slate-500">Total Value</div>
          <div className="text-xl font-bold text-slate-900 mt-1">₦{totalValue.toFixed(2)}</div>
        </div>

        <div className="relative p-4 bg-white rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:bg-gray-50"
             onClick={() => setFilterTag("LOW_STOCK")}>
          {lowStockCount > 0 && (
            <span
              aria-hidden
              className="absolute top-3 right-3 w-3 h-3 rounded-full bg-red-500 shadow-lg animate-pulse"
            />
          )}
          <div className="text-sm text-slate-500">Low Stock</div>
          <div className={`text-xl font-bold mt-1 ${lowStockColorClass}`}>{lowStockCount}</div>
        </div>
      </div>

      {/* ================= Top Bar ================= */}
      <div className="sticky top-0 z-20 bg-white p-3 flex flex-wrap items-center gap-2 shadow-sm">
        <input
          type="text"
          placeholder="Search by product"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded-lg p-2 text-sm h-10 min-w-[300px]"
        />

        <button
          onClick={handleRefresh}
          className={`w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center transition-transform duration-300 ${refreshing ? "animate-spin" : ""}`}
        >
          <i className="bx bx-refresh text-lg" />
        </button>

        {selectedIds.size > 0 && (
          <button
            onClick={() => setBulkDeleteOpen(true)}
            className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"
          >
            <i className="bx bx-trash-alt text-red-600 text-lg" />
          </button>
        )}

        <div className="ml-auto flex gap-2 items-center">
          {/* Sort Dropdown */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="bg-gray-100 p-2 rounded-full h-10 w-10 flex items-center justify-center">
              <i className="bx bx-sort text-lg" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="bg-white shadow rounded-md py-1 min-w-[120px]">
              <DropdownMenu.Item className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                                 onSelect={() => setSortOrder("az")}>A → Z</DropdownMenu.Item>
              <DropdownMenu.Item className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                                 onSelect={() => setSortOrder("newest")}>Newest</DropdownMenu.Item>
              <DropdownMenu.Item className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                                 onSelect={() => setSortOrder("")}>Clear</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>

          {/* Filter Dropdown */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="bg-gray-100 px-3 rounded-full h-10 flex items-center justify-center text-sm">
              <i className="bx bx-filter-alt mr-1" /> {filterTag === "ALL" ? "Filter" : filterTag.replace("_", " ")}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="bg-white shadow rounded-md py-1 min-w-[140px]">
              {(["ALL","LOW_STOCK","OUT_OF_STOCK"] as TagFilter[]).map(tag => (
                <DropdownMenu.Item key={tag} className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                                   onSelect={() => setFilterTag(tag)}>
                  {tag.replace("_", " ")}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* ================= Table ================= */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-y-3 min-w-[700px]">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-20">
            <tr>
              <th className="w-10 p-2">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={el => {
                    if (el) el.indeterminate = isIndeterminate;
                  }}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="sticky left-0 bg-gray-50 p-2 z-30">Product</th>
              <th className="sticky left-[140px] bg-gray-50 p-2 z-30">SKU</th>
              <th className="p-2 min-w-[120px]">Category</th>
              <th className="p-2 min-w-[100px] text-right">Price</th>
              <th className="p-2 min-w-[100px] text-right">Stock</th>
              <th className="p-2 min-w-[120px]">Supplier</th>
              <th className="p-2 min-w-[150px]">Last Sold</th>
            </tr>
          </thead>

          <tbody>
            {isLoading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading &&
              products.map(p => {
                const isOutOfStock = p.tag === "OUT_OF_STOCK";
                return (
                  <tr key={p.id} className={`bg-white shadow-sm rounded-lg ${isOutOfStock ? "opacity-60" : ""}`}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        disabled={isOutOfStock}
                        onChange={e => { e.stopPropagation(); if (!isOutOfStock) toggleSelect(p.id); }}
                      />
                    </td>
                    <td className="p-3 font-medium truncate sticky left-0 bg-white z-20">{p.name}</td>
                    <td className="p-3 font-mono text-xs sticky left-[140px] bg-white z-20">{p.sku}</td>
                    <td className="p-3 truncate">{p.category?.name ?? "-"}</td>
                    <td className="p-3 text-right">₦{p.sellingPrice.toLocaleString()}</td>
                    <td className={`p-3 text-right font-semibold ${stockTextClass(p.tag)}`}>{p.stock}</td>
                    <td className="p-3">{p.supplier?.name ?? "-"}</td>
                    <td className="p-3">{p.lastSoldAt ? new Date(p.lastSoldAt).toLocaleDateString() : "-"}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* ================= Pagination ================= */}
      <div className="flex justify-between items-center text-xs">
        <span>Total: {total}</span>
        <div className="flex gap-2 items-center">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span>{page} / {pageCount}</span>
          <button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>

      {/* ================= Bulk Delete Modal ================= */}
      {bulkDeleteOpen && (
        <ConfirmModal
          open
          title="Delete Products"
          message={`Remove ${selectedIds.size} selected products?`}
          destructive
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={bulkDelete}
        />
      )}
    </div>
  );
}
