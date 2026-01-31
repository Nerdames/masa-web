"use client";

import { useState, useMemo, useCallback } from "react";
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
  status?: "PENDING" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  customerName?: string;
  cashierName?: string;
  paymentMethods?: ("CASH" | "CARD" | "BANK_TRANSFER" | "MOBILE_MONEY" | "POS")[];
}

// ---------------- Fetcher ----------------
const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((res) => res.json());

// ---------------- Skeleton Row ----------------
const SkeletonRow = () => (
  <tr className="animate-pulse bg-white shadow-sm rounded-lg">
    {Array.from({ length: 8 }).map((_, i) => (
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
  const [paymentFilter, setPaymentFilter] = useState<
    "ALL" | "CASH" | "CARD" | "BANK_TRANSFER" | "MOBILE_MONEY" | "POS"
  >("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "COMPLETED" | "CANCELLED">("ALL");
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
    if (targetDate) params.set("date", targetDate);
    if (paymentFilter !== "ALL") params.set("paymentMethod", paymentFilter);
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    return params.toString();
  }, [page, debouncedSearch, paymentFilter, statusFilter, targetDate]);

  // ----- Fetch Sales -----
  const { data, error, isLoading, mutate } = useSWR<{ sales: Sale[]; total: number }>(
    `/api/dashboard/sales?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  // ----- Handle Error -----
  if (error) {
    toast.addToast({ type: "error", message: "Failed to fetch sales" });
  }

  const sales: Sale[] = useMemo(
    () =>
      data?.sales.map((s) => ({
        id: s.id,
        productId: s.productId,
        productName: s.productName ?? undefined,
        quantity: s.quantity,
        total: s.total,
        currency: s.currency,
        status: s.status,
        createdAt: s.createdAt,
        customerName: s.customerName ?? undefined,
        cashierName: s.cashierName ?? undefined,
        paymentMethods: s.paymentMethods,
      })) ?? [],
    [data]
  );

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  // ----- Summary Cards -----
  const pendingCount = sales.filter((s) => s.status === "PENDING").length;
  const completedCount = sales.filter((s) => s.status === "COMPLETED").length;

  const summaryCards: SummaryCard[] = [
    { id: "totalSales", title: "Total Sales", value: total, filter: "ALL" },
    {
      id: "pendingSales",
      title: "Pending Sales",
      value: pendingCount,
      filter: "PENDING",
      color:
        pendingCount === 0 ? "text-green-600" : pendingCount <= 5 ? "text-amber-600" : "text-red-600",
    },
    {
      id: "completedSales",
      title: "Completed Sales",
      value: completedCount,
      filter: "COMPLETED",
      color: "text-green-600",
    },
  ];

  // ----- Selectable Sales -----
  const selectableIds = useMemo(() => sales.filter((s) => s.status !== "CANCELLED").map((s) => s.id), [sales]);

  const toggleSelect = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    },
    [setSelectedIds]
  );

  const toggleSelectAll = useCallback(() => {
    const allSelected = selectableIds.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  }, [selectableIds, selectedIds]);

  const isAllSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  // ----- Status Class -----
  const statusClass = useCallback((status?: Sale["status"]) => {
    switch (status) {
      case "COMPLETED":
        return "text-green-700";
      case "PENDING":
        return "text-yellow-700";
      case "CANCELLED":
        return "text-red-700";
      default:
        return "text-gray-700";
    }
  }, []);

  // ----- Bulk Delete -----
  const bulkDelete = useCallback(async () => {
    const idsToDelete = [...selectedIds].filter((id) => {
      const s = sales.find((sale) => sale.id === id);
      return s && s.status !== "CANCELLED";
    });

    if (!idsToDelete.length) {
      toast.addToast({ type: "info", message: "No deletable sales selected" });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      return;
    }

    try {
      await Promise.all(idsToDelete.map((id) => fetch(`/api/dashboard/sales/${id}`, { method: "DELETE" })));
      toast.addToast({ type: "success", message: `${idsToDelete.length} sales deleted` });
      setSelectedIds((prev) => new Set([...prev].filter((id) => !idsToDelete.includes(id))));
      setBulkDeleteOpen(false);
      mutate();
    } catch {
      toast.addToast({ type: "error", message: "Bulk delete failed" });
    }
  }, [selectedIds, sales, toast, mutate]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await mutate();
    setTimeout(() => setRefreshing(false), 300);
  }, [mutate]);

  // ----- Group Sales By Day (Descending: Today → Yesterday → Older) -----
  const groupedSales = useMemo(() => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const groups: Record<string, Sale[]> = { Today: [], Yesterday: [] };
    const olderGroups: Record<string, Sale[]> = {};

    sales.forEach((sale) => {
      const saleDate = new Date(sale.createdAt);
      const dateKey = saleDate.toISOString().split("T")[0]; // YYYY-MM-DD

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
        if (!olderGroups[dateKey]) olderGroups[dateKey] = [];
        olderGroups[dateKey].push(sale);
      }
    });

    // Sort older dates descending
    const sortedOlderGroups = Object.keys(olderGroups)
      .sort((a, b) => (a > b ? -1 : 1))
      .reduce((acc, key) => {
        acc[key] = olderGroups[key];
        return acc;
      }, {} as Record<string, Sale[]>);

    return { ...groups, ...sortedOlderGroups };
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
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product or customer"
          className="border rounded-lg p-2 text-sm min-w-[250px]"
          aria-label="Search product or customer"
        />

        {/* Date Filter */}
        <div className="flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer bg-white h-10">
          <i className="bx bx-calendar text-gray-500" />
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="text-sm outline-none"
            aria-label="Filter by date"
          />
        </div>

        <button
          onClick={handleRefresh}
          className={`w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center ${refreshing ? "animate-spin" : ""}`}
          aria-label="Refresh sales"
        >
          <i className="bx bx-refresh text-lg" />
        </button>

        {selectedIds.size > 0 && (
          <button
            onClick={() => setBulkDeleteOpen(true)}
            className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"
            aria-label="Delete selected sales"
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
              {(["ALL", "CASH", "CARD", "BANK_TRANSFER", "MOBILE_MONEY", "POS"] as const).map((pt) => (
                <DropdownMenu.Item key={pt} className="px-4 py-2 cursor-pointer hover:bg-gray-100" onSelect={() => setPaymentFilter(pt)}>
                  {pt}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>

          {/* Status Filter */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="bg-gray-100 px-3 rounded-full h-10 flex items-center justify-center text-sm">
              Status: {statusFilter}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="bg-white shadow rounded-md py-1 min-w-[120px]">
              {(["ALL", "PENDING", "COMPLETED", "CANCELLED"] as const).map((status) => (
                <DropdownMenu.Item key={status} className="px-4 py-2 cursor-pointer hover:bg-gray-100" onSelect={() => setStatusFilter(status)}>
                  {status}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>

          {/* Add Sale Button */}
          <button
            onClick={() => router.push("/dashboard/sales/add")}
            className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"
            aria-label="Add new sale"
          >
            <i className="bx bx-plus text-green-600 text-lg" />
          </button>
        </div>
      </div>

      {/* Table */}
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
              <th className="p-4">Customer</th>
              <th className="p-4 text-center">Quantity</th>
              <th className="p-4 text-center">Total</th>
              <th className="p-4">Currency</th>
              <th className="p-4">Payment</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>

          <tbody>
            {isLoading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading &&
              Object.entries(groupedSales).map(([group, groupSales]) => {
                if (groupSales.length === 0) return null;
                return (
                  <React.Fragment key={group}>
                    {/* Group Separator */}
                    <tr className="bg-gray-100 text-gray-600 text-sm font-semibold">
                      <td colSpan={8} className="p-2 text-left">
                        {group === "Today" || group === "Yesterday"
                          ? group
                          : new Date(group).toLocaleDateString()}
                      </td>
                    </tr>

                    {/* Sales Rows */}
                    {groupSales.map((s) => {
                      const isCancelled = s.status === "CANCELLED";
                      const isSelected = selectedIds.has(s.id);
                      return (
                        <tr
                          key={s.id}
                          className={`
                            bg-white rounded-xl shadow-sm transition
                            ${isCancelled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-green-50 hover:text-green-700"}
                            ${isSelected ? "bg-green-100 text-green-700" : ""}
                          `}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).tagName !== "INPUT" && !isCancelled) {
                              router.push(`/dashboard/sales/${s.id}`);
                            }
                          }}
                        >
                          <td className="p-4 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isCancelled}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleSelect(s.id)}
                              className="accent-blue-600"
                            />
                          </td>
                          <td className="p-4 text-center font-medium">{s.productName ?? "-"}</td>
                          <td className="p-4 text-center">{s.customerName ?? "-"}</td>
                          <td className="p-4 text-center">{s.quantity}</td>
                          <td className="p-4 text-center">{s.total.toFixed(2)}</td>
                          <td className="p-4 text-center">{s.currency}</td>
                          <td className="p-4 text-center">{s.paymentMethods?.join(", ") ?? "-"}</td>
                          <td className={`p-4 text-center font-semibold ${statusClass(s.status)}`}>{s.status}</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* ================= Pagination ================= */}
      <div className="flex justify-between items-center text-xs">
        <span>Total Sales: {total}</span>
        <div className="flex gap-2 items-center">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40"
            aria-label="Previous page"
          >
            Prev
          </button>
          <span>
            {page} / {pageCount}
          </span>
          <button
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40"
            aria-label="Next page"
          >
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
