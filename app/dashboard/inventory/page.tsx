"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import Summary, { SummaryCard } from "@/components/ui/Summary";
import DataTableToolbar from "@/components/ui/DataTableToolbar";
import DataTable, { DataTableColumn } from "@/components/ui/DataTable";
import { useRouter } from "next/navigation";

import type { InventoryProduct, ProductsResponse } from "@/types";

/* ================= Fetcher ================= */
const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(res => res.json() as Promise<ProductsResponse>);

/* ================= Types ================= */
type SortOrder = "az" | "newest" | "";

/* ================= Component ================= */
export default function InventoryPage() {
  const toast = useToast();
  const router = useRouter();

  /* ---------------- State ---------------- */
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  /* ---------------- Data Fetch ---------------- */
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

  /* ---------------- Summary Cards ---------------- */
  const defaultSummaryCards: SummaryCard[] = [
    { id: "totalQuantity", title: "Total Quantity", value: data?.totalQuantity ?? 0 },
    { id: "totalValue", title: "Total Value", value: data?.totalValue ?? 0 },
    { id: "lowStock", title: "Low Stock", value: data?.lowStockCount ?? 0 },
    { id: "outOfStock", title: "Out of Stock", value: data?.outOfStockCount ?? 0 },
    { id: "discontinued", title: "Discontinued", value: data?.discontinuedCount ?? 0 },
    { id: "hot", title: "Hot Products", value: data?.hotCount ?? 0 },
    { id: "pendingOrders", title: "Pending Orders", value: data?.pendingOrders ?? 0 },
  ];

  /* ---------------- Selection ---------------- */
  const selectableIds = useMemo(() => products.filter(p => p.stock > 0).map(p => p.id), [products]);
  const toggleSelect = (id: string) => {
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

  /* ---------------- Actions ---------------- */
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

  /* ---------------- Table Columns ---------------- */
  const columns: DataTableColumn<InventoryProduct>[] = [
    { key: "name", header: "Product", render: p => p.name, align: "left" },
    { key: "sku", header: "SKU", render: p => p.sku, align: "center" },
    { key: "category", header: "Category", render: p => p.category?.name ?? "-", align: "center" },
    { key: "price", header: "Price", render: p => `₦${p.sellingPrice.toLocaleString()}`, align: "center" },
    {
      key: "stock",
      header: "Stock",
      render: p => (
        <span className={p.stock === 0 ? "text-red-700" : p.stock < 5 ? "text-yellow-700" : ""}>
          {p.stock}
        </span>
      ),
      align: "center",
    },
    { key: "supplier", header: "Supplier", render: p => p.supplier?.name ?? "-", align: "center" },
  ];

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">
      {/* Summary */}
      <Summary
        cardsData={defaultSummaryCards}
        pageKey="inventory-summary"
        loading={isLoading}
      />

      {/* Toolbar */}
      <DataTableToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        selectedCount={selectedIds.size}
        onBulkAction={() => setBulkDeleteOpen(true)}
        onAdd={() => router.push("/dashboard/inventory/add")}
      />

      {/* Data Table */}
      <DataTable
        data={products}
        columns={columns}
        selectable
        selectedIds={selectedIds}
        getRowId={p => p.id}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        isAllSelected={isAllSelected}
        isIndeterminate={isIndeterminate}
        loading={isLoading}
      />

      {/* Pagination */}
      <div className="flex justify-between items-center text-xs">
        <span>Total: {total}</span>
        <div className="flex gap-2 items-center">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span>{page} / {pageCount}</span>
          <button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>

      {/* Confirm Bulk Delete */}
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
