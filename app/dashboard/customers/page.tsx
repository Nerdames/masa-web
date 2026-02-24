"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import Summary, { SummaryCard } from "@/components/ui/Summary";
import DataTableToolbar from "@/components/ui/DataTableToolbar";
import DataTable, { DataTableColumn } from "@/components/ui/DataTable";
import { useRouter } from "next/navigation";

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

type StatusFilter = "all" | "regular" | "vip";

/* ✅ Sort type */
type CustomerSort =
  | "newest"
  | "oldest"
  | "highest_spent"
  | "lowest_spent";

export default function CustomersPage() {
  const toast = useToast();
  const router = useRouter();

  /* ---------------- State ---------------- */
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<CustomerSort>("newest"); // ✅ Added
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  /* ---------------- Reset Page / Selection ---------------- */
  useEffect(() => setPage(1), [debouncedSearch, status, sortOrder]); // ✅ include sort
  useEffect(() => setSelectedIds(new Set()), [page]);

  /* ---------------- Data Fetch ---------------- */
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "10");

    if (debouncedSearch) params.set("search", debouncedSearch);
    if (status !== "all") params.set("status", status);
    if (sortOrder) params.set("sort", sortOrder); // ✅ include sort

    return params.toString();
  }, [page, debouncedSearch, status, sortOrder]);

  const { data, isLoading, mutate } = useSWR(
    `/api/dashboard/customers?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  const customers = data?.customers ?? [];
  const total = data?.pagination?.total ?? 0;
  const pageSize = data?.pagination?.limit ?? 10;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  /* ---------------- Summary Cards ---------------- */
  const summaryCards: SummaryCard[] = useMemo(() => {
    if (!data?.summary) return [];
    return [
      { id: "totalCustomers", title: "Total Customers", value: data.summary.totalCustomers },
      {
        id: "totalRevenue",
        title: "Total Revenue",
        value: `₦${data.summary.totalRevenue.toLocaleString()}`,
      },
      {
        id: "averageValue",
        title: "Avg Customer Value",
        value: `₦${data.summary.averageCustomerValue.toLocaleString()}`,
      },
      {
        id: "topCustomer",
        title: "Top Customer",
        value: data.summary.topCustomer?.name ?? "-",
      },
      {
        id: "highestSpender",
        title: "Highest Spender",
        value: data.summary.highestSpendingCustomer?.name ?? "-",
      },
      {
        id: "mostFrequent",
        title: "Most Frequent",
        value: data.summary.mostFrequentCustomer?.name ?? "-",
      },
    ];
  }, [data]);

  /* ---------------- Memoized Filters ---------------- */
  const filters = useMemo(
    () => [
      {
        label: "Status",
        value: status,
        defaultValue: "all" as StatusFilter,
        options: [
          { label: "All", value: "all" as StatusFilter },
          { label: "Regular", value: "regular" as StatusFilter },
          { label: "VIP", value: "vip" as StatusFilter },
        ],
        onChange: setStatus,
      },
    ],
    [status]
  );

  /* ✅ Memoized Sort Options */
  const sortOptions = useMemo(
    () => [
      { label: "Newest", value: "newest" as CustomerSort },
      { label: "Oldest", value: "oldest" as CustomerSort },
      { label: "Highest Spent", value: "highest_spent" as CustomerSort },
      { label: "Lowest Spent", value: "lowest_spent" as CustomerSort },
    ],
    []
  );

  /* ---------------- Selection ---------------- */
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected = customers.every((c) => prev.has(c.id));
      return allSelected ? new Set() : new Set(customers.map((c) => c.id));
    });
  }, [customers]);

  const isAllSelected =
    customers.length > 0 && customers.every((c) => selectedIds.has(c.id));

  const isIndeterminate =
    selectedIds.size > 0 && !isAllSelected;

  /* ---------------- Bulk Delete ---------------- */
  const bulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;

    try {
      const res = await fetch(`/api/dashboard/customers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      if (!res.ok) throw new Error();

      toast.addToast({ type: "success", message: `${ids.length} customers removed` });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      mutate();
    } catch {
      toast.addToast({ type: "error", message: "Bulk delete failed" });
    }
  };

  /* ---------------- Refresh ---------------- */
  const handleRefresh = async () => {
    setRefreshing(true);
    await mutate();
    setRefreshing(false);
  };

  /* ---------------- Columns ---------------- */
  const columns: DataTableColumn<Customer>[] = useMemo(
    () => [
      { key: "name", header: "Name", render: (c) => c.name },
      { key: "email", header: "Email", render: (c) => c.email ?? "-" },
      { key: "phone", header: "Phone", render: (c) => c.phone ?? "-" },
      { key: "type", header: "Type", render: (c) => c.type },
      { key: "totalOrders", header: "Orders", render: (c) => c.totalOrders },
      { key: "totalSpent", header: "Spent", render: (c) => `₦${c.totalSpent.toLocaleString()}` },
      { key: "performanceScore", header: "Score", render: (c) => c.performanceScore },
      { key: "segment", header: "Segment", render: (c) => c.segment },
      {
        key: "lastPurchaseAt",
        header: "Last Purchase",
        render: (c) =>
          c.lastPurchaseAt
            ? new Date(c.lastPurchaseAt).toLocaleDateString()
            : "-",
      },
    ],
    []
  );

  const resolveRowId = useCallback((row: Customer) => row.id, []);

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">
      <Summary cardsData={summaryCards} loading={isLoading} />

      <DataTableToolbar<Customer, CustomerSort, StatusFilter>
        search={search}
        onSearchChange={setSearch}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        filters={filters}
        sortOrder={sortOrder}             
        onSortChange={setSortOrder}      
        sortOptions={sortOptions}         
        selectedCount={selectedIds.size}
        onBulkAction={() => setBulkDeleteOpen(true)}
        onAdd={() => router.push("/dashboard/customers/add")}
      />

      <DataTable
        data={customers}
        columns={columns}
        selectable
        selectedIds={selectedIds}
        getRowId={resolveRowId}
        isAllSelected={isAllSelected}
        isIndeterminate={isIndeterminate}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        loading={isLoading}
        onRowClick={(c) => router.push(`/dashboard/customers/${c.id}`)}
      />

      {bulkDeleteOpen && (
        <ConfirmModal
          open
          title="Delete Customers"
          message={`Remove ${selectedIds.size} selected customers?`}
          destructive
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={bulkDelete}
        />
      )}
    </div>
  );
}