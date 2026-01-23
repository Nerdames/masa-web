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
    <td className="p-2"><div className="w-4 h-4 bg-gray-200 rounded" /></td>
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

  const user = session?.user as { organizationId: string; branchId: string; organizationName: string };
  const organizationId = user?.organizationId ?? "";
  const branchId = user?.branchId ?? "";
  const organizationName = user?.organizationName ?? "Unknown";

  /* ---------------- STATE ---------------- */
  const [products, setProducts] = useState<BranchProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [q, setQ] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const perPage = 12;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [editing, setEditing] = useState<BranchProduct | null>(null);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [costPrice, setCostPrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(0);
  const [reorderLevel, setReorderLevel] = useState<number>(0);

  const [bulkDeleteOpen, setBulkDeleteOpen] = useState<boolean>(false);
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  /* ---------------- FETCH BRANCH PRODUCTS ---------------- */
  const fetchList = useCallback(async (pageIndex: number = 1) => {
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

        const json: { products: BranchProduct[]; total: number } = await res.json();
        setProducts(json.products ?? []);
        setSelectedIds(new Set());
      } catch (err: unknown) {
        toast.addToast({ type: "error", message: (err as Error).message });
        setProducts([]);
        setSelectedIds(new Set());
      } finally {
        setLoading(false);
      }
    });
  }, [q, perPage, organizationId, branchId, toast]);

  useEffect(() => { fetchList(1); }, [fetchList]);

  /* ---------------- DEBOUNCE SEARCH ---------------- */
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

  /* ---------------- CRUD ---------------- */
  const handleDelete = async (id: string) => {
    await minLoading(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/branch-products/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        toast.addToast({ type: "success", message: "Product deleted" });
        await fetchList(page);
      } catch (err: unknown) {
        toast.addToast({ type: "error", message: (err as Error).message });
      } finally { setLoading(false); }
    });
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.size) return;
    await minLoading(async () => {
      setLoading(true);
      try {
        await Promise.all([...selectedIds].map(id => fetch(`/api/branch-products/${id}`, { method: "DELETE" })));
        toast.addToast({ type: "success", message: "Selected products deleted" });
        setSelectedIds(new Set());
        await fetchList(page);
      } catch (err: unknown) {
        toast.addToast({ type: "error", message: (err as Error).message });
      } finally { setLoading(false); }
    });
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
        <div className="bg-blue-50 rounded-md p-4 transition-all hover:shadow-md hover:translate-y-1">
          <span className="font-semibold text-blue-800 text-sm block">Organization: {organizationName}</span>
          <span className="text-gray-500 text-xs block">Branch ID: {branchId}</span>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="bg-white rounded-md px-4 py-3 text-center min-w-[100px]">
            <span className="font-bold">{totalProducts}</span>
            <span className="block text-gray-500 text-xs">Total Products</span>
          </div>
          <div className="bg-white rounded-md px-4 py-3 text-center min-w-[100px]">
            <span className="font-bold">{inStock}</span>
            <span className="block text-gray-500 text-xs">In Stock</span>
          </div>
          <div className="bg-white rounded-md px-4 py-3 text-center min-w-[100px]">
            <span className="font-bold">{outOfStock}</span>
            <span className="block text-gray-500 text-xs">Out of Stock</span>
          </div>
        </div>
      </div>

      {/* -------- SEARCH & ACTIONS -------- */}
      <div className="flex gap-2 items-center">
        <input className="w-full md:w-96 h-12 border rounded px-3" placeholder="Search branch products..." value={q} onChange={e => setQ(e.target.value)} />
        <Tooltip content="Refresh">
          <button onClick={() => fetchList(page)} disabled={loading} className="px-2 py-2 flex bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105">
            <i className="bx bx-refresh text-lg" />
          </button>
        </Tooltip>
        {selectedIds.size > 0 && (
          <Tooltip content="Delete Selected">
            <button onClick={() => setBulkDeleteOpen(true)} className="px-2 py-2 flex bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105">
              <i className="bx bx-trash text-red-600 text-lg" />
            </button>
          </Tooltip>
        )}
      </div>

      {/* -------- TABLE -------- */}
      <div className="flex-1 overflow-x-auto rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="p-2"><input type="checkbox" checked={selectedIds.size === products.length && products.length > 0} onChange={toggleSelectAll} /></th>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">SKU</th>
              <th className="p-2 text-left">Stock</th>
              <th className="p-2 text-left">Reorder Level</th>
              <th className="p-2 text-left">Selling Price</th>
              <th className="p-2 text-left">Cost Price</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />) : paginated.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 transition h-16">
                <td className="p-2"><input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} /></td>
                <td className="p-2">{p.product.name}</td>
                <td className="p-2">{p.product.sku}</td>
                <td className="p-2">{p.stock}</td>
                <td className="p-2">{p.reorderLevel}</td>
                <td className="p-2">{p.sellingPrice.toFixed(2)}</td>
                <td className="p-2">{p.costPrice?.toFixed(2) ?? "-"}</td>
                <td className="p-2 flex gap-1">
                  <Tooltip content="Edit">
                    <button onClick={() => {/* Open edit modal */}} className="px-2 py-2 flex bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105">
                      <i className="bx bx-edit text-lg" />
                    </button>
                  </Tooltip>
                  <Tooltip content="Delete">
                    <button onClick={() => setConfirmDelete({ open: true, id: p.id })} className="px-2 py-2 flex bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105">
                      <i className="bx bx-trash text-red-600 text-lg" />
                    </button>
                  </Tooltip>
                </td>
              </tr>
            ))}
            {!loading && paginated.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-gray-400">No branch products found.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* -------- PAGINATION -------- */}
      <div className="flex justify-between text-xs mt-2">
        <div>Total: {products.length}</div>
        <div className="flex gap-2 items-center">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 bg-gray-50 rounded-md">Prev</button>
          <span>{page} / {pageCount}</span>
          <button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)} className="px-2 py-1 bg-gray-50 rounded-md">Next</button>
        </div>
      </div>

      {/* -------- CONFIRM MODALS -------- */}
      {confirmDelete.open && confirmDelete.id && (
        <ConfirmModal
          open={confirmDelete.open}
          title="Delete Branch Product"
          message="Are you sure you want to delete this branch product?"
          destructive
          loading={loading}
          onClose={() => setConfirmDelete({ open: false, id: null })}
          onConfirm={async () => { await handleDelete(confirmDelete.id!); }}
        />
      )}

      {bulkDeleteOpen && (
        <ConfirmModal
          open={bulkDeleteOpen}
          title="Delete Selected Branch Products"
          message={`Are you sure you want to delete ${selectedIds.size} selected branch products?`}
          destructive
          loading={loading}
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={async () => { await handleBulkDelete(); setBulkDeleteOpen(false); }}
        />
      )}
    </div>
  );
}
