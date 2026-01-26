"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";

// ---------------- Types ----------------
interface OrderItem {
  id: string;
}

interface Invoice {
  id: string;
  paid: boolean;
}

export interface Order {
  id: string;
  customerId?: string;
  total: number;
  paidAmount: number;
  balance: number;
  currency: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "CANCELLED" | "RETURNED";
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  invoices: Invoice[];
}

type OrderFilter = "ALL" | "PENDING" | "PROCESSING" | "COMPLETED" | "CANCELLED" | "RETURNED";

// ---------------- Fetcher ----------------
const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(res => res.json());

// ---------------- Skeleton Row ----------------
const SkeletonRow = () => (
  <tr className="animate-pulse bg-white shadow-sm rounded-lg">
    {Array.from({ length: 10 }).map((_, i) => (
      <td key={i} className="p-3">
        <div className="h-4 bg-gray-200 rounded w-full" />
      </td>
    ))}
  </tr>
);

// ---------------- Component ----------------
export default function OrdersPage() {
  const toast = useToast();
  const router = useRouter();

  // ----- State -----
  const [page, setPage] = useState<number>(1);
  const [search, setSearch] = useState<string>("");
  const [filter, setFilter] = useState<OrderFilter>("ALL");
  const [targetDate, setTargetDate] = useState<string>(""); // YYYY-MM-DD
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const debouncedSearch = useDebounce(search, 400);

  // ----- Query String -----
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filter !== "ALL") params.set("status", filter);
    if (targetDate) params.set("date", targetDate);
    return params.toString();
  }, [page, debouncedSearch, filter, targetDate]);

  const { data, isLoading, mutate } = useSWR<{ orders: Order[]; total: number }>(
    `/api/dashboard/orders?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  // ----- Summary counts -----
  const pendingCount = orders.filter(o => o.status === "PENDING").length;
  const completedCount = orders.filter(o => o.status === "COMPLETED").length;

  const pendingColorClass =
    pendingCount === 0 ? "text-green-600" : pendingCount <= 5 ? "text-amber-600" : "text-red-600";

  // ----- Selectable -----
  const selectableOrderIds = useMemo(
    () => orders.filter(o => o.status !== "CANCELLED" && o.status !== "RETURNED").map(o => o.id),
    [orders]
  );

  const toggleSelect = (id: string) => {
    const order = orders.find(o => o.id === id);
    if (!order || order.status === "CANCELLED" || order.status === "RETURNED") return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = selectableOrderIds.every(id => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(selectableOrderIds));
  };

  const isAllSelected = selectableOrderIds.length > 0 && selectableOrderIds.every(id => selectedIds.has(id));
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  // ----- Actions -----
  const bulkDelete = async () => {
    const idsToDelete = [...selectedIds].filter(id => {
      const o = orders.find(order => order.id === id);
      return o && o.status !== "CANCELLED" && o.status !== "RETURNED";
    });

    if (!idsToDelete.length) {
      toast.addToast({ type: "info", message: "No deletable orders selected" });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      return;
    }

    try {
      await Promise.all(idsToDelete.map(id => fetch(`/api/orders/${id}`, { method: "DELETE" })));
      toast.addToast({ type: "success", message: `${idsToDelete.length} orders deleted` });
      setSelectedIds(prev => new Set([...prev].filter(id => !idsToDelete.includes(id))));
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

  const statusClass = (status: Order["status"]) => {
    switch (status) {
      case "COMPLETED":
        return "text-green-700";
      case "PENDING":
        return "text-yellow-700";
      case "PROCESSING":
        return "text-blue-700";
      case "CANCELLED":
        return "text-red-700";
      case "RETURNED":
        return "text-purple-700";
      default:
        return "text-gray-700";
    }
  };

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">

      {/* ================= Summary Cards ================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className="p-4 bg-white rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:bg-gray-50"
          onClick={() => setFilter("ALL")}
        >
          <div className="text-sm text-slate-500">Total Orders</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{total}</div>
        </div>

        <div
          className="relative p-4 bg-white rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:bg-gray-50"
          onClick={() => setFilter("PENDING")}
        >
          {pendingCount > 0 && (
            <span
              aria-hidden
              className="absolute top-3 right-3 w-3 h-3 rounded-full bg-red-500 shadow-lg animate-pulse"
            />
          )}
          <div className="text-sm text-slate-500">Pending Orders</div>
          <div className={`text-xl font-bold mt-1 ${pendingColorClass}`}>{pendingCount}</div>
        </div>

        <div
          className="p-4 bg-white rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:bg-gray-50"
          onClick={() => setFilter("COMPLETED")}
        >
          <div className="text-sm text-slate-500">Completed Orders</div>
          <div className="text-xl font-bold text-green-600 mt-1">{completedCount}</div>
        </div>
      </div>

      {/* ================= Top Bar ================= */}
      <div className="sticky top-0 z-20 bg-white p-3 flex flex-wrap items-center gap-2 shadow-sm">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by customer or ID"
          className="border rounded-lg p-2 text-sm min-w-[250px]"
        />

        {/* Date Filter */}
        <div className="flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer bg-white h-10">
          <i className="bx bx-calendar text-gray-500" />
          <input
            type="date"
            value={targetDate}
            onChange={e => setTargetDate(e.target.value)}
            className="text-sm outline-none"
          />
        </div>

        <button
          onClick={handleRefresh}
          className={`w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center ${refreshing ? "animate-spin" : ""}`}
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
          {/* Filter Dropdown */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="bg-gray-100 px-3 rounded-full h-10 flex items-center justify-center text-sm">
              Filter: {filter}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="bg-white shadow rounded-md py-1 min-w-[140px]">
              {(["ALL","PENDING","PROCESSING","COMPLETED","CANCELLED","RETURNED"] as OrderFilter[]).map(ft => (
                <DropdownMenu.Item
                  key={ft}
                  className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                  onSelect={() => setFilter(ft)}
                >
                  {ft}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>

          {/* Add New Order */}
          <button
            onClick={() => router.push("/dashboard/orders/create")}
            className="relative group w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"
          >
            <i className="bx bx-plus text-green-600 text-lg" />
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black text-white text-xs rounded px-2 py-1 whitespace-nowrap">
              Create New Order
            </span>
          </button>
        </div>
      </div>

      {/* ================= Table ================= */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-y-3 min-w-[800px]">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-20">
            <tr>
              <th className="w-10 p-2">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={el => { if (el) el && (el.indeterminate = isIndeterminate); }}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="sticky left-0 bg-gray-50 p-2 z-30">Customer</th>
              <th className="p-2">Status</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2 text-right">Paid</th>
              <th className="p-2 text-right">Balance</th>
              <th className="p-2 text-right">Items</th>
              <th className="p-2 text-right">Invoices Paid</th>
              <th className="p-2">Created At</th>
            </tr>
          </thead>

          <tbody>
            {isLoading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading && orders.map(order => {
              const isDisabled = order.status === "CANCELLED" || order.status === "RETURNED";
              const created = new Date(order.createdAt);
              return (
                <tr
                  key={order.id}
                  className={`bg-white shadow-sm rounded-lg cursor-pointer hover:bg-gray-50 transition ${isDisabled ? "opacity-60 cursor-not-allowed" : ""}`}
                  onClick={() => !isDisabled && router.push(`/dashboard/orders/${order.id}`)}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(order.id)}
                      disabled={isDisabled}
                      onChange={e => { e.stopPropagation(); toggleSelect(order.id); }}
                    />
                  </td>
                  <td className="p-3 sticky left-0 bg-white z-20">{order.customerId ?? "N/A"}</td>
                  <td className={`p-3 px-2 py-1 text-xs font-semibold ${statusClass(order.status)}`}>{order.status}</td>
                  <td className="p-3 text-right">{order.total.toFixed(2)} {order.currency}</td>
                  <td className="p-3 text-right">{order.paidAmount.toFixed(2)}</td>
                  <td className="p-3 text-right">{order.balance.toFixed(2)}</td>
                  <td className="p-3 text-right">{order.items.length}</td>
                  <td className="p-3 text-right">{order.invoices.filter(i => i.paid).length}/{order.invoices.length}</td>
                  <td className="p-3 text-left">
                    <div className="text-sm">{created.toLocaleDateString()}</div>
                    <div className="text-xs text-gray-500">{created.toLocaleTimeString()}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ================= Pagination ================= */}
      <div className="flex justify-between items-center text-xs">
        <span>Total Orders: {total}</span>
        <div className="flex gap-2 items-center">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40">Prev</button>
          <span>{page} / {pageCount}</span>
          <button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40">Next</button>
        </div>
      </div>

      {/* ================= Bulk Delete Modal ================= */}
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
