"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/feedback/ToastProvider";
import { Tooltip } from "@/components/feedback/Tooltip";
import ConfirmModal from "@/components/modal/ConfirmModal";
import type { BranchProduct } from "@prisma/client";

/* ---------------- SKELETON ROW ---------------- */
const SkeletonRow = () => (
  <tr className="animate-pulse h-16">
    <td className="p-2">
      <div className="w-4 h-4 bg-gray-200 rounded" />
    </td>
    {Array.from({ length: 7 }).map((_, i) => (
      <td key={i} className="p-2">
        <div className="h-4 bg-gray-200 rounded w-24" />
      </td>
    ))}
  </tr>
);

/* ---------------- MINIMUM LOADING HELPER ---------------- */
const minLoading = async (fn: () => Promise<void>, delay = 400) => {
  const start = Date.now();
  await fn();
  const elapsed = Date.now() - start;
  if (elapsed < delay) await new Promise(res => setTimeout(res, delay - elapsed));
};

/* ---------------- PAGE COMPONENT ---------------- */
export default function BranchProductsPage() {
  const { data: session } = useSession();
  const toast = useToast();

  const user = session?.user as {
    organizationId: string;
    branchId: string;
    organizationName: string;
  };

  const organizationId = user?.organizationId ?? "";
  const branchId = user?.branchId ?? "";
  const organizationName = user?.organizationName ?? "Unknown";

  /* ---------------- STATE ---------------- */
  const [products, setProducts] = useState<BranchProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 12;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });

  /* ---------------- FETCH ---------------- */
  const fetchList = useCallback(
    async (pageIndex = 1) => {
      if (!organizationId || !branchId) return;
      await minLoading(async () => {
        setLoading(true);
        try {
          const params = new URLSearchParams();
          if (q.trim()) params.set("q", q.trim());
          params.set("page", String(pageIndex));
          params.set("perPage", String(perPage));
          params.set("organizationId", organizationId);
          params.set("branchId", branchId);

          const res = await fetch(`/api/branch-products?${params.toString()}`);
          if (!res.ok) throw new Error("Failed to load products");

          const json: { products: BranchProduct[] } = await res.json();
          setProducts(json.products ?? []);
          setSelectedIds(new Set());
        } catch (err) {
          toast.addToast({ type: "error", message: (err as Error).message });
          setProducts([]);
        } finally {
          setLoading(false);
        }
      });
    },
    [q, perPage, organizationId, branchId, toast]
  );

  useEffect(() => {
    fetchList(1);
  }, [fetchList]);

  useEffect(() => {
    const t = setTimeout(() => fetchList(1), 300);
    return () => clearTimeout(t);
  }, [q, fetchList]);

  /* ---------------- PAGINATION ---------------- */
  const pageCount = Math.max(1, Math.ceil(products.length / perPage));
  const paginated = useMemo(() => {
    const start = (page - 1) * perPage;
    return products.slice(start, start + perPage);
  }, [products, page, perPage]);

  /* ---------------- SELECTION ---------------- */
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === products.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(products.map(p => p.id)));
  };

  /* ---------------- STATS ---------------- */
  const totalProducts = products.length;
  const inStock = products.filter(p => p.stock > 0).length;
  const outOfStock = products.filter(p => p.stock === 0).length;

  /* ---------------- RENDER ---------------- */
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] space-y-4">

      {/* -------- TOP STATS -------- */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div className="bg-blue-50 rounded-md p-4">
          <span className="font-semibold text-blue-800 text-sm block">
            Organization: {organizationName}
          </span>
          <span className="text-gray-500 text-xs block">
            Branch ID: {branchId}
          </span>
        </div>

        <div className="flex gap-3 flex-wrap">
          {[
            { label: "Total Products", value: totalProducts },
            { label: "In Stock", value: inStock },
            { label: "Out of Stock", value: outOfStock },
          ].map(card => (
            <div
              key={card.label}
              className="bg-white rounded-md px-4 py-3 text-center min-w-[110px] shadow"
            >
              <span className="font-bold text-lg">{card.value}</span>
              <span className="block text-gray-500 text-xs">
                {card.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* -------- SEARCH & ACTIONS -------- */}
      <div className="flex gap-2 items-center bg-white p-2 rounded shadow">
        <input
          className="w-full md:w-96 h-10 border border-gray-300 rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Search branch products..."
          value={q}
          onChange={e => setQ(e.target.value)}
        />

        <Tooltip content="Refresh">
          <button
            onClick={() => fetchList(page)}
            disabled={loading}
            className="flex px-3 py-3 bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105"
          >
            <i className="bx bx-refresh text-lg" />
          </button>
        </Tooltip>

        {selectedIds.size > 0 && (
          <Tooltip content="Delete Selected">
            <button
              onClick={() => setBulkDeleteOpen(true)}
              className="flex px-3 py-3 bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105"
            >
              <i className="bx bx-trash text-red-600 text-lg" />
            </button>
          </Tooltip>
        )}
      </div>

      {/* -------- TABLE -------- */}
      <div className="flex-1 overflow-x-auto rounded-md border border-gray-200 shadow-sm">
        <table className="w-full text-sm table-auto">
          <thead className="bg-gray-50 text-gray-600 uppercase text-xs tracking-wide">
            <tr>
              <th className="p-2">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  checked={selectedIds.size === products.length && products.length > 0}
                  ref={el => {
                    if (el) el.indeterminate =
                      selectedIds.size > 0 && selectedIds.size < products.length;
                  }}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">SKU</th>
              <th className="p-2 text-left">Stock</th>
              <th className="p-2 text-left">Reorder</th>
              <th className="p-2 text-left">Selling</th>
              <th className="p-2 text-left">Cost</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {loading
              ? Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
              : paginated.map(p => (
                  <tr
                    key={p.id}
                    className={`hover:bg-gray-50 transition ${
                      selectedIds.has(p.id) ? "bg-gray-100" : ""
                    }`}
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                      />
                    </td>
                    <td className="p-2 font-medium">{p.product.name}</td>
                    <td className="p-2">{p.product.sku}</td>
                    <td className="p-2">{p.stock}</td>
                    <td className="p-2">{p.reorderLevel}</td>
                    <td className="p-2">{p.sellingPrice.toFixed(2)}</td>
                    <td className="p-2">{p.costPrice?.toFixed(2) ?? "-"}</td>
                    <td className="p-2 flex gap-1">
                      <Tooltip content="Edit">
                        <button className="flex px-3 py-3 bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105">
                          <i className="bx bx-edit text-lg text-blue-600" />
                        </button>
                      </Tooltip>
                      <Tooltip content="Delete">
                        <button
                          onClick={() => setConfirmDelete({ open: true, id: p.id })}
                          className="flex px-3 py-3 bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105"
                        >
                          <i className="bx bx-trash text-red-600 text-lg" />
                        </button>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
            {!loading && paginated.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-400">
                  No branch products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* -------- PAGINATION -------- */}
      <div className="flex justify-between text-xs mt-2">
        <div>Total: {products.length}</div>
        <div className="flex gap-2 items-center">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="px-2 py-1 bg-gray-50 rounded-md disabled:opacity-50"
          >
            Prev
          </button>
          <span>
            {page} / {pageCount}
          </span>
          <button
            disabled={page >= pageCount}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 bg-gray-50 rounded-md disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* -------- CONFIRM MODALS -------- */}
      {confirmDelete.open && confirmDelete.id && (
        <ConfirmModal
          open
          title="Delete Branch Product"
          message="Are you sure you want to delete this branch product?"
          destructive
          loading={loading}
          onClose={() => setConfirmDelete({ open: false, id: null })}
          onConfirm={async () => {
            await fetch(`/api/branch-products/${confirmDelete.id}`, { method: "DELETE" });
            setConfirmDelete({ open: false, id: null });
            fetchList(page);
          }}
        />
      )}

      {bulkDeleteOpen && (
        <ConfirmModal
          open
          title="Delete Selected Branch Products"
          message={`Are you sure you want to delete ${selectedIds.size} selected branch products?`}
          destructive
          loading={loading}
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={async () => {
            await Promise.all(
              [...selectedIds].map(id =>
                fetch(`/api/branch-products/${id}`, { method: "DELETE" })
              )
            );
            setBulkDeleteOpen(false);
            setSelectedIds(new Set());
            fetchList(page);
          }}
        />
      )}
    </div>
  );
}
