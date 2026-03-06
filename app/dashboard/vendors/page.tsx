"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import useSWR from "swr";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import { usePathname } from "next/navigation";

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
type VendorSort = "Performance" | "Newest" | "Oldest" | "Highest Revenue" | "Lowest Revenue";
type VendorStatusFilter = "All" | "Active" | "Inactive";

export default function VendorsPage() {
  const { addToast } = useToast();
  const pathname = usePathname();

  /* ---------------- State ---------------- */
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<VendorStatusFilter>("All");
  const [sortOrder, setSortOrder] = useState<VendorSort>("Performance");
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
    if (status !== "All") params.set("status", status);
    if (sortOrder) params.set("sort", sortOrder);

    return params.toString();
  }, [page, debouncedSearch, status, sortOrder]);

  const { data, error, isLoading, mutate } = useSWR(`/api/dashboard/vendors?${query}`, fetcher, {
    keepPreviousData: true,
  });

  useEffect(() => {
    if (error) addToast({ type: "error", message: "Failed to fetch vendors" });
  }, [error, addToast]);

  const vendors = data?.vendors ?? [];
  const total = data?.pagination?.total ?? 0;
  const pageSize = data?.pagination?.limit ?? 10;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  /* ---------------- Summary Cards ---------------- */
  const summaryCards: SummaryCard[] = useMemo(() => {
    const summary = data?.summary;
    const leaders = data?.leaders;

    return [
      { 
        id: "totalVendors", 
        title: "Total Vendors", 
        value: summary?.totalVendors ?? 0 
      },
      {
        id: "totalRevenue",
        title: "Total Revenue",
        value: `₦${(summary?.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      },
      { 
        id: "topVendor", 
        title: "Top Vendor", 
        value: leaders?.topVendor?.name || "N/A" 
      },
      { 
        id: "fastestVendor", 
        title: "Fastest Vendor", 
        value: leaders?.fastestVendor?.name || "N/A" 
      },
      { 
        id: "bestOverall", 
        title: "Best Overall", 
        value: leaders?.bestOverall?.name || "N/A" 
      },
    ];
  }, [data]);

  /* ---------------- Actions ---------------- */
  const handleRefresh = async () => {
    setRefreshing(true);
    await mutate();
    setRefreshing(false);
  };

  /* ---------------- Columns ---------------- */
  const columns: DataTableColumn<VendorFull>[] = useMemo(
    () => [
      { key: "name", header: "NAME", render: (v) => v.name },
      { key: "email", header: "EMAIL", render: (v) => v.email ?? "-" },
      { 
        key: "totalRevenue", 
        header: "REVENUE", 
        align: "right",
        hideTooltip: true,
        render: (v) => (
          <span className="font-medium text-green-600">
            ₦{v.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        ) 
      },
      { 
        key: "totalStockValue", 
        header: "STOCK VALUE", 
        align: "right",
        hideTooltip: true,
        render: (v) => `₦${v.totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}` 
      },
      { 
        key: "productsSupplied", 
        header: "PRODUCTS", 
        align: "center",
        hideTooltip: true,
        render: (v) => v.productsSupplied 
      },
      { 
        key: "totalQuantitySold", 
        header: "SOLD", 
        align: "center",
        hideTooltip: true,
        render: (v) => v.totalQuantitySold 
      },
      { 
        key: "salesVelocity", 
        header: "VELOCITY", 
        align: "center",
        hideTooltip: true,
        render: (v) => v.salesVelocity.toFixed(2) 
      },
      { 
        key: "performanceScore", 
        header: "SCORE", 
        align: "center",
        render: (v) => v.performanceScore 
      },
    ],
    []
  );

  const tableId = useMemo(() => pathname?.replace(/\//g, "-").replace(/^-/, "") || "vendors-table", [pathname]);

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4 overflow-y-auto">
      <Summary cardsData={summaryCards} loading={isLoading} />

      <DataTableToolbar<VendorFull, VendorSort, VendorStatusFilter>
        search={search}
        onSearchChange={setSearch}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        filters={[
          {
            label: "STATUS",
            value: status,
            defaultValue: "All",
            options: [
              { label: "All Status", value: "All" },
              { label: "Active", value: "Active" },
              { label: "Inactive", value: "Inactive" },
            ],
            onChange: (val) => setStatus(val as VendorStatusFilter),
          },
        ]}
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
        sortOptions={[
          { label: "Performance", value: "Performance" },
          { label: "Newest", value: "Newest" },
          { label: "Oldest", value: "Oldest" },
          { label: "Highest Revenue", value: "Highest Revenue" },
          { label: "Lowest Revenue", value: "Lowest Revenue" },
        ]}
        onAdd={() => window.open("/dashboard/vendors/add", "_blank")}
      />

      <DataTable
        tableId={tableId}
        data={vendors}
        columns={columns}
        getRowId={(row) => row.id}
        loading={isLoading}
        onRowClick={(v) => window.open(`/dashboard/vendors/${v.id}`, "_blank")}
      />

      <div className="flex justify-between items-center text-xs pt-2">
        <span className="opacity-50 text-[10px] font-bold uppercase tracking-tighter">
          TOTAL RECORDS: {total}
        </span>
        <div className="flex gap-4 items-center">
          <button
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="hover:text-blue-500 disabled:opacity-30 transition-colors uppercase font-bold tracking-tighter"
          >
            PREV
          </button>
          <span className="bg-gray-100 px-2 py-0.5 rounded text-[10px] font-bold">
            {page} / {pageCount}
          </span>
          <button
            disabled={page >= pageCount || isLoading}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            className="hover:text-blue-500 disabled:opacity-30 transition-colors uppercase font-bold tracking-tighter"
          >
            NEXT
          </button>
        </div>
      </div>
    </div>
  );
}