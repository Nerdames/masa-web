"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import { Tooltip } from "@/components/feedback/Tooltip";
import ConfirmModal from "@/components/modal/ConfirmModal";
import type { Product } from "@/types/product";

type TagFilter = "ALL" | "LOW_STOCK" | "OUT_OF_STOCK";

interface ProductsResponse {
  data: Product[];
  total: number;
  page: number;
  pageSize: number;
}

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(res => res.json());

/* ---------------- Skeleton Row ---------------- */
const SkeletonRow = () => (
  <tr className="animate-pulse">
    {Array.from({ length: 6 }).map((_, i) => (
      <td key={i} className="p-3">
        <div className="h-4 bg-gray-200 rounded w-full" />
      </td>
    ))}
  </tr>
);

export default function InventoryPage() {
  const toast = useToast();

  /* ---------------- State ---------------- */
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<TagFilter>("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkTag, setBulkTag] = useState<TagFilter>("LOW_STOCK");

  const debouncedSearch = useDebounce(search, 400);

  /* ---------------- Query ---------------- */
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (tagFilter !== "ALL") params.set("tag", tagFilter);
    return params.toString();
  }, [page, debouncedSearch, tagFilter]);

  const { data, isLoading, mutate } = useSWR<ProductsResponse>(
    `/api/dashboard/branches/products?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  const products = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  /* ---------------- Selection ---------------- */
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map(p => p.id)));
    }
  };

  /* ---------------- Actions ---------------- */
  const bulkDelete = async () => {
    try {
      await Promise.all(
        [...selectedIds].map(id =>
          fetch(`/api/dashboard/products/${id}`, { method: "DELETE" })
        )
      );
      toast.addToast({ type: "success", message: "Products removed from inventory" });
      setSelectedIds(new Set());
      mutate();
    } catch {
      toast.addToast({ type: "error", message: "Bulk delete failed" });
    }
  };

  const bulkEditTag = async () => {
    try {
      await Promise.all(
        [...selectedIds].map(id =>
          fetch(`/api/dashboard/products/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tag: bulkTag }),
          })
        )
      );
      toast.addToast({ type: "success", message: "Stock tags updated" });
      setSelectedIds(new Set());
      mutate();
    } catch {
      toast.addToast({ type: "error", message: "Bulk update failed" });
    }
  };

  /* ---------------- Stock Color ---------------- */
  const stockTextClass = (tag: string | null | undefined) => {
    if (tag === "OUT_OF_STOCK") return "text-red-700";
    if (tag === "LOW_STOCK") return "text-yellow-700";
    return "text-gray-900";
  };

  /* ---------------- Render ---------------- */
  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)]">
      {/* ================= Top Bar ================= */}
      <div className="sticky top-0 z-20 bg-white flex justify-between items-center gap-4 p-2">
        {/* Left: Filters + Actions */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-gray-100 h-10 overflow-hidden">
            {(["ALL", "LOW_STOCK", "OUT_OF_STOCK"] as const).map(ft => (
              <button
                key={ft}
                onClick={() => setTagFilter(ft)}
                className={`px-4 text-sm font-medium transition-colors
                  ${tagFilter === ft ? "bg-blue-500 text-white" : "text-gray-700"}
                `}
              >
                {ft === "ALL" ? "All" : ft === "LOW_STOCK" ? "Low Stock" : "Out of Stock"}
              </button>
            ))}
          </div>

          <Tooltip content="Refresh">
            <button
              onClick={() => mutate()}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 active:scale-95 transition"
            >
              <i className="bx bx-refresh text-lg" />
            </button>
          </Tooltip>

          {selectedIds.size > 0 && (
            <>
              <Tooltip content="Edit Stock Tag">
                <button
                  onClick={() => setBulkEditOpen(true)}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 active:scale-95 transition"
                >
                  <i className="bx bx-edit-alt text-lg" />
                </button>
              </Tooltip>

              <Tooltip content="Delete">
                <button
                  onClick={() => setBulkDeleteOpen(true)}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 active:scale-95 transition text-red-600"
                >
                  <i className="bx bx-trash text-lg" />
                </button>
              </Tooltip>

              <span className="ml-1 text-xs text-gray-500">
                {selectedIds.size} selected
              </span>
            </>
          )}
        </div>

        {/* Right: Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, SKU, category"
          className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* ================= Table ================= */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-sm table-fixed border-separate border-spacing-y-3">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-10">

            <tr>
              <th className="w-10 p-2">
                <input
                  type="checkbox"
                  checked={selectedIds.size === products.length && products.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="p-2 text-left">Product</th>
              <th className="w-32 p-2 text-left">SKU</th>
              <th className="w-40 p-2 text-left">Category</th>
              <th className="w-32 p-2 text-right">Price</th>
              <th className="w-32 p-2 text-right">Stock</th>
            </tr>
          </thead>

          <tbody>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading &&
              products.map(p => (
                <tr
                  key={p.id}
                  className="bg-white rounded-lg shadow-sm "
                >
                  <td className="p-3 align-middle">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                    />
                  </td>

                  <td className="p-3 font-medium truncate align-middle">{p.name}</td>

                  <td className="p-3 font-mono text-xs text-gray-600 align-middle">
                    {p.sku}
                  </td>

                  <td className="p-3 text-gray-700 truncate align-middle">
                    {p.category?.name ?? "-"}
                  </td>

                  <td className="p-3 text-right font-mono align-middle">
                    ₦{p.sellingPrice?.toLocaleString() ?? "-"}
                  </td>

                  <td
                    className={`p-3 text-right font-mono font-semibold tracking-tight align-middle ${stockTextClass(
                      p.tag
                    )}`}
                  >
                    {p.stock}
                  </td>
                </tr>
              ))}

            {!isLoading && products.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-400 text-sm">
                  No stock records for this branch.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ================= Pagination ================= */}
      <div className="flex justify-between items-center text-xs text-gray-600">
        <span>Total: {total}</span>
        <div className="flex gap-2 items-center">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40"
          >
            Prev
          </button>
          <span>{page} / {pageCount}</span>
          <button
            disabled={page >= pageCount}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {/* ================= Modals ================= */}
      {bulkDeleteOpen && (
        <ConfirmModal
          open
          title="Delete Products"
          message={`Remove ${selectedIds.size} selected products from this branch?`}
          destructive
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={bulkDelete}
        />
      )}

      {bulkEditOpen && (
        <ConfirmModal
          open
          title="Edit Stock Tag"
          message="Update stock tag for selected products"
          confirmLabel="Update"
          onClose={() => setBulkEditOpen(false)}
          onConfirm={bulkEditTag}
        >
          <select
            value={bulkTag}
            onChange={e => setBulkTag(e.target.value as TagFilter)}
            className="mt-2 border rounded-md px-2 py-1 text-sm"
          >
            <option value="LOW_STOCK">Low Stock</option>
            <option value="OUT_OF_STOCK">Out of Stock</option>
            <option value="ALL">Normal</option>
          </select>
        </ConfirmModal>
      )}
    </div>
  );
}
