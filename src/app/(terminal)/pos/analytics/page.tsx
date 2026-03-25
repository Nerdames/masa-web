"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import useSWR from "swr";
import { useDebounce } from "@/core/hooks/useDebounce";
import { useToast } from "@/core/components/feedback/ToastProvider";
import { useRouter, usePathname } from "next/navigation";

import Summary, { SummaryCard } from "@/core/components/ui/Summary";
import DataTable, { DataTableColumn } from "@/core/components/ui/DataTable";
import DataTableToolbar from "@/core/components/ui/DataTableToolbar";

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
type DensityOption = "standard" | "compact";

/* ================= Fetcher ================= */

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((res) => res.json());

/* ================= Component ================= */

export default function SalesPage() {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();

  /* ---------- State ---------- */

  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [refreshing, setRefreshing] = useState(false);
  const [rowDensity, setRowDensity] = useState<DensityOption>("standard");

  const debouncedSearch = useDebounce(search, 400);

  /* ---------- Query ---------- */

  const query = useMemo(() => {
    const params = new URLSearchParams();

    params.set("page", "1");
    params.set("pageSize", "1000");

    if (debouncedSearch) params.set("search", debouncedSearch);
    if (paymentFilter !== "ALL") params.set("paymentMethod", paymentFilter);
    if (statusFilter !== "ALL") params.set("status", statusFilter);

    return params.toString();
  }, [debouncedSearch, paymentFilter, statusFilter]);

  /* ---------- Fetch ---------- */

  const { data, error, isLoading, mutate } = useSWR<{ sales: Sale[] }>(
    `/api/dashboard/sales?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  useEffect(() => {
    if (error) {
      toast.addToast({
        type: "error",
        message: "Failed to fetch sales",
      });
    }
  }, [error, toast]);

  const sales = data?.sales ?? [];

  /* ---------- Summary ---------- */

  const { pendingCount, completedCount } = useMemo(() => {
    let pending = 0;
    let completed = 0;

    for (const s of sales) {
      if (s.status === "PENDING") pending++;
      if (s.status === "COMPLETED") completed++;
    }

    return {
      pendingCount: pending,
      completedCount: completed,
    };
  }, [sales]);

  const summaryCards: SummaryCard[] = useMemo(
    () => [
      { id: "totalSales", title: "Total Sales", value: sales.length },
      { id: "pendingSales", title: "Pending Sales", value: pendingCount },
      { id: "completedSales", title: "Completed Sales", value: completedCount },
    ],
    [sales.length, pendingCount, completedCount]
  );

  /* ---------- Status Styling ---------- */

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
        hideTooltip: true,
        render: (s) => <span className="font-mono">{s.quantity}</span>,
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
        ),
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
        align: "center",
        hideTooltip: true,
        render: (s) => (
          <span
            className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusClass(
              s.status
            )}`}
          >
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

  /* ---------- Table ID ---------- */

  const tableId = useMemo(() => {
    return pathname?.replaceAll("/", "-") || "sales-table";
  }, [pathname]);

  /* ---------- Render ---------- */

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh)] p-4 bg-white">

      <Summary cardsData={summaryCards}/>

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
        extraControls={
          <div className="flex gap-2">
            <button
              className={`px-3 py-1 rounded border ${
                rowDensity === "standard"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-black"
              }`}
              onClick={() => setRowDensity("standard")}
            >
              Standard
            </button>

            <button
              className={`px-3 py-1 rounded border ${
                rowDensity === "compact"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-black"
              }`}
              onClick={() => setRowDensity("compact")}
            >
              Compact
            </button>
          </div>
        }
        exportData={sales}
        exportFileName="sales.csv"
        onAdd={() => window.open("/dashboard/sales/create", "_blank")}
      />

      <DataTable<Sale>
        tableId={tableId}
        tablePrefsKey="sales-table"
        data={sales}
        columns={columns}
        loading={isLoading}
        getRowId={(row) => row.id}
        tablePrefs={{
          table_row_numbers: true,
          table_group_dates: true,
        }}
        dateField="createdAt"
        rowDensity={rowDensity}
        onRowClick={(sale) => {
          if (sale.status !== "CANCELLED") {
            window.open(`/dashboard/sales/${sale.id}`, "_blank");
          }
        }}
      />
    </div>
  );
}