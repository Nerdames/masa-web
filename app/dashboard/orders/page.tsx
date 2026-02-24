"use client";

import { useState, useMemo, useCallback } from "react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import { useRouter } from "next/navigation";

import Summary, { SummaryCard } from "@/components/ui/Summary";
import DataTable, { DataTableColumn } from "@/components/ui/DataTable";
import DataTableToolbar from "@/components/ui/DataTableToolbar";

/* ================= Types ================= */

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

/* ================= Fetcher ================= */

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(res => res.json());

/* ================= Component ================= */

export default function OrdersPage() {
  const toast = useToast();
  const router = useRouter();

  /* ---------- State ---------- */

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<OrderStatus>("ALL");
  const [targetDate, setTargetDate] = useState("");
  const [selectedIds, setSelectedIds] =
    useState<Set<string>>(new Set());
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  /* ---------- Query ---------- */

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");

    if (debouncedSearch) params.set("search", debouncedSearch);
    if (targetDate) params.set("date", targetDate);
    if (statusFilter !== "ALL") params.set("status", statusFilter);

    return params.toString();
  }, [page, debouncedSearch, targetDate, statusFilter]);

  /* ---------- Fetch ---------- */

  const { data, error, isLoading, mutate } =
    useSWR<OrdersResponse>(
      `/api/dashboard/orders?${query}`,
      fetcher,
      { keepPreviousData: true }
    );

  if (error) {
    toast.addToast({
      type: "error",
      message: "Failed to fetch orders",
    });
  }

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  /* ---------- Summary ---------- */

  const draftCount = orders.filter(
    o => o.status === "DRAFT"
  ).length;

  const submittedCount = orders.filter(
    o => o.status === "SUBMITTED"
  ).length;

  const summaryCards: SummaryCard[] = [
    { id: "total", title: "Total Orders", value: total },
    { id: "draft", title: "Draft", value: draftCount},
    { id: "submitted", title: "Submitted", value: submittedCount },
  ];

  /* ---------- Selection ---------- */

  const selectableIds = useMemo(
    () =>
      orders
        .filter(o => o.status !== "CANCELLED")
        .map(o => o.id),
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
    const allSelected = selectableIds.every(id =>
      selectedIds.has(id)
    );

    setSelectedIds(
      allSelected ? new Set() : new Set(selectableIds)
    );
  }, [selectableIds, selectedIds]);

  const isAllSelected =
    selectableIds.length > 0 &&
    selectableIds.every(id => selectedIds.has(id));

  const isIndeterminate =
    selectedIds.size > 0 && !isAllSelected;

  /* ---------- Bulk Cancel ---------- */

  const bulkCancel = useCallback(async () => {
    const idsToCancel = [...selectedIds].filter(id => {
      const o = orders.find(order => order.id === id);
      return o && o.status !== "CANCELLED";
    });

    if (!idsToCancel.length) {
      toast.addToast({
        type: "info",
        message: "No cancellable orders selected",
      });
      setBulkCancelOpen(false);
      setSelectedIds(new Set());
      return;
    }

    try {
      await fetch("/api/dashboard/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToCancel }),
      });

      toast.addToast({
        type: "success",
        message: `${idsToCancel.length} orders cancelled`,
      });

      setSelectedIds(new Set());
      setBulkCancelOpen(false);
      mutate();
    } catch {
      toast.addToast({
        type: "error",
        message: "Bulk cancel failed",
      });
    }
  }, [selectedIds, orders, toast, mutate]);

  /* ---------- Refresh ---------- */

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await mutate();
    setTimeout(() => setRefreshing(false), 300);
  }, [mutate]);

  /* ---------- Columns ---------- */

  const statusClass = (status: Order["status"]) => {
    switch (status) {
      case "SUBMITTED":
        return "text-green-700";
      case "DRAFT":
        return "text-gray-700";
      case "CANCELLED":
        return "text-red-700";
    }
  };

  const columns: DataTableColumn<Order>[] = [
    {
      key: "customer",
      header: "Customer",
      render: o => o.customer?.name ?? "-",
    },
    {
      key: "salesperson",
      header: "Salesperson",
      render: o => o.salesperson?.name ?? "-",
    },
    {
      key: "items",
      header: "Items",
      align: "center",
      render: o => o.items.length,
    },
    {
      key: "total",
      header: "Total",
      align: "center",
      render: o => o.total.toFixed(2),
    },
    {
      key: "currency",
      header: "Currency",
      render: o => o.currency,
    },
    {
      key: "invoice",
      header: "Invoice",
      render: o => (o.invoice ? "Issued" : "-"),
    },
    {
      key: "status",
      header: "Status",
      render: o => (
        <span className={`font-semibold ${statusClass(o.status)}`}>
          {o.status}
        </span>
      ),
    },
  ];

  /* ================= Render ================= */

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">

      {/* ===== Summary ===== */}
      <Summary
        cardsData={summaryCards}
        loading={false}
      />

      {/* ===== Toolbar ===== */}
      <DataTableToolbar<Order, OrderStatus, OrderStatus>
        search={search}
        onSearchChange={setSearch}
        date={targetDate}
        onDateChange={setTargetDate}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        filters={[
          {
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: "ALL", label: "All" },
              { value: "DRAFT", label: "Draft" },
              { value: "SUBMITTED", label: "Submitted" },
              { value: "CANCELLED", label: "Cancelled" },
            ],
          },
        ]}
        selectedCount={selectedIds.size}
        onBulkAction={() => setBulkCancelOpen(true)}
        onClearSelection={() => setSelectedIds(new Set())}
        exportData={orders}
        exportFileName="orders.csv"
        onAdd={() => router.push("/dashboard/orders/add")}
      />

      {/* ===== DataTable ===== */}
      <DataTable<Order>
        data={orders}
        columns={columns}
        loading={isLoading}
        selectable
        selectedIds={selectedIds}
        getRowId={row => row.id}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        isAllSelected={isAllSelected}
        isIndeterminate={isIndeterminate}
        onRowClick={order => {
          if (order.status !== "CANCELLED") {
            router.push(`/dashboard/orders/${order.id}`);
          }
        }}
        groupByDate
        getRowDate={row => row.createdAt}
      />

      {/* ===== Pagination ===== */}
      <div className="flex justify-between items-center text-xs">
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

      {/* ===== Bulk Modal ===== */}
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
