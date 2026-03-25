"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import useSWR from "swr";
import { useDebounce } from "@/core/hooks/useDebounce";
import { useToast } from "@/core/components/feedback/ToastProvider";
import DataTableToolbar from "@/core/components/ui/DataTableToolbar";
import DataTable, { DataTableColumn } from "@/core/components/ui/DataTable";
import Summary, { SummaryCard } from "@/core/components/ui/Summary";
import { useRouter, usePathname } from "next/navigation";

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
  const { addToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();

  /* ---------- State ---------- */
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | InvoiceStatus>("ALL");
  const [targetDate] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  // Reset page on filter/search change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, targetDate]);

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
    if (error) addToast({ type: "error", message: "Failed to fetch invoices" });
  }, [error, addToast]);

  const invoices = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / 10)), [total]);

  /* ---------- Summary ---------- */
  const summaryCards: SummaryCard[] = useMemo(() => {
    const paidCount = invoices.filter((i) => i.status === "PAID").length;
    const unpaidCount = invoices.filter((i) => i.status !== "PAID").length;

    return [
      { id: "total", title: "Total Invoices", value: total },
      { id: "paid", title: "Paid Invoices", value: paidCount },
      { 
        id: "unpaid", 
        title: "Unpaid/Partial", 
        value: unpaidCount,
        color: unpaidCount > 0 ? "text-orange-600" : "text-green-600" 
      },
    ];
  }, [invoices, total]);

  /* ---------- Actions ---------- */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await mutate();
    setRefreshing(false);
  }, [mutate]);

  /* ---------- Table Styling ---------- */
  const statusStyles = useCallback((status: InvoiceStatus) => {
    switch (status) {
      case "PAID": return "bg-green-100 text-green-700";
      case "PARTIALLY_PAID": return "bg-blue-100 text-blue-700";
      case "ISSUED": return "bg-yellow-100 text-yellow-700";
      case "VOIDED": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  }, []);

  /* ---------- Columns ---------- */
  const columns: DataTableColumn<Invoice>[] = useMemo(
    () => [
      {
        key: "id",
        header: "Invoice",
        render: (row) => <span className="font-mono text-[11px] font-bold">#{row.id.slice(-6).toUpperCase()}</span>,
      },
      {
        key: "buyer",
        header: "Buyer",
        render: (row) => row.buyerName ?? "Walk-in Customer",
      },
      {
        key: "total",
        header: "Total Amount",
        align: "right",
        hideTooltip: true,
        render: (row) => (
          <span className="font-medium text-green-600">
            ₦{row.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ),
      },
      {
        key: "balance",
        header: "Balance",
        align: "right",
        hideTooltip: true,
        render: (row) => (
          <span className={` ${row.balance > 0 ? "text-red-500 font-medium" : "opacity-50"}`}>
            ₦{row.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        align: "center",
        hideTooltip: true,
        render: (row) => (
          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusStyles(row.status)}`}>
            {row.status.replace("_", " ")}
          </span>
        ),
      },
      {
        key: "dueDate",
        header: "Due Date",
        align: "center",
        render: (row) => row.dueDate ? new Date(row.dueDate).toLocaleDateString() : "-",
      },
    ],
    [statusStyles]
  );

  const tableId = useMemo(() => pathname?.replace(/\//g, "-").replace(/^-/, "") || "invoices-table", [pathname]);

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh)] p-4 bg-white">
      <Summary cardsData={summaryCards} />

      <DataTableToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        filters={[
          {
            label: "Status",
            value: statusFilter,
            defaultValue: "ALL",
            options: [
              { label: "All Status", value: "ALL" },
              { label: "Draft", value: "DRAFT" },
              { label: "Issued", value: "ISSUED" },
              { label: "Partially Paid", value: "PARTIALLY_PAID" },
              { label: "Paid", value: "PAID" },
              { label: "Voided", value: "VOIDED" },
            ],
            onChange: (val) => setStatusFilter(val as "ALL" | InvoiceStatus),
          },
        ]}
      />

      <DataTable
        tableId={tableId}
        data={invoices}
        columns={columns}
        loading={isLoading}
        onRowClick={(row) => window.open(`/dashboard/invoices/${row.id}`, "_blank")}
        dateField="issuedAt"
        rowClassName={(row) => {
          const isOverdue = row.dueDate && new Date(row.dueDate) < new Date() && row.balance > 0;
          return isOverdue ? "bg-red-50/50" : "";
        }}
      />
    </div>
  );
}