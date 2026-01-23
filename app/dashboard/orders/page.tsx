"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import { Tooltip } from "@/components/feedback/Tooltip";
import ConfirmModal from "@/components/modal/ConfirmModal";
import Link from "next/link";
import { motion } from "framer-motion";

// Types
interface Order {
  id: string;
  customerId?: string;
  total: number;
  paidAmount: number;
  balance: number;
  currency: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "CANCELLED" | "RETURNED";
  createdAt: string;
  updatedAt: string;
  items: { id: string }[];
  invoices: { id: string; paid: boolean }[];
}

type OrderFilter = "ALL" | "PENDING" | "PROCESSING" | "COMPLETED" | "CANCELLED" | "RETURNED";

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(res => res.json());

// Skeleton Card for loading state
const SkeletonCard = () => (
  <div className="animate-pulse p-4 rounded-lg bg-gray-50 shadow space-y-2">
    <div className="h-4 w-3/4 bg-gray-200 rounded" />
    <div className="h-3 w-1/2 bg-gray-200 rounded" />
    <div className="h-3 w-full bg-gray-200 rounded" />
  </div>
);

export default function OrdersPage() {
  const toast = useToast();

  /* ---------------- State ---------------- */
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<OrderFilter>("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  /* ---------------- Query ---------------- */
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filter !== "ALL") params.set("status", filter);
    return params.toString();
  }, [page, debouncedSearch, filter]);

  const { data, isLoading, mutate } = useSWR<{ orders: Order[]; total: number }>(
    `/api/dashboard/orders?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  const orders = data?.orders ?? [];
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



  /* ---------------- Actions ---------------- */
  const bulkDelete = async () => {
    try {
      await Promise.all(
        [...selectedIds].map(id => fetch(`/api/orders/${id}`, { method: "DELETE" }))
      );
      toast.addToast({ type: "success", message: "Orders deleted" });
      setSelectedIds(new Set());
      mutate();
    } catch {
      toast.addToast({ type: "error", message: "Bulk delete failed" });
    }
  };

  /* ---------------- Helper ---------------- */
  const statusClass = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-green-100 text-green-700";
      case "PENDING":
        return "bg-yellow-100 text-yellow-700";
      case "PROCESSING":
        return "bg-blue-100 text-blue-700";
      case "CANCELLED":
        return "bg-red-100 text-red-700";
      case "RETURNED":
        return "bg-purple-100 text-purple-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  /* ---------------- Render ---------------- */
  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">
      {/* ================= Top Bar ================= */}
      <div className="sticky top-0 z-20 bg-white flex justify-between items-center gap-4 p-2">
        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <div className="flex rounded-full bg-gray-100 h-10 overflow-hidden">
            {(["ALL", "PENDING", "PROCESSING", "COMPLETED", "CANCELLED", "RETURNED"] as const).map(ft => (
              <button
                key={ft}
                onClick={() => setFilter(ft)}
                className={`px-4 text-sm font-medium transition-colors ${
                  filter === ft ? "bg-blue-500 text-white" : "text-gray-700"
                }`}
              >
                {ft}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <Tooltip content="Refresh">
            <button
              onClick={() => mutate()}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 active:scale-95 transition"
            >
              <i className="bx bx-refresh text-lg" />
            </button>
          </Tooltip>

          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <>
              <Tooltip content="Delete">
                <button
                  onClick={() => setBulkDeleteOpen(true)}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 active:scale-95 transition text-red-600"
                >
                  <i className="bx bx-trash text-lg" />
                </button>
              </Tooltip>
              <span className="ml-1 text-xs text-gray-500">{selectedIds.size} selected</span>
            </>
          )}
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by customer or ID"
          className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* ================= Orders Cards ================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : orders.length === 0
          ? (
            <div className="col-span-full text-center text-gray-400 p-8">
              No orders found.
            </div>
          )
          : orders.map(order => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-white p-4 rounded-lg shadow border flex flex-col justify-between"
            >
              <div className="flex justify-between items-start">
                <input
                  type="checkbox"
                  checked={selectedIds.has(order.id)}
                  onChange={() => toggleSelect(order.id)}
                  className="mt-1"
                />
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusClass(order.status)}`}>
                  {order.status}
                </span>
              </div>

              <div className="mt-2 space-y-1">
                <h2 className="text-lg font-semibold text-gray-800">
                  {order.customerId || "Customer N/A"}
                </h2>
                <p className="text-sm text-gray-500">
                  Items: {order.items.length} | Invoices Paid: {order.invoices.filter(i => i.paid).length}/{order.invoices.length}
                </p>
                <p className="text-sm text-gray-500">
                  Total: {order.total.toFixed(2)} {order.currency} | Paid: {order.paidAmount.toFixed(2)} | Balance: {order.balance.toFixed(2)}
                </p>
                <p className="text-xs text-gray-400">{new Date(order.createdAt).toLocaleString()}</p>
              </div>

              <div className="mt-4 flex gap-2 justify-end">
                <Link
                  href={`/dashboard/orders/${order.id}/edit`}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition"
                  title="Edit Order"
                >
                  <i className="bx bx-edit text-black p-2 rounded-full bg-gray-50"></i>
                </Link>
              </div>
            </motion.div>
          ))}
      </div>

      {/* ================= Pagination ================= */}
      <div className="flex justify-between items-center text-xs text-gray-600">
        <span>Total Orders: {total}</span>
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

      {/* ================= Confirm Modals ================= */}
      {bulkDeleteOpen && (
        <ConfirmModal
          open
          title="Delete Orders"
          message={`Delete ${selectedIds.size} selected order(s)?`}
          destructive
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={bulkDelete}
        />
      )}
    </div>
  );
}
