"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";

// ---------------- Types ----------------
export interface Sale {
  id: string;
  productId: string;
  quantity: number;
  total: number;
  currency: string;
  createdAt: string;
  productName?: string;
  buyer?: string;
  attendant?: string;
  paymentType?: "CASH" | "TRANSFER" | "OTHER";
  status?: "PENDING" | "PROCESSING" | "COMPLETED" | "CANCELLED" | "RETURNED";
}

// ---------------- Fetcher ----------------
const fetcher = (url: string) => fetch(url, { credentials: "include" }).then(res => res.json());

// ---------------- Skeleton Row ----------------
const SkeletonRow = () => (
  <tr className="animate-pulse bg-white shadow-sm rounded-lg">
    {Array.from({ length: 7 }).map((_, i) => (
      <td key={i} className="p-3">
        <div className="h-4 bg-gray-200 rounded w-full" />
      </td>
    ))}
  </tr>
);

// ---------------- Component ----------------
export default function SalesPage() {
  const toast = useToast();
  const router = useRouter();

  // ----- State -----
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"ALL" | "CASH" | "TRANSFER" | "OTHER">("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [targetDate, setTargetDate] = useState<string>(""); // YYYY-MM-DD

  const debouncedSearch = useDebounce(search, 400);

  // ----- Query String -----
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (paymentFilter !== "ALL") params.set("paymentType", paymentFilter);
    if (targetDate) params.set("date", targetDate);
    return params.toString();
  }, [page, debouncedSearch, paymentFilter, targetDate]);

  const { data, isLoading, mutate } = useSWR<{ sales: Sale[]; total: number }>(
    `/api/dashboard/sales?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  const sales = data?.sales ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  // ----- Summary counts -----
  const pendingCount = sales.filter(s => s.status === "PENDING").length;
  const completedCount = sales.filter(s => s.status === "COMPLETED").length;

  const pendingColorClass =
    pendingCount === 0 ? "text-green-600" : pendingCount <= 5 ? "text-amber-600" : "text-red-600";

  // ----- Selectable -----
  const selectableIds = useMemo(
    () => sales.filter(s => s.status !== "CANCELLED" && s.status !== "RETURNED").map(s => s.id),
    [sales]
  );

  const toggleSelect = (id: string) => {
    const sale = sales.find(s => s.id === id);
    if (!sale || sale.status === "CANCELLED" || sale.status === "RETURNED") return;
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

  // ----- Actions -----
  const bulkDelete = async () => {
    const idsToDelete = [...selectedIds].filter(id => {
      const s = sales.find(sale => sale.id === id);
      return s && s.status !== "CANCELLED" && s.status !== "RETURNED";
    });

    if (!idsToDelete.length) {
      toast.addToast({ type: "info", message: "No deletable sales selected" });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      return;
    }

    try {
      await Promise.all(idsToDelete.map(id => fetch(`/api/dashboard/sales/${id}`, { method: "DELETE" })));
      toast.addToast({ type: "success", message: `${idsToDelete.length} sales deleted` });
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

  const statusClass = (status?: string) => {
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

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">

      {/* ================= Summary Cards ================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className="p-4 bg-white rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:bg-gray-50"
        >
          <div className="text-sm text-slate-500">Total Sales</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{total}</div>
        </div>

        <div
          className="relative p-4 bg-white rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:bg-gray-50"
        >
          {pendingCount > 0 && (
            <span
              aria-hidden
              className="absolute top-3 right-3 w-3 h-3 rounded-full bg-red-500 shadow-lg animate-pulse"
            />
          )}
          <div className="text-sm text-slate-500">Pending Sales</div>
          <div className={`text-xl font-bold mt-1 ${pendingColorClass}`}>{pendingCount}</div>
        </div>

        <div
          className="p-4 bg-white rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:bg-gray-50"
        >
          <div className="text-sm text-slate-500">Completed Sales</div>
          <div className="text-xl font-bold text-green-600 mt-1">{completedCount}</div>
        </div>
      </div>

      {/* ================= Top Bar ================= */}
      <div className="flex flex-wrap gap-2 items-center sticky top-0 z-20 bg-white p-3 shadow-sm">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search product or customer"
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

        <div className="ml-auto">
          {/* Payment Type Filter Dropdown */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="bg-gray-100 px-3 rounded-full h-10 flex items-center justify-center text-sm">
              Payment: {paymentFilter}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="bg-white shadow rounded-md py-1 min-w-[140px]">
              {(["ALL", "CASH", "TRANSFER", "OTHER"] as const).map(pt => (
                <DropdownMenu.Item
                  key={pt}
                  className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                  onSelect={() => setPaymentFilter(pt)}
                >
                  {pt}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
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
                  ref={el => { if (el) el.indeterminate = isIndeterminate; }}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="sticky left-0 bg-gray-50 p-2 z-20">Product</th>
              <th className="p-2">Status</th>
              <th className="p-2 text-right">Quantity</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2 text-right">Currency</th>
              <th className="p-2">Created At</th>
            </tr>
          </thead>

          <tbody>
            {isLoading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading && sales.map(sale => {
              const isDisabled = sale.status === "CANCELLED" || sale.status === "RETURNED";
              return (
                <tr key={sale.id} className={`bg-white shadow-sm rounded-lg ${isDisabled ? "opacity-60" : ""}`}>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(sale.id)}
                      disabled={isDisabled}
                      onChange={e => { e.stopPropagation(); toggleSelect(sale.id); }}
                    />
                  </td>
                  <td className="p-3 sticky left-0 bg-white z-20">{sale.productName ?? "N/A"}</td>
                  <td className={`p-3 px-2 py-1 rounded-full text-xs font-semibold ${statusClass(sale.status)}`}>{sale.status ?? "N/A"}</td>
                  <td className="p-3 text-right">{sale.quantity}</td>
                  <td className="p-3 text-right">{sale.total.toFixed(2)}</td>
                  <td className="p-3 text-right">{sale.currency}</td>
                  <td className="p-3">{new Date(sale.createdAt).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ================= Pagination ================= */}
      <div className="flex justify-between items-center text-xs">
        <span>Total Sales: {total}</span>
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
          title="Delete Sales"
          message={`Delete ${selectedIds.size} selected sale(s)?`}
          destructive
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={bulkDelete}
        />
      )}
    </div>
  );
}
