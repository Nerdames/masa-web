"use client";

import { useState, useMemo } from "react";
import React from "react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import Summary, { SummaryCard } from "@/components/ui/Summary";

// ---------------- Types ----------------
export interface Sale {
  id: string;
  productId: string;
  productName?: string;
  quantity: number;
  total: number;
  currency: string;
  buyer?: string;
  attendant?: string;
  paymentType?: "CASH" | "TRANSFER" | "OTHER";
  status?: "PENDING" | "PROCESSING" | "COMPLETED" | "CANCELLED" | "RETURNED";
  createdAt: string;
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
  const [targetDate, setTargetDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  // ----- Summary Cards -----
  const pendingCount = sales.filter(s => s.status === "PENDING").length;
  const completedCount = sales.filter(s => s.status === "COMPLETED").length;

  const summaryCards: SummaryCard[] = [
    { id: "totalSales", title: "Total Sales", value: total, filter: "ALL" },
    {
      id: "pendingSales",
      title: "Pending Sales",
      value: pendingCount,
      filter: "PENDING",
      color: pendingCount === 0 ? "text-green-600" : pendingCount <= 5 ? "text-amber-600" : "text-red-600",
    },
    { id: "completedSales", title: "Completed Sales", value: completedCount, filter: "COMPLETED", color: "text-green-600" },
  ];

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

  // ----- Status Class -----
  const statusClass = (status?: Sale["status"]) => {
    switch (status) {
      case "COMPLETED": return "text-green-700";
      case "PENDING": return "text-yellow-700";
      case "PROCESSING": return "text-blue-700";
      case "CANCELLED": return "text-red-700";
      case "RETURNED": return "text-purple-700";
      default: return "text-gray-700";
    }
  };

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

  // ----- Group Sales By Day -----
  const groupedSales = useMemo(() => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const groups: Record<string, Sale[]> = { Today: [], Yesterday: [], Older: [] };

    sales.forEach(sale => {
      const saleDate = new Date(sale.createdAt);
      if (
        saleDate.getFullYear() === today.getFullYear() &&
        saleDate.getMonth() === today.getMonth() &&
        saleDate.getDate() === today.getDate()
      ) {
        groups["Today"].push(sale);
      } else if (
        saleDate.getFullYear() === yesterday.getFullYear() &&
        saleDate.getMonth() === yesterday.getMonth() &&
        saleDate.getDate() === yesterday.getDate()
      ) {
        groups["Yesterday"].push(sale);
      } else {
        groups["Older"].push(sale);
      }
    });

    return groups;
  }, [sales]);

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">
      {/* ================= Summary ================= */}
      <Summary cardsData={summaryCards} />

      {/* ================= Top Bar ================= */}
    <div className="sticky top-0 z-20 bg-white p-3 flex flex-wrap items-center gap-2 shadow-sm">
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

      <div className="ml-auto flex gap-2 items-center">
        {/* Payment Type Filter */}
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

        {/* Add Sale Button */}
        <button
          onClick={() => router.push("/dashboard/sales/add")}
          className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"
        >
          <i className="bx bx-plus text-green-600 text-lg" />
        </button>
      </div>
    </div>


      {/* ================= Sales Table ================= */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-y-3 min-w-[900px]">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-10">
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
              <th className="p-2">Status</th>
              <th className="p-2 text-right">Quantity</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2 text-right">Currency</th>
              <th className="p-2">Created At</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading &&
              Object.entries(groupedSales).map(([groupName, groupSales]) => (
                <React.Fragment key={groupName}>
                  {groupSales.length > 0 && (
                    <tr>
                      <td colSpan={7} className="bg-gray-100 px-3 py-1 font-semibold text-gray-600">
                        {groupName}
                      </td>
                    </tr>
                  )}
                  {groupSales.map(sale => {
                    const isDisabled = sale.status === "CANCELLED" || sale.status === "RETURNED";
                    const created = new Date(sale.createdAt);
                    return (
                      <tr
                        key={sale.id}
                        className={`bg-white shadow-sm rounded-lg hover:bg-gray-50 transition ${
                          isDisabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                        }`}
                        onClick={() => !isDisabled && router.push(`/dashboard/sales/${sale.id}`)}
                      >
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(sale.id)}
                            disabled={isDisabled}
                            onChange={e => { e.stopPropagation(); toggleSelect(sale.id); }}
                          />
                        </td>
                        <td className="p-3 sticky left-0 bg-white z-20">{sale.productName ?? "N/A"}</td>
                        <td className={`p-3 px-2 py-1 text-xs font-semibold ${statusClass(sale.status)}`}>{sale.status}</td>
                        <td className="p-3 text-right">{sale.quantity}</td>
                        <td className="p-3 text-right">{sale.total.toFixed(2)}</td>
                        <td className="p-3 text-right">{sale.currency}</td>
                        <td className="p-3 text-left">
                          <div className="text-sm">{created.toLocaleDateString()}</div>
                          <div className="text-xs text-gray-500">{created.toLocaleTimeString()}</div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
          </tbody>
        </table>
      </div>

      {/* ================= Pagination ================= */}
      <div className="flex justify-between items-center text-xs">
        <span>Total Sales: {total}</span>
        <div className="flex gap-2 items-center">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40">
            Prev
          </button>
          <span>{page} / {pageCount}</span>
          <button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40">
            Next
          </button>
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
