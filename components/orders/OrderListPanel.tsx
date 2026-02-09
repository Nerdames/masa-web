"use client";

import React, { useState, useMemo, useCallback } from "react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Summary, { SummaryCard } from "@/components/ui/Summary";

/* ============================
   TYPES (DB-ALIGNED)
============================ */

export type OrderStatus = "ALL" | "DRAFT" | "SUBMITTED" | "CANCELLED";

export interface OrderItem {
  id: string;
  quantity: number;
}

export interface Order {
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

/* ============================
   PROPS
============================ */

type Props = {
  onOpenOrder: (order: {
    id: string;
    reference: string;
    status: "DRAFT" | "SUBMITTED" | "CANCELLED";
  }) => void;
  onCreateOrder: () => void;
};

/* ============================
   FETCHER
============================ */

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(res => res.json());

/* ============================
   SKELETON
============================ */

const SkeletonRow = () => (
  <tr className="animate-pulse bg-white rounded-xl shadow-sm">
    {Array.from({ length: 8 }).map((_, i) => (
      <td key={i} className="p-3">
        <div className="h-4 bg-gray-200 rounded" />
      </td>
    ))}
  </tr>
);

/* ============================
   COMPONENT
============================ */

export default function OrderListPanel({
  onOpenOrder,
  onCreateOrder,
}: Props) {
  const toast = useToast();

  /* ============================
     STATE
  ============================ */

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus>("ALL");
  const [targetDate, setTargetDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  /* ============================
     QUERY
  ============================ */

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (targetDate) params.set("date", targetDate);
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    return params.toString();
  }, [page, debouncedSearch, statusFilter, targetDate]);

  const { data, error, isLoading, mutate } = useSWR<OrdersResponse>(
    `/api/dashboard/orders?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  if (error) {
    toast.addToast({ type: "error", message: "Failed to load orders" });
  }

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  /* ============================
     SUMMARY
  ============================ */

  const summaryCards: SummaryCard[] = [
    { id: "total", title: "Total Orders", value: total, filter: "ALL" },
    {
      id: "draft",
      title: "Draft",
      value: orders.filter(o => o.status === "DRAFT").length,
      filter: "DRAFT",
      color: "text-gray-600",
    },
    {
      id: "submitted",
      title: "Submitted",
      value: orders.filter(o => o.status === "SUBMITTED").length,
      filter: "SUBMITTED",
      color: "text-green-600",
    },
  ];

  /* ============================
     SELECTION
  ============================ */

  const selectableIds = useMemo(
    () => orders.filter(o => o.status !== "CANCELLED").map(o => o.id),
    [orders]
  );

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

  const isAllSelected =
    selectableIds.length > 0 &&
    selectableIds.every(id => selectedIds.has(id));

  /* ============================
     BULK CANCEL
  ============================ */

  const bulkCancel = useCallback(async () => {
    const ids = [...selectedIds];
    try {
      await fetch("/api/dashboard/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      toast.addToast({
        type: "success",
        message: `${ids.length} orders cancelled`,
      });
      setSelectedIds(new Set());
      setBulkCancelOpen(false);
      mutate();
    } catch {
      toast.addToast({ type: "error", message: "Bulk cancel failed" });
    }
  }, [selectedIds, toast, mutate]);

  /* ============================
     REFRESH
  ============================ */

  const handleRefresh = async () => {
    setRefreshing(true);
    await mutate();
    setTimeout(() => setRefreshing(false), 300);
  };

  /* ============================
     RENDER
  ============================ */

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* SUMMARY */}
      <Summary cardsData={summaryCards} />

      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-xl shadow-sm">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customer"
          className="border rounded-lg px-3 py-2 text-sm min-w-[220px]"
        />

        <div className="flex items-center gap-2 border rounded-lg px-3 py-2">
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
          className={`w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center ${
            refreshing ? "animate-spin" : ""
          }`}
        >
          <i className="bx bx-refresh" />
        </button>

        {selectedIds.size > 0 && (
          <button
            onClick={() => setBulkCancelOpen(true)}
            className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center"
          >
            <i className="bx bx-trash text-red-600" />
          </button>
        )}

        <button
          onClick={onCreateOrder}
          className="ml-auto px-4 py-2 rounded-lg bg-green-600 text-white text-sm"
        >
          <i className="bx bx-plus mr-1" /> New Order
        </button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="px-3 py-2 bg-gray-100 rounded-lg text-sm">
            Status: {statusFilter}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content className="bg-white shadow rounded-md">
            {(["ALL", "DRAFT", "SUBMITTED", "CANCELLED"] as OrderStatus[]).map(
              s => (
                <DropdownMenu.Item
                  key={s}
                  onSelect={() => setStatusFilter(s)}
                  className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                >
                  {s}
                </DropdownMenu.Item>
              )
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      {/* TABLE */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-separate border-spacing-y-2">
          <thead className="text-xs text-gray-500 uppercase">
            <tr>
              <th className="p-2 w-8">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="p-2">Customer</th>
              <th className="p-2">Salesperson</th>
              <th className="p-2 text-center">Items</th>
              <th className="p-2 text-center">Total</th>
              <th className="p-2 text-center">Invoice</th>
              <th className="p-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}

            {!isLoading &&
              orders.map(o => (
                <tr
                  key={o.id}
                  onClick={() =>
                    onOpenOrder({
                      id: o.id,
                      reference: o.id.slice(-6),
                      status: o.status,
                    })
                  }
                  className="bg-white rounded-xl shadow-sm cursor-pointer hover:bg-green-50"
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(o.id)}
                      onClick={e => e.stopPropagation()}
                      onChange={() => toggleSelect(o.id)}
                    />
                  </td>
                  <td className="p-3">{o.customer?.name ?? "-"}</td>
                  <td className="p-3">{o.salesperson?.name ?? "-"}</td>
                  <td className="p-3 text-center">{o.items.length}</td>
                  <td className="p-3 text-center">
                    {o.total.toFixed(2)} {o.currency}
                  </td>
                  <td className="p-3 text-center">
                    {o.invoice ? "Issued" : "-"}
                  </td>
                  <td className="p-3 text-center font-semibold">
                    {o.status}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      <div className="flex justify-between items-center text-xs">
        <span>Total Orders: {total}</span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="px-2 py-1 border rounded disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            {page} / {pageCount}
          </span>
          <button
            disabled={page >= pageCount}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 border rounded disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {/* CONFIRM */}
      {bulkCancelOpen && (
        <ConfirmModal
          open
          title="Cancel Orders"
          message={`Cancel ${selectedIds.size} order(s)?`}
          destructive
          onConfirm={bulkCancel}
          onClose={() => setBulkCancelOpen(false)}
        />
      )}
    </div>
  );
}
