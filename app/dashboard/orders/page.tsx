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
type OrderStatus = "ALL" | "DRAFT" | "SUBMITTED" | "CANCELLED";

interface OrderItem {
  id: string;
  quantity: number;
}

interface Order {
  id: string;
  customer?: { name: string };
  salesperson?: { name: string };
  total: number;
  currency: string;
  status: "DRAFT" | "SUBMITTED" | "CANCELLED";
  createdAt: string;
  items: OrderItem[];
  invoice?: { id: string };
}

interface OrdersResponse {
  orders: Order[];
  total: number;
}

// ---------------- Fetcher ----------------
const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(res => res.json());

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
export default function OrdersPage() {
  const toast = useToast();
  const router = useRouter();

  // ----- State -----
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus>("ALL");
  const [targetDate, setTargetDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  // ----- Query String -----
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (targetDate) params.set("date", targetDate);
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    return params.toString();
  }, [page, debouncedSearch, statusFilter, targetDate]);

  // ----- Fetch Orders -----
  const { data, error, isLoading, mutate } = useSWR<OrdersResponse>(
    `/api/dashboard/orders?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  if (error) {
    toast.addToast({ type: "error", message: "Failed to fetch orders" });
  }

  const orders: Order[] = useMemo(() => data?.orders ?? [], [data]);
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  // ----- Summary Cards -----
  const draftCount = orders.filter(o => o.status === "DRAFT").length;
  const submittedCount = orders.filter(o => o.status === "SUBMITTED").length;

  const summaryCards: SummaryCard[] = [
    { id: "totalOrders", title: "Total Orders", value: total, filter: "ALL" },
    { id: "draftOrders", title: "Draft", value: draftCount, filter: "DRAFT", color: "text-gray-600" },
    { id: "submittedOrders", title: "Submitted", value: submittedCount, filter: "SUBMITTED", color: "text-green-600" },
  ];

  // ----- Selectable Orders -----
  const selectableIds = useMemo(() => orders.filter(o => o.status !== "CANCELLED").map(o => o.id), [orders]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const allSelected = selectableIds.every(id => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  }, [selectableIds, selectedIds]);

  const isAllSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  const statusClass = useCallback((status?: Order["status"]) => {
    switch (status) {
      case "SUBMITTED": return "text-green-700";
      case "DRAFT": return "text-gray-700";
      case "CANCELLED": return "text-red-700";
      default: return "text-gray-700";
    }
  }, []);

  // ----- Bulk Cancel -----
  const bulkCancel = useCallback(async () => {
    const idsToCancel = [...selectedIds].filter(id => {
      const o = orders.find(order => order.id === id);
      return o && o.status !== "CANCELLED";
    });

    if (!idsToCancel.length) {
      toast.addToast({ type: "info", message: "No cancellable orders selected" });
      setSelectedIds(new Set());
      setBulkCancelOpen(false);
      return;
    }

    try {
      await fetch("/api/dashboard/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToCancel }),
      });
      toast.addToast({ type: "success", message: `${idsToCancel.length} orders cancelled` });
      setSelectedIds(prev => new Set([...prev].filter(id => !idsToCancel.includes(id))));
      setBulkCancelOpen(false);
      mutate();
    } catch {
      toast.addToast({ type: "error", message: "Bulk cancel failed" });
    }
  }, [selectedIds, orders, toast, mutate]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await mutate();
    setTimeout(() => setRefreshing(false), 300);
  }, [mutate]);

  // ----- Group Orders By Day -----
  const groupedOrders = useMemo(() => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const groups: Record<string, Order[]> = { Today: [], Yesterday: [] };
    const olderGroups: Record<string, Order[]> = {};

    orders.forEach(order => {
      const d = new Date(order.createdAt);
      const key = d.toISOString().split("T")[0];
      if (d.toDateString() === today.toDateString()) groups["Today"].push(order);
      else if (d.toDateString() === yesterday.toDateString()) groups["Yesterday"].push(order);
      else {
        if (!olderGroups[key]) olderGroups[key] = [];
        olderGroups[key].push(order);
      }
    });

    const sortedOlderGroups = Object.keys(olderGroups)
      .sort((a, b) => (a > b ? -1 : 1))
      .reduce((acc, k) => ({ ...acc, [k]: olderGroups[k] }), {} as Record<string, Order[]>);

    return { ...groups, ...sortedOlderGroups };
  }, [orders]);

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">
      {/* Summary */}
      <Summary cardsData={summaryCards} />

      {/* Top Bar */}
      <div className="sticky top-0 z-20 bg-white p-3 flex flex-wrap items-center gap-2 shadow-sm">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customer"
          className="border rounded-lg p-2 text-sm min-w-[250px]"
        />

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
            onClick={() => setBulkCancelOpen(true)}
            className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"
          >
            <i className="bx bx-trash-alt text-red-600 text-lg" />
          </button>
        )}

        <div className="ml-auto flex gap-2 items-center">
          {/* Status Filter */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="bg-gray-100 px-3 rounded-full h-10 flex items-center justify-center text-sm">
              Status: {statusFilter}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="bg-white shadow rounded-md py-1 min-w-[120px]">
              {(["ALL", "DRAFT", "SUBMITTED", "CANCELLED"] as OrderStatus[]).map(s => (
                <DropdownMenu.Item key={s} className="px-4 py-2 cursor-pointer hover:bg-gray-100" onSelect={() => setStatusFilter(s)}>
                  {s}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
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
              <th className="p-4 w-[200px]">Customer</th>
              <th className="p-4">Salesperson</th>
              <th className="p-4 text-center">Items</th>
              <th className="p-4 text-center">Total</th>
              <th className="p-4">Currency</th>
              <th className="p-4">Invoice</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading && Object.entries(groupedOrders).map(([group, groupOrders]) => {
              if (!groupOrders.length) return null;
              return (
                <React.Fragment key={group}>
                  <tr className="bg-gray-100 text-gray-600 text-sm font-semibold">
                    <td colSpan={8} className="p-2 text-left">
                      {group === "Today" || group === "Yesterday" ? group : new Date(group).toLocaleDateString()}
                    </td>
                  </tr>
                  {groupOrders.map(o => {
                    const isCancelled = o.status === "CANCELLED";
                    const isSelected = selectedIds.has(o.id);
                    return (
                      <tr
                        key={o.id}
                        className={`
                          bg-white rounded-xl shadow-sm transition
                          ${isCancelled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-green-50 hover:text-green-700"}
                          ${isSelected ? "bg-green-100 text-green-700" : ""}
                        `}
                        onClick={e => {
                          if ((e.target as HTMLElement).tagName !== "INPUT" && !isCancelled) {
                            router.push(`/dashboard/orders/${o.id}`);
                          }
                        }}
                      >
                        <td className="p-4 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isCancelled}
                            onClick={e => e.stopPropagation()}
                            onChange={() => toggleSelect(o.id)}
                          />
                        </td>
                        <td className="p-4 text-center">{o.customer?.name ?? "-"}</td>
                        <td className="p-4 text-center">{o.salesperson?.name ?? "-"}</td>
                        <td className="p-4 text-center">{o.items.length}</td>
                        <td className="p-4 text-center">{o.total.toFixed(2)}</td>
                        <td className="p-4 text-center">{o.currency}</td>
                        <td className="p-4 text-center">{o.invoice ? "Issued" : "-"}</td>
                        <td className={`p-4 text-center font-semibold ${statusClass(o.status)}`}>{o.status}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center text-xs">
        <span>Total Orders: {total}</span>
        <div className="flex gap-2 items-center">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40">Prev</button>
          <span>{page} / {pageCount}</span>
          <button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40">Next</button>
        </div>
      </div>

      {/* Bulk Cancel Modal */}
      {bulkCancelOpen && (
        <ConfirmModal
          open
          title="Cancel Orders"
          message={`Cancel ${selectedIds.size} selected order(s)?`}
          destructive
          onClose={() => setBulkCancelOpen(false)}
          onConfirm={bulkCancel}
        />
      )}
    </div>
  );
}
