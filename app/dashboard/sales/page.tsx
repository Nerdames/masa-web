"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import { useRouter } from "next/navigation";

import Summary, { SummaryCard } from "@/components/ui/Summary";
import DataTable, { DataTableColumn } from "@/components/ui/DataTable";
import DataTableToolbar from "@/components/ui/DataTableToolbar";

/* ================= Types ================= */

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

type PaymentFilter =
  | "ALL"
  | "CASH"
  | "CARD"
  | "BANK_TRANSFER"
  | "MOBILE_MONEY"
  | "POS";

type StatusFilter = "ALL" | "PENDING" | "COMPLETED" | "CANCELLED";

/* ================= Fetcher ================= */

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((res) => res.json());

/* ================= Component ================= */

export default function SalesPage() {
  const toast = useToast();
  const router = useRouter();

  /* ---------- State ---------- */

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] =
    useState<PaymentFilter>("ALL");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  /* ---------- Query (memoized) ---------- */

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");

    if (debouncedSearch) params.set("search", debouncedSearch);
    if (paymentFilter !== "ALL")
      params.set("paymentMethod", paymentFilter);
    if (statusFilter !== "ALL")
      params.set("status", statusFilter);

    return params.toString();
  }, [page, debouncedSearch, paymentFilter, statusFilter]);

  /* ---------- Fetch ---------- */

  const { data, error, isLoading, mutate } = useSWR<{
    sales: Sale[];
    total: number;
  }>(`/api/dashboard/sales?${query}`, fetcher, {
    keepPreviousData: true,
  });

  /* ---------- Error Side Effect ---------- */

  useEffect(() => {
    if (error) {
      toast.addToast({
        type: "error",
        message: "Failed to fetch sales",
      });
    }
  }, [error, toast]);

  const sales = data?.sales ?? [];
  const total = data?.total ?? 0;

  /* ---------- Pagination ---------- */

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(total / 10)),
    [total]
  );

  /* ---------- Summary (single-pass optimized) ---------- */

  const { pendingCount, completedCount } = useMemo(() => {
    let pending = 0;
    let completed = 0;

    for (const s of sales) {
      if (s.status === "PENDING") pending++;
      if (s.status === "COMPLETED") completed++;
    }

    return { pendingCount: pending, completedCount: completed };
  }, [sales]);

  const summaryCards: SummaryCard[] = useMemo(
    () => [
      { id: "totalSales", title: "Total Sales", value: total },
      { id: "pendingSales", title: "Pending Sales", value: pendingCount },
      { id: "completedSales", title: "Completed Sales", value: completedCount },
    ],
    [total, pendingCount, completedCount]
  );

  /* ---------- Selection ---------- */

  const selectableIds = useMemo(
    () => sales.filter((s) => s.status !== "CANCELLED").map((s) => s.id),
    [sales]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected = selectableIds.every((id) =>
        prev.has(id)
      );
      return allSelected ? new Set() : new Set(selectableIds);
    });
  }, [selectableIds]);

  const isAllSelected = useMemo(
    () =>
      selectableIds.length > 0 &&
      selectableIds.every((id) => selectedIds.has(id)),
    [selectableIds, selectedIds]
  );

  const isIndeterminate = useMemo(
    () => selectedIds.size > 0 && !isAllSelected,
    [selectedIds, isAllSelected]
  );

  /* ---------- Status Styling ---------- */

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

  /* ---------- Columns (memoized) ---------- */

  const columns: DataTableColumn<Sale>[] = useMemo(
    () => [
      {
        key: "product",
        header: "Product",
        render: (s) => s.productName ?? "-",
      },
      {
        key: "customer",
        header: "Customer",
        render: (s) => s.customerName ?? "-",
      },
      {
        key: "quantity",
        header: "Quantity",
        align: "center",
        render: (s) => s.quantity,
      },
      {
        key: "total",
        header: "Total",
        align: "center",
        render: (s) => s.total.toFixed(2),
      },
      {
        key: "currency",
        header: "Currency",
        render: (s) => s.currency,
      },
      {
        key: "payment",
        header: "Payment",
        render: (s) => s.paymentMethods?.join(", ") ?? "-",
      },
      {
        key: "status",
        header: "Status",
        render: (s) => (
          <span className={`font-semibold ${statusClass(s.status)}`}>
            {s.status}
          </span>
        ),
      },
    ],
    [statusClass]
  );

  /* ---------- Bulk Delete ---------- */

  const bulkDelete = useCallback(async () => {
    const idsToDelete = [...selectedIds].filter((id) => {
      const s = sales.find((sale) => sale.id === id);
      return s && s.status !== "CANCELLED";
    });

    if (!idsToDelete.length) {
      toast.addToast({
        type: "info",
        message: "No deletable sales selected",
      });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      return;
    }

    try {
      await Promise.all(
        idsToDelete.map((id) =>
          fetch(`/api/dashboard/sales/${id}`, {
            method: "DELETE",
          })
        )
      );

      toast.addToast({
        type: "success",
        message: `${idsToDelete.length} sales deleted`,
      });

      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      mutate();
    } catch {
      toast.addToast({
        type: "error",
        message: "Bulk delete failed",
      });
    }
  }, [selectedIds, sales, toast, mutate]);

  /* ---------- Refresh ---------- */

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await mutate();
    setTimeout(() => setRefreshing(false), 300);
  }, [mutate]);

  /* ================= Render ================= */

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">
      <Summary
        cardsData={summaryCards}
        loading={false}
      />

      <DataTableToolbar<Sale, PaymentFilter, StatusFilter>
        search={search}
        onSearchChange={setSearch}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        filters={[
          {
            label: "Payment",
            value: paymentFilter,
            onChange: setPaymentFilter,
            options: [
              { value: "ALL", label: "All" },
              { value: "CASH", label: "Cash" },
              { value: "CARD", label: "Card" },
              { value: "BANK_TRANSFER", label: "Bank Transfer" },
              { value: "MOBILE_MONEY", label: "Mobile Money" },
              { value: "POS", label: "POS" },
            ],
          },
          {
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: "ALL", label: "All" },
              { value: "PENDING", label: "Pending" },
              { value: "COMPLETED", label: "Completed" },
              { value: "CANCELLED", label: "Cancelled" },
            ],
          },
        ]}
        selectedCount={selectedIds.size}
        onBulkAction={() => setBulkDeleteOpen(true)}
        onClearSelection={() => setSelectedIds(new Set())}
        exportData={sales}
        exportFileName="sales.csv"
        onAdd={() => router.push("/dashboard/sales/add")}
      />

      <DataTable<Sale>
        data={sales}
        columns={columns}
        loading={isLoading}
        selectable
        selectedIds={selectedIds}
        getRowId={(row) => row.id}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        isAllSelected={isAllSelected}
        isIndeterminate={isIndeterminate}
        onRowClick={(sale) => {
          if (sale.status !== "CANCELLED")
            router.push(`/dashboard/sales/${sale.id}`);
        }}
        groupByDate
        getRowDate={(row) => row.createdAt}
      />

      <div className="flex justify-between items-center text-xs">
        <span>Total Sales: {total}</span>

        <div className="flex gap-2 items-center">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40"
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
          >
            Next
          </button>
        </div>
      </div>

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