"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import type { Product, ProductTag } from "@/types";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import Summary, { SummaryCard } from "@/components/ui/Summary";

type TagFilter = "ALL" | "LOW_STOCK" | "OUT_OF_STOCK" | "DISCONTINUED" | "HOT";
type SortOrder = "az" | "newest" | "";

interface ProductsResponse {
  data: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalQuantity: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  discontinuedCount: number;
  hotCount: number;
  pendingOrders: number;
}

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(res => res.json() as Promise<ProductsResponse>);

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
    if (filterTag !== "ALL") params.set("tag", filterTag);
    return params.toString();
  }, [page, debouncedSearch, sortOrder, filterTag]);

  const { data, isLoading, mutate } = useSWR<ProductsResponse>(
    `/api/dashboard/products?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  const products = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  /* ================= Summary Cards (API → Props) ================= */
  const summaryCards: SummaryCard[] = [
    { id: "totalQuantity", title: "Total Quantity", value: data?.totalQuantity ?? 0, filter: "ALL" },
    { id: "totalValue", title: "Total Value", value: data?.totalValue ?? 0, filter: "ALL" },
    {
      id: "lowStock",
      title: "Low Stock",
      value: data?.lowStockCount ?? 0,
      filter: "LOW_STOCK",
      color: data && data.lowStockCount > 5 ? "text-red-600" : "text-amber-600",
    },
    {
      id: "outOfStock",
      title: "Out of Stock",
      value: data?.outOfStockCount ?? 0,
      filter: "OUT_OF_STOCK",
      color: "text-red-700",
    },
    {
      id: "discontinued",
      title: "Discontinued",
      value: data?.discontinuedCount ?? 0,
      filter: "DISCONTINUED",
      color: "text-gray-500",
    },
    {
      id: "hotProducts",
      title: "Hot Products",
      value: data?.hotCount ?? 0,
      filter: "HOT",
      color: "text-green-600",
    },
    {
      id: "pendingOrders",
      title: "Pending Orders",
      value: data?.pendingOrders ?? 0,
      filter: "ALL",
      color: "text-blue-600",
    },
  ];

  /* ================= Table Helpers ================= */
  const selectableProductIds = useMemo(
    () => products.filter(p => p.tag !== "OUT_OF_STOCK").map(p => p.id),
    [products]
  );

  const toggleSelect = (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product || product.tag === "OUT_OF_STOCK") return;
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

  const isAllSelected =
    selectableProductIds.length > 0 &&
    selectableProductIds.every(id => selectedIds.has(id));

  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  const stockTextClass = (tag?: ProductTag | null) => {
    if (tag === "OUT_OF_STOCK") return "text-red-700";
    if (tag === "LOW_STOCK") return "text-yellow-700";
    return "text-gray-900";
  };

  const bulkDelete = async () => {
    const idsToDelete = [...selectedIds].filter(id => {
      const product = products.find(p => p.id === id);
      return product && product.tag !== "OUT_OF_STOCK";
    });

    if (!idsToDelete.length) {
      toast.addToast({ type: "info", message: "No deletable products selected" });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      return;
    }

    try {
      const res = await fetch("/api/dashboard/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToDelete }),
      });

      if (!res.ok) throw new Error("Bulk delete failed");

      toast.addToast({ type: "success", message: `${idsToDelete.length} products removed` });
      setSelectedIds(prev => new Set([...prev].filter(id => !idsToDelete.includes(id))));
      setBulkDeleteOpen(false);
      mutate();
    } catch (e) {
      toast.addToast({ type: "error", message: "Bulk delete failed" });
      console.error(e);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await mutate();
    setTimeout(() => setRefreshing(false), 300);
  };

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">
      {/* ================= Summary ================= */}
      <Summary cardsData={summaryCards} />

      {/* ================= Top Bar ================= */}
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
          className={`w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center ${
            refreshing ? "animate-spin" : ""
          }`}
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
          {/* Sort */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="bg-gray-100 p-2 rounded-full h-10 w-10 flex items-center justify-center">
              <i className="bx bx-sort text-lg" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="bg-white shadow rounded-md py-1 min-w-[120px]">
              <DropdownMenu.Item onSelect={() => setSortOrder("az")} className="px-4 py-2 hover:bg-gray-100">
                A → Z
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => setSortOrder("newest")} className="px-4 py-2 hover:bg-gray-100">
                Newest
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => setSortOrder("")} className="px-4 py-2 hover:bg-gray-100">
                Clear
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>

          {/* Filter */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="bg-gray-100 px-3 rounded-full h-10 flex items-center text-sm">
              <i className="bx bx-filter-alt mr-1" /> {filterTag}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="bg-white shadow rounded-md py-1 min-w-[140px]">
              {(["ALL", "LOW_STOCK", "OUT_OF_STOCK", "DISCONTINUED", "HOT"] as TagFilter[]).map(tag => (
                <DropdownMenu.Item
                  key={tag}
                  onSelect={() => setFilterTag(tag)}
                  className="px-4 py-2 hover:bg-gray-100"
                >
                  {tag.replace("_", " ")}
                </DropdownMenu.Item>
              ))}
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

      {/* ================= Product Table ================= */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-y-3 min-w-[700px]">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-20">
            <tr>
              <th className="w-10 p-2">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={el => el && (el.indeterminate = isIndeterminate)}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="sticky left-0 bg-gray-50 p-2 z-30">Product</th>
              <th className="sticky left-[140px] bg-gray-50 p-2 z-30">SKU</th>
              <th className="p-2">Category</th>
              <th className="p-2 text-right">Price</th>
              <th className="p-2 text-right">Stock</th>
              <th className="p-2">Supplier</th>
              <th className="p-2">Last Sold</th>
            </tr>
          </thead>

          <tbody>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading &&
              products.map(p => {
                const isOutOfStock = p.tag === "OUT_OF_STOCK";
                return (
                  <tr
                    key={p.id}
                    className={`bg-white shadow-sm rounded-lg hover:bg-gray-50 ${
                      isOutOfStock ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                    }`}
                    onClick={e => {
                      if ((e.target as HTMLElement).tagName !== "INPUT" && !isOutOfStock) {
                        router.push(`/dashboard/products/${p.id}`);
                      }
                    }}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        disabled={isOutOfStock}
                        onClick={e => e.stopPropagation()}
                        onChange={() => toggleSelect(p.id)}
                      />
                    </td>
                    <td className="p-3 sticky left-0 bg-white font-medium z-20">{p.name}</td>
                    <td className="p-3 sticky left-[140px] bg-white font-mono text-xs z-20">
                      {p.sku}
                    </td>
                    <td className="p-3">{p.category?.name ?? "-"}</td>
                    <td className="p-3 text-right">₦{p.sellingPrice.toLocaleString()}</td>
                    <td className={`p-3 text-right font-semibold ${stockTextClass(p.tag)}`}>
                      {p.stock}
                    </td>
                    <td className="p-3">{p.supplier?.name ?? "-"}</td>
                    <td className="p-3">
                      {p.lastSoldAt ? new Date(p.lastSoldAt).toLocaleDateString() : "-"}
                    </td>
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
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            Prev
          </button>
          <span>
            {page} / {pageCount}
          </span>
          <button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>
            Next
          </button>
        </div>
      </div>

      {/* ================= Bulk Delete ================= */}
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
