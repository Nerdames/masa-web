"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import useSWR from "swr";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import Summary, { SummaryCard } from "@/components/ui/Summary";
import DataTableToolbar from "@/components/ui/DataTableToolbar";
import DataTable, { DataTableColumn } from "@/components/ui/DataTable";

import type { VendorFull, VendorAnalytics } from "@/types/vendor";

/* ================= Fetcher ================= */
const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch vendors");
  return res.json() as Promise<{
    summary: {
      totalVendors: number;
      totalRevenue: number;
    };
    leaders: {
      topVendor: VendorAnalytics | null;
      fastestVendor: VendorAnalytics | null;
      bestOverall: VendorAnalytics | null;
    };
    vendors: VendorFull[];
    pagination: { total: number; page: number; totalPages: number; limit: number };
  }>;
};

/* ================= Sort / Filter Types ================= */
type VendorSort = "performance" | "newest" | "oldest" | "highest_spent" | "lowest_spent";
type VendorStatusFilter = "all" | "active" | "inactive";

export default function VendorsPage() {
  const toast = useToast();

  /* ---------------- State ---------------- */
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<VendorStatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<VendorSort>("performance");
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  /* ---------------- Reset Page ---------------- */
  useEffect(() => setPage(1), [debouncedSearch, status, sortOrder]);

  /* ---------------- Data Fetch ---------------- */
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "10");

    if (debouncedSearch) params.set("search", debouncedSearch);
    if (status !== "all") params.set("status", status);
    if (sortOrder) params.set("sort", sortOrder);

    return params.toString();
  }, [page, debouncedSearch, status, sortOrder]);

  const { data, isLoading, mutate } = useSWR(`/api/dashboard/vendors?${query}`, fetcher, {
    keepPreviousData: true,
  });

  const vendors = data?.vendors ?? [];
  const total = data?.pagination?.total ?? 0;
  const pageSize = data?.pagination?.limit ?? 10;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  /* ---------------- Summary Cards ---------------- */
  const summaryCards: SummaryCard[] = useMemo(() => {
    if (!data?.summary) return [];
    return [
      { id: "totalVendors", title: "Total Vendors", value: data.summary.totalVendors },
      {
        id: "totalRevenue",
        title: "Total Revenue",
        value: `₦${data.summary.totalRevenue.toLocaleString()}`,
      },
      { id: "topVendor", title: "Top Vendor", value: data.leaders?.topVendor?.name ?? "-" },
      { id: "fastestVendor", title: "Fastest Vendor", value: data.leaders?.fastestVendor?.name ?? "-" },
      { id: "bestOverall", title: "Best Overall", value: data.leaders?.bestOverall?.name ?? "-" },
    ];
  }, [data]);

  /* ---------------- Memoized Filters ---------------- */
  const filters = useMemo(
    () => [
      {
        label: "Status",
        value: status,
        defaultValue: "all" as VendorStatusFilter,
        options: [
          { label: "All", value: "all" as VendorStatusFilter },
          { label: "Active", value: "active" as VendorStatusFilter },
          { label: "Inactive", value: "inactive" as VendorStatusFilter },
        ],
        onChange: setStatus,
      },
    ],
    [status]
  );

  /* ---------------- Memoized Sort Options ---------------- */
  const sortOptions = useMemo(
    () => [
      { label: "Performance", value: "performance" as VendorSort },
      { label: "Newest", value: "newest" as VendorSort },
      { label: "Oldest", value: "oldest" as VendorSort },
      { label: "Highest Revenue", value: "highest_spent" as VendorSort },
      { label: "Lowest Revenue", value: "lowest_spent" as VendorSort },
    ],
    []
  );

  /* ---------------- Refresh ---------------- */
  const handleRefresh = async () => {
    setRefreshing(true);
    await mutate();
    setRefreshing(false);
  };

  /* ---------------- Columns ---------------- */
  const columns: DataTableColumn<VendorFull>[] = useMemo(
    () => [
      { key: "name", header: "Name", render: (v) => v.name },
      { key: "email", header: "Email", render: (v) => v.email ?? "-" },
      { key: "phone", header: "Phone", render: (v) => v.phone ?? "-" },
      { key: "productsSupplied", header: "Products", render: (v) => v.productsSupplied },
      { key: "totalRevenue", header: "Revenue", render: (v) => `₦${v.totalRevenue.toLocaleString()}` },
      { key: "totalQuantitySold", header: "Sold", render: (v) => v.totalQuantitySold },
      { key: "totalStockValue", header: "Stock Value", render: (v) => `₦${v.totalStockValue.toLocaleString()}` },
      { key: "salesVelocity", header: "Velocity", render: (v) => v.salesVelocity.toFixed(2) },
      { key: "performanceScore", header: "Score", render: (v) => v.performanceScore },
    ],
    []
  );

  /* ---------------- Unique Row IDs ---------------- */
  const resolveRowId = useCallback((row: VendorFull) => row.id, []);

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">
      {/* ---------------- Summary ---------------- */}
      <Summary cardsData={summaryCards} loading={isLoading} />

      {/* ---------------- Toolbar ---------------- */}
      <DataTableToolbar<VendorFull, VendorSort, VendorStatusFilter>
        search={search}
        onSearchChange={setSearch}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        filters={filters}
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
        sortOptions={sortOptions}
        onAdd={() => window.open("/dashboard/vendors/add", "_blank")} // NEW TAB
      />

      {/* ---------------- Data Table ---------------- */}
      <DataTable
        data={vendors}
        columns={columns}
        getRowId={resolveRowId} // ensures each row is unique
        loading={isLoading}
        onRowClick={(v) => window.open(`/dashboard/vendors/${v.id}`, "_blank")} // NEW TAB
      />

      {/* ---------------- Pagination ---------------- */}
      <div className="flex justify-between items-center text-xs pt-2">
        <span>Total: {total}</span>
        <div className="flex gap-3 items-center">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            {page} / {pageCount}
          </span>
          <button
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            className="disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}