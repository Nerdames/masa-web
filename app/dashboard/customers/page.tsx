"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import Summary, { SummaryCard } from "@/components/ui/Summary";
import DataTableToolbar from "@/components/ui/DataTableToolbar";
import DataTable, { DataTableColumn } from "@/components/ui/DataTable";

import type { Customer } from "@/types/customer";

/* ================= Fetcher ================= */
const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch customers");
  return res.json() as Promise<{
    summary: {
      totalCustomers: number;
      totalRevenue: number;
      averageCustomerValue: number;
      topCustomer: Customer | null;
      highestSpendingCustomer: Customer | null;
      mostFrequentCustomer: Customer | null;
    };
    customers: Customer[];
    pagination: { total: number; page: number; totalPages: number; limit: number };
  }>;
};

/* ================= Types ================= */
type StatusFilter = "All" | "BUYER" | "PARTNER";
type CustomerSort = "newest" | "oldest" | "highest_spent" | "lowest_spent";

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "All" },
  { label: "Buyer", value: "BUYER" },
  { label: "Partner", value: "PARTNER" },
];

export default function CustomersPage() {
  const toast = useToast();

  /* ---------------- State ---------------- */
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [sortOrder, setSortOrder] = useState<CustomerSort>("newest");
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  useEffect(() => setPage(1), [debouncedSearch, statusFilter, sortOrder]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "10");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter !== "All") params.set("type", statusFilter);
    if (sortOrder) params.set("sort", sortOrder);
    return params.toString();
  }, [page, debouncedSearch, statusFilter, sortOrder]);

  const { data, isLoading, mutate } = useSWR(`/api/dashboard/customers?${query}`, fetcher, {
    keepPreviousData: true,
  });

  const customers = data?.customers ?? [];
  const total = data?.pagination?.total ?? 0;
  const pageSize = data?.pagination?.limit ?? 10;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  /* ---------------- Date Processing ---------------- */
  const processedCustomers = useMemo(() => {
    return customers.map((c) => {
      const lastOrderStr = c.customerSummaries?.[0]?.lastOrderAt;
      return {
        ...c,
        timelineDate: lastOrderStr ? new Date(lastOrderStr) : null,
      };
    });
  }, [customers]);

  /* ---------------- Summary Cards (Tooltips Retained) ---------------- */
  const summaryCards: SummaryCard[] = useMemo(() => {
    if (!data?.summary) return [];
    const s = data.summary;
    return [
      { 
        id: "totalCustomers", 
        title: "Total Customers", 
        value: s.totalCustomers,
        tooltip: `Total count of registered buyers and partners.`
      },
      { 
        id: "totalRevenue", 
        title: "Total Revenue", 
        value: `₦${s.totalRevenue.toLocaleString()}`,
        tooltip: `Combined lifetime spending: ₦${s.totalRevenue.toFixed(2)}`
      },
      { 
        id: "avgValue", 
        title: "Avg Value", 
        value: `₦${s.averageCustomerValue.toLocaleString()}`,
        tooltip: `Calculated average revenue per customer profile.`
      },
      { 
        id: "topCust", 
        title: "Top Customer", 
        value: s.topCustomer?.name ?? "-",
        tooltip: s.topCustomer ? `Ranked #1 based on frequency and spend.` : "No data available."
      },
      { 
        id: "highSpend", 
        title: "Highest Spender", 
        value: s.highestSpendingCustomer?.name ?? "-",
        tooltip: s.highestSpendingCustomer ? `Highest lifetime spend: ₦${s.highestSpendingCustomer.totalSpent.toLocaleString()}` : "No data available."
      },
      { 
        id: "frequent", 
        title: "Most Frequent", 
        value: s.mostFrequentCustomer?.name ?? "-",
        tooltip: s.mostFrequentCustomer ? `Customer with the highest order volume: ${s.mostFrequentCustomer.totalOrders} orders.` : "No data available."
      },
    ];
  }, [data]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await mutate();
    setRefreshing(false);
  };

  /* ---------------- Columns (hideTooltip: true removes the black dot) ---------------- */
  const columns: DataTableColumn<any>[] = useMemo(
    () => [
      { key: "name", header: "Name", render: (c) => c.name },
      { key: "email", header: "Email", render: (c) => c.email ?? "-", align: "left" },
      { 
        key: "type", 
        header: "Type", 
        hideTooltip: true, // Prevents automatic DataTable tooltip wrapper
        render: (c) => (
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
            {c.type}
          </span>
        ) 
      },
      { 
        key: "totalOrders", 
        header: "Orders", 
        align: "center", 
        hideTooltip: true, // Prevents automatic DataTable tooltip wrapper
        render: (c) => (
          <span className="font-mono">
            {c.totalOrders}
          </span>
        ) 
      },
      { 
        key: "totalSpent", 
        header: "Spent", 
        align: "right", 
        hideTooltip: true, // Prevents automatic DataTable tooltip wrapper
        render: (c) => (
          <span className="font-medium text-green-600">
            ₦{c.totalSpent.toLocaleString()}
          </span>
        ) 
      },
    ],
    []
  );

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">
      <Summary cardsData={summaryCards} loading={isLoading} />

      <DataTableToolbar<Customer, CustomerSort, StatusFilter>
        search={search}
        onSearchChange={setSearch}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
        sortOptions={[
          { label: "Newest Joined", value: "newest" },
          { label: "Oldest Joined", value: "oldest" },
          { label: "Highest Spent", value: "highest_spent" },
          { label: "Lowest Spent", value: "lowest_spent" },
        ]}
        filters={[
          {
            label: "Type",
            value: statusFilter,
            defaultValue: "All",
            options: STATUS_OPTIONS,
            onChange: (val) => setStatusFilter(val as StatusFilter),
          },
        ]}
        exportData={processedCustomers}
        exportFileName="customers.csv"
        onAdd={() => window.open("/dashboard/customers/add", "_blank")}
      />

      <DataTable<Customer>
        data={processedCustomers}
        columns={columns}
        tableId="customers-table-details"
        getRowId={(row) => row.id}
        loading={isLoading}
        onRowClick={(c) => window.open(`/dashboard/customers/${c.id}`, "_blank")}
        dateField="timelineDate" 
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