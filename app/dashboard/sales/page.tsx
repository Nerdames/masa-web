"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import { useRouter, usePathname } from "next/navigation";

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

type PaymentFilter = "ALL" | "CASH" | "CARD" | "BANK_TRANSFER" | "MOBILE_MONEY" | "POS";
type StatusFilter = "ALL" | "PENDING" | "COMPLETED" | "CANCELLED";

/* ================= Fetcher ================= */

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((res) => res.json());

/* ================= Component ================= */

export default function SalesPage() {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();

  /* ---------- State ---------- */

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  // Reset page on filter change
  useEffect(() => setPage(1), [debouncedSearch, paymentFilter, statusFilter]);

  /* ---------- Query (memoized) ---------- */

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");

    if (debouncedSearch) params.set("search", debouncedSearch);
    if (paymentFilter !== "ALL") params.set("paymentMethod", paymentFilter);
    if (statusFilter !== "ALL") params.set("status", statusFilter);

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
  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / 10)), [total]);

  /* ---------- Summary ---------- */

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

  /* ---------- Status Styling (Pill Backgrounds) ---------- */

  const statusClass = useCallback((status?: Sale["status"]) => {
    switch (status) {
      case "COMPLETED":
        return "bg-green-100 text-green-700";
      case "PENDING":
        return "bg-yellow-100 text-yellow-700";
      case "CANCELLED":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  }, []);

  /* ---------- Columns ---------- */

  const columns: DataTableColumn<Sale>[] = useMemo(
    () => [
      { key: "product", header: "Product", render: (s) => s.productName ?? "-" },
      { key: "customer", header: "Customer", render: (s) => s.customerName ?? "-" },
      { 
        key: "quantity", 
        header: "Quantity", 
        align: "center", 
        hideTooltip: true,
        render: (s) => <span className="font-mono">{s.quantity}</span> 
      },
      { 
        key: "total", 
        header: "Total", 
        align: "right", 
        hideTooltip: true,
        render: (s) => (
            <span className="font-medium text-green-600">
                ₦{s.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
        ) 
      },
      { key: "currency", header: "Currency", render: (s) => s.currency },
      { key: "payment", header: "Payment", render: (s) => s.paymentMethods?.join(", ") ?? "-" },
      {
        key: "status",
        header: "Status",
        hideTooltip: true,
        align: "center",
        render: (s) => (
          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusClass(s.status)}`}>
            {s.status}
          </span>
        ),
      },
    ],
    [statusClass]
  );

  /* ---------- Refresh ---------- */

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await mutate();
    setRefreshing(false);
  }, [mutate]);

  const tableId = useMemo(() => pathname ? pathname.replace(/^\//, "").replace(/\//g, "-") : "sales-table", [pathname]);

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4 overflow-y-auto">
      <Summary cardsData={summaryCards} loading={isLoading} />

      <DataTableToolbar<Sale, string, string>
        search={search}
        onSearchChange={setSearch}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        filters={[
          {
            label: "Payment",
            value: paymentFilter,
            defaultValue: "ALL",
            onChange: (val) => setPaymentFilter(val as PaymentFilter),
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
            defaultValue: "ALL",
            onChange: (val) => setStatusFilter(val as StatusFilter),
            options: [
              { value: "ALL", label: "All" },
              { value: "PENDING", label: "Pending" },
              { value: "COMPLETED", label: "Completed" },
              { value: "CANCELLED", label: "Cancelled" },
            ],
          },
        ]}
        exportData={sales}
        exportFileName="sales.csv"
        onAdd={() => router.push("/dashboard/sales/add")}
      />

      <DataTable<Sale>
        tableId={tableId}
        data={sales}
        columns={columns}
        loading={isLoading}
        getRowId={(row) => row.id}
        onRowClick={(sale) => {
          if (sale.status !== "CANCELLED")
            router.push(`/dashboard/sales/${sale.id}`);
        }}
        dateField="createdAt"
      />

      {/* Pagination Footer */}
      <div className="flex justify-between items-center text-xs pt-2">
        <span className="opacity-50 text-[10px] font-bold uppercase tracking-tighter">
          Total Records: {total}
        </span>
        <div className="flex gap-4 items-center">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="hover:text-blue-500 disabled:opacity-30 transition-colors uppercase font-bold tracking-tighter"
          >
            Prev
          </button>
          <span className="font-mono">{page} / {pageCount}</span>
          <button
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            className="hover:text-blue-500 disabled:opacity-30 transition-colors uppercase font-bold tracking-tighter"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}