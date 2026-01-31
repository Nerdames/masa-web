"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import Summary, { SummaryCard } from "@/components/ui/Summary";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";

import type { InventoryProduct, ProductsResponse } from "@/types";


/* ================= Types ================= */
type SortOrder = "az" | "newest" | "";

/* ================= Fetcher ================= */
const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(res => res.json() as Promise<ProductsResponse>);

/* ================= Skeleton ================= */
const SkeletonRow = () => (
  <tr className="animate-pulse">
    {Array.from({ length: 7 }).map((_, i) => (
      <td key={i} className="p-4 align-top">
        <div className="h-4 w-full bg-gray-200 rounded" />
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [summaryCards, setSummaryCards] = useState<SummaryCard[]>([]);

  const debouncedSearch = useDebounce(search, 400);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sortOrder) params.set("sort", sortOrder);
    return params.toString();
  }, [page, debouncedSearch, sortOrder]);

  const { data, isLoading, mutate } = useSWR<ProductsResponse>(
    `/api/dashboard/products?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  const products: InventoryProduct[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 10;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const defaultSummaryCards: SummaryCard[] = [
    { id: "totalQuantity", title: "Total Quantity", value: data?.totalQuantity ?? 0, filter: "All" },
    { id: "totalValue", title: "Total Value", value: data?.totalValue ?? 0, filter: "All" },
    { id: "lowStock", title: "Low Stock", value: data?.lowStockCount ?? 0, filter: "All", color: data && data.lowStockCount > 5 ? "text-red-600" : "text-amber-600" },
    { id: "outOfStock", title: "Out of Stock", value: data?.outOfStockCount ?? 0, filter: "All", color: "text-red-700" },
    { id: "discontinued", title: "Discontinued", value: data?.discontinuedCount ?? 0, filter: "All", color: "text-gray-500" },
    { id: "hot", title: "Hot Products", value: data?.hotCount ?? 0, filter: "All", color: "text-green-600" },
    { id: "pendingOrders", title: "Pending Orders", value: data?.pendingOrders ?? 0, filter: "All", color: "text-blue-600" },
  ];

  useEffect(() => {
    const savedOrder = localStorage.getItem("inventorySummaryCards");
    if (savedOrder) {
      const ids: string[] = JSON.parse(savedOrder);
      const orderedCards = ids
        .map(id => defaultSummaryCards.find(c => c.id === id))
        .filter(Boolean) as SummaryCard[];
      const remaining = defaultSummaryCards.filter(c => !ids.includes(c.id));
      setSummaryCards([...orderedCards, ...remaining]);
    } else {
      setSummaryCards(defaultSummaryCards);
    }
  }, [data]);

  const handleSummaryOrderChange = (newOrder: SummaryCard[]) => {
    setSummaryCards(newOrder);
    localStorage.setItem("inventorySummaryCards", JSON.stringify(newOrder.map(c => c.id)));
  };

  useEffect(() => setPage(1), [debouncedSearch, sortOrder]);

  const selectableIds = useMemo(() => products.filter(p => p.stock > 0).map(p => p.id), [products]);

  const toggleSelect = (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product || product.stock === 0) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = selectableIds.every(id => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  };

  const isAllSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  const stockTextClass = (stock: number) => {
    if (stock === 0) return "text-red-700";
    if (stock < 5) return "text-yellow-700";
    return "text-gray-900";
  };

  const bulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    try {
      const res = await fetch("/api/dashboard/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error();
      toast.addToast({ type: "success", message: `${ids.length} products removed` });
      setSelectedIds(new Set());
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
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">
      {/* Summary */}
      <Summary cardsData={summaryCards} />

      {/* Top Bar */}
      <div className="sticky top-0 z-40 bg-white p-3 flex flex-wrap items-center gap-2 shadow-sm">
        <input
          type="text"
          placeholder="Search by product"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded-lg p-2 text-sm h-10 min-w-[300px]"
        />
        <button
          onClick={handleRefresh}
          className={`w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center ${refreshing ? "animate-spin" : ""}`}
        >
          <i className="bx bx-refresh text-lg" />
        </button>
        {selectedIds.size > 0 && (
          <button
            onClick={() => setBulkDeleteOpen(true)}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <i className="bx bx-trash-alt text-red-600 text-lg" />
          </button>
        )}
        <div className="ml-auto flex gap-2 items-center">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="bg-gray-100 p-2 rounded-full h-10 w-10 flex items-center justify-center">
              <i className="bx bx-sort text-lg" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="bg-white shadow rounded-md py-1 min-w-[120px]">
              <DropdownMenu.Item onSelect={() => setSortOrder("az")} className="px-4 py-2 hover:bg-gray-100">A → Z</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => setSortOrder("newest")} className="px-4 py-2 hover:bg-gray-100">Newest</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => setSortOrder("")} className="px-4 py-2 hover:bg-gray-100">Clear</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          <button
            onClick={() => router.push("/dashboard/inventory/add")}
            className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"
          >
            <i className="bx bx-plus text-green-600 text-lg" />
          </button>
        </div>
      </div>

      {/* Table with Card-Like Rows */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-sm table-fixed border-separate border-spacing-y-3">
          <thead className="text-xs bg-gray-100 uppercase text-gray-500 text-center">
            <tr>
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={el => { if (el) el.indeterminate = isIndeterminate; }}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="p-4 w-[200px]">Product</th>
              <th className="p-4 w-[140px]">SKU</th>
              <th className="p-4">Category</th>
              <th className="p-4 text-center">Price</th>
              <th className="p-4 text-center">Stock</th>
              <th className="p-4">Supplier</th>
            </tr>
          </thead>

          <tbody>
            {isLoading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading && products.map(p => {
              const isOut = p.stock === 0;
              const isSelected = selectedIds.has(p.id);

              return (
                <tr
                  key={p.id}
                  className={`
                    bg-white rounded-xl shadow-sm transition
                    ${isOut ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-green-50 hover:text-green-700"}
                    ${isSelected ? "bg-green-100 text-green-700" : ""}
                  `}
                  onClick={e => {
                    if ((e.target as HTMLElement).tagName !== "INPUT" && !isOut) {
                      router.push(`/dashboard/products/${p.id}`);
                    }
                  }}
                >
                  <td className="p-4 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isOut}
                      onClick={e => e.stopPropagation()}
                      onChange={() => toggleSelect(p.id)}
                      className="accent-blue-600"
                    />
                  </td>
                  <td className="p-4 text-center font-medium">{p.name}</td>
                  <td className="p-4 text-center font-mono text-xs">{p.sku}</td>
                  <td className="p-4 text-center">{p.category?.name ?? "-"}</td>
                  <td className="p-4 text-center">₦{p.sellingPrice.toLocaleString()}</td>
                  <td className={`p-4 text-center font-semibold ${stockTextClass(p.stock)}`}>{p.stock}</td>
                  <td className="p-4 text-center">{p.supplier?.name ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center text-xs">
        <span>Total: {total}</span>
        <div className="flex gap-2 items-center">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span>{page} / {pageCount}</span>
          <button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>

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
