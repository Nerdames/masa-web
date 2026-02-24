"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import DataTableToolbar from "@/components/ui/DataTableToolbar";
import DataTable, { DataTableColumn } from "@/components/ui/DataTable";
import Summary, { SummaryCard } from "@/components/ui/Summary";
import { useRouter } from "next/navigation";

/* ================= Types ================= */

type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOIDED";

interface Invoice {
  id: string;
  subtotal?: number;
  discount?: number;
  tax?: number;
  total: number;
  paidAmount: number;
  balance: number;
  status: InvoiceStatus;
  currency: string;
  issuedAt: string;
  dueDate?: string;
  buyerName?: string;
  issuedByName?: string;
}

/* ================= Fetcher ================= */

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((res) => res.json());

/* ================= Page ================= */

export default function InvoicePage() {
  const toast = useToast();
  const router = useRouter();

  /* ---------- State ---------- */
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | InvoiceStatus>("ALL");
  const [targetDate, setTargetDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMarkPaidOpen, setBulkMarkPaidOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  /* ---------- Query & Fetch ---------- */
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "10");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (targetDate) params.set("date", targetDate);
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    return params.toString();
  }, [page, debouncedSearch, targetDate, statusFilter]);

  const { data, isLoading, mutate, error } = useSWR<{ data: Invoice[]; total: number }>(
    `/api/dashboard/invoices?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  useEffect(() => {
    if (error) toast.addToast({ type: "error", message: "Failed to fetch invoices" });
  }, [error, toast]);

  const invoices = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  /* ---------- Summary ---------- */
  const paidCount = invoices.filter((i) => i.status === "PAID").length;
  const unpaidCount = invoices.filter((i) => i.status !== "PAID").length;

  const summaryCards: SummaryCard[] = [
    { id: "total", title: "Total Invoices", value: total, filter: "ALL" },
    { id: "paid", title: "Paid", value: paidCount, filter: "PAID", color: "text-green-600" },
    {
      id: "unpaid",
      title: "Unpaid",
      value: unpaidCount,
      filter: "UNPAID",
      color: unpaidCount === 0 ? "text-green-600" : "text-red-600",
    },
  ];

  /* ---------- Selection Helpers ---------- */
  const selectableIds = useMemo(
    () => invoices.filter((i) => i.status !== "PAID" && i.status !== "VOIDED").map((i) => i.id),
    [invoices]
  );
  const isAllSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(isAllSelected ? new Set() : new Set(selectableIds));
  }, [isAllSelected, selectableIds]);

  /* ---------- Bulk Mark Paid ---------- */
  const bulkMarkPaid = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch("/api/dashboard/invoices/mark-paid", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      if (!res.ok) throw new Error();
      toast.addToast({ type: "success", message: "Invoices marked as paid" });
      setSelectedIds(new Set());
      setBulkMarkPaidOpen(false);
      mutate();
    } catch {
      toast.addToast({ type: "error", message: "Failed to mark invoices as paid" });
    }
  }, [selectedIds, toast, mutate]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await mutate();
    setTimeout(() => setRefreshing(false), 300);
  }, [mutate]);

  /* ---------- Columns for DataTable ---------- */
  const columns: DataTableColumn<Invoice>[] = useMemo(
    () => [
      {
        key: "id",
        header: "Invoice",
        render: (row) => `#${row.id.slice(-6)}`,
        align: "center",
      },
      {
        key: "buyer",
        header: "Buyer",
        render: (row) => row.buyerName ?? "Walk-in",
        align: "center",
      },
      {
        key: "issuedBy",
        header: "Issued By",
        render: (row) => row.issuedByName ?? "-",
        align: "center",
      },
      {
        key: "subtotal",
        header: "Subtotal",
        render: (row) => `₦${row.subtotal?.toLocaleString() ?? "0"}`,
        align: "center",
      },
      {
        key: "tax",
        header: "Tax",
        render: (row) => `₦${row.tax?.toLocaleString() ?? "0"}`,
        align: "center",
      },
      {
        key: "discount",
        header: "Discount",
        render: (row) => `₦${row.discount?.toLocaleString() ?? "0"}`,
        align: "center",
      },
      {
        key: "total",
        header: "Total",
        render: (row) => `₦${row.total.toLocaleString()}`,
        align: "center",
      },
      {
        key: "paidAmount",
        header: "Paid",
        render: (row) => `₦${row.paidAmount.toLocaleString()}`,
        align: "center",
      },
      {
        key: "balance",
        header: "Balance",
        render: (row) => `₦${Math.max(row.balance, 0).toLocaleString()}`,
        align: "center",
      },
      {
        key: "status",
        header: "Status",
        render: (row) => row.status,
        align: "center",
      },
      {
        key: "dueDate",
        header: "Due Date",
        render: (row) =>
          row.dueDate
            ? new Date(row.dueDate).toLocaleDateString()
            : "-",
        align: "center",
      },
    ],
    []
  );

  /* ---------- Determine Overdue ---------- */
  const isOverdue = useCallback((invoice: Invoice) => {
    if (!invoice.dueDate) return false;
    const today = new Date();
    const due = new Date(invoice.dueDate);
    return due < today && invoice.balance > 0;
  }, []);

  /* ================= Render ================= */
  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">
      {/* ===== Summary ===== */}
      <Summary cardsData={summaryCards} loading={false} />

      {/* ===== Toolbar ===== */}
      <DataTableToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        selectedCount={selectedIds.size}
        onBulkAction={() => setBulkMarkPaidOpen(true)}
        filters={[
          {
            label: "Status",
            value: statusFilter,
            defaultValue: "ALL",
            options: [
              { label: "All", value: "ALL" },
              { label: "Draft", value: "DRAFT" },
              { label: "Issued", value: "ISSUED" },
              { label: "Partially Paid", value: "PARTIALLY_PAID" },
              { label: "Paid", value: "PAID" },
              { label: "Voided", value: "VOIDED" },
            ],
            onChange: setStatusFilter,
          },
        ]}
      />

      {/* ===== Data Table ===== */}
      <DataTable
        data={invoices}
        columns={columns}
        loading={isLoading}
        selectable
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        isAllSelected={isAllSelected}
        isIndeterminate={isIndeterminate}
        onRowClick={(row) => router.push(`/dashboard/invoices/${row.id}`)}
        groupByDate
        getRowDate={(row) => row.issuedAt}
        highlightDate={targetDate || undefined}
        rowClassName={(row) => isOverdue(row) ? "bg-red-100" : ""}
      />

      {/* ===== Pagination ===== */}
      <div className="flex justify-between items-center text-xs">
        <span>Total Invoices: {total}</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>{page} / {pageCount}</span>
          <button disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>

      {/* ===== Confirm Modal ===== */}
      {bulkMarkPaidOpen && (
        <ConfirmModal
          open
          title="Mark invoices as paid"
          message={`Mark ${selectedIds.size} invoice(s) as paid?`}
          onClose={() => setBulkMarkPaidOpen(false)}
          onConfirm={bulkMarkPaid}
        />
      )}
    </div>
  );
}