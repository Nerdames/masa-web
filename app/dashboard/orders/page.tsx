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
  const { addToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();

  /* ---------- State ---------- */

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus>("ALL");
  const [targetDate, setTargetDate] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  // Reset page on filter change
  useEffect(() => setPage(1), [debouncedSearch, statusFilter, targetDate]);

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

  const { data, error, isLoading, mutate } = useSWR<OrdersResponse>(
    `/api/dashboard/orders?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  useEffect(() => {
    if (error) addToast({ type: "error", message: "Failed to fetch orders" });
  }, [error, addToast]);

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  /* ---------- Summary ---------- */

  const summaryCards: SummaryCard[] = useMemo(() => {
    const draftCount = orders.filter(o => o.status === "DRAFT").length;
    const submittedCount = orders.filter(o => o.status === "SUBMITTED").length;

    return [
      { id: "total", title: "Total Orders", value: total || 0 },
      { id: "draft", title: "Draft Orders", value: draftCount || 0 },
      { 
        id: "submitted", 
        title: "Submitted", 
        value: submittedCount || 0,
        color: "text-green-600" 
      },
    ];
  }, [orders, total]);

  /* ---------- Actions ---------- */

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await mutate();
    setRefreshing(false);
  }, [mutate]);

  /* ---------- Table Config ---------- */

  const statusStyles = (status: Order["status"]) => {
    switch (status) {
      case "SUBMITTED": return "bg-green-100 text-green-700";
      case "DRAFT": return "bg-gray-100 text-gray-700";
      case "CANCELLED": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const columns: DataTableColumn<Order>[] = useMemo(() => [
    {
      key: "id",
      header: "Order ID",
      hideTooltip: true,
      render: o => <span className="text-[11px] font-bold">#{o.id.slice(-6).toUpperCase()}</span>,
    },
    {
      key: "customer",
      header: "Customer",
      render: o => o.customer?.name ?? "Walk-in Customer",
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      hideTooltip: true,
      render: o => (
        <span className="font-medium text-green-600">
          ₦{o.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: "items",
      header: "Items",
      align: "center",
      hideTooltip: true,
      render: o => <span>{o.items.length}</span>,
    },
    {
      key: "invoice",
      header: "Invoice",
      align: "center",
      hideTooltip: true,
      render: o => o.invoice ? (
        <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">Issued</span>
      ) : (
        <span className="opacity-30 text-[10px]">Pending</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      hideTooltip: true,
      render: o => (
        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusStyles(o.status)}`}>
          {o.status}
        </span>
      ),
    },
  ], []);

  const tableId = useMemo(() => pathname?.replace(/\//g, "-").replace(/^-/, "") || "orders-table", [pathname]);

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4 overflow-y-auto">
      <Summary cardsData={summaryCards} loading={isLoading} />

      <DataTableToolbar
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
            defaultValue: "ALL",
            options: [
              { value: "ALL", label: "All Status" },
              { value: "DRAFT", label: "Draft" },
              { value: "SUBMITTED", label: "Submitted" },
              { value: "CANCELLED", label: "Cancelled" },
            ],
            onChange: (val) => setStatusFilter(val as OrderStatus),
          },
        ]}
        onAdd={() => router.push("/dashboard/orders/add")}
      />

      <DataTable<Order>
        tableId={tableId}
        data={orders}
        columns={columns}
        loading={isLoading}
        onRowClick={order => {
          if (order.status !== "CANCELLED") {
            router.push(`/dashboard/orders/${order.id}`);
          }
        }}
        dateField="createdAt"
      />

      <div className="flex justify-between items-center text-xs pt-2">
        <span className="opacity-50 text-[10px] font-bold uppercase tracking-tighter">
          Total Records: {total}
        </span>
        <div className="flex gap-4 items-center">
          <button
            disabled={page <= 1 || isLoading}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="hover:text-blue-500 disabled:opacity-30 transition-colors uppercase font-bold tracking-tighter"
          >
            Prev
          </button>
          <span className="bg-gray-100 px-2 py-0.5 rounded text-[10px]">
            {page} / {pageCount}
          </span>
          <button
            disabled={page >= pageCount || isLoading}
            onClick={() => setPage(p => Math.min(pageCount, p + 1))}
            className="hover:text-blue-500 disabled:opacity-30 transition-colors uppercase font-bold tracking-tighter"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}