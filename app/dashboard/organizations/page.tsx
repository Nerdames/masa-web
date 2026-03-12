"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import Summary, { SummaryCard } from "@/components/ui/Summary";
import DataTableToolbar from "@/components/ui/DataTableToolbar";
import DataTable, { DataTableColumn } from "@/components/ui/DataTable";

/* ================= Types ================= */
type OrgStatus = "All" | "Active" | "Inactive";
type OrgSort = "newest" | "oldest" | "name_asc" | "name_desc";

interface OrganizationData {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  owner?: { name: string; email: string } | null;
  _count: {
    branches: number;
    personnel: number;
    sales: number;
  };
}

interface ApiResponse {
  summary: {
    totalOrganizations: number;
    activeCount: number;
    inactiveCount: number;
    totalBranches: number;
    newestOrg: string | null;
  };
  data: OrganizationData[];
  total: number;
  pageSize: number;
}

/* ================= Fetcher ================= */
const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) throw new Error("Access Denied: DEV Only");
    throw new Error("Failed to fetch organizations");
  }
  return res.json() as Promise<ApiResponse>;
};

const STATUS_OPTIONS: { label: string; value: OrgStatus }[] = [
  { label: "All Statuses", value: "All" },
  { label: "Active", value: "Active" },
  { label: "Inactive", value: "Inactive" },
];

export default function OrganizationPage() {
  const toast = useToast();

  /* ---------------- State ---------------- */
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrgStatus>("All");
  const [sortOrder, setSortOrder] = useState<OrgSort>("newest");
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  // Reset page on filter change
  useEffect(() => setPage(1), [debouncedSearch, statusFilter, sortOrder]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter !== "All") params.set("active", statusFilter === "Active" ? "true" : "false");
    if (sortOrder) params.set("sort", sortOrder);
    return params.toString();
  }, [page, debouncedSearch, statusFilter, sortOrder]);

  const { data, isLoading, mutate, error } = useSWR(`/api/organizations?${query}`, fetcher, {
    keepPreviousData: true,
  });

  // Handle unauthorized or dev-only error
  useEffect(() => {
    if (error) toast.addToast({ type: "error", message: error.message });
  }, [error, toast]);

  const organizations = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / (data?.pageSize ?? 10)));

  /* ---------------- Summary Cards ---------------- */
  const summaryCards: SummaryCard[] = useMemo(() => {
    if (!data?.summary) return [];
    const s = data.summary;
    return [
      { 
        id: "totalOrg", 
        title: "Total Organizations", 
        value: s.totalOrganizations,
        tooltip: "Total count of organizations on the platform."
      },
      { 
        id: "activeOrg", 
        title: "Active", 
        value: s.activeCount,
        color: "text-green-600",
        tooltip: "Organizations currently permitted to process transactions."
      },
      { 
        id: "inactiveOrg", 
        title: "Inactive", 
        value: s.inactiveCount,
        color: "text-gray-400",
        tooltip: "Deactivated organizations with restricted access."
      },
      { 
        id: "branches", 
        title: "Total Branches", 
        value: s.totalBranches,
        tooltip: "Total footprint of all organization branches."
      },
      { 
        id: "newest", 
        title: "Latest Entry", 
        value: s.newestOrg ?? "-",
        tooltip: "The most recently registered organization name."
      },
    ];
  }, [data]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await mutate();
    setRefreshing(false);
  };

  /* ---------------- Columns ---------------- */
  const columns: DataTableColumn<OrganizationData>[] = useMemo(
    () => [
      { key: "name", header: "Organization", render: (o) => o.name },
      { 
        key: "owner", 
        header: "Owner", 
        render: (o) => (
          <div className="flex flex-col">
            <span className="font-medium">{o.owner?.name ?? "No Owner"}</span>
            <span className="text-[10px] opacity-50">{o.owner?.email ?? "—"}</span>
          </div>
        ) 
      },
      { 
        key: "branches", 
        header: "Branches", 
        align: "center", 
        hideTooltip: true,
        render: (o) => <span className="font-mono">{o._count.branches}</span> 
      },
      { 
        key: "personnel", 
        header: "Staff", 
        align: "center", 
        hideTooltip: true,
        render: (o) => <span className="font-mono">{o._count.personnel}</span> 
      },
      { 
        key: "status", 
        header: "Status", 
        align: "right",
        hideTooltip: true,
        render: (o) => (
          <span className={`text-[10px] font-bold uppercase tracking-widest ${o.active ? "text-green-600" : "text-red-400"}`}>
            {o.active ? "Active" : "Inactive"}
          </span>
        ) 
      },
    ],
    []
  );

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh)] p-4 bg-white">
      
      <Summary cardsData={summaryCards} loading={isLoading} />

      <DataTableToolbar<OrganizationData, OrgSort, OrgStatus>
        search={search}
        onSearchChange={setSearch}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
        sortOptions={[
          { label: "Newest", value: "newest" },
          { label: "Oldest", value: "oldest" },
          { label: "Name (A-Z)", value: "name_asc" },
          { label: "Name (Z-A)", value: "name_desc" },
        ]}
        filters={[
          {
            label: "Status",
            value: statusFilter,
            defaultValue: "All",
            options: STATUS_OPTIONS,
            onChange: (val) => setStatusFilter(val as OrgStatus),
          },
        ]}
        exportData={organizations}
        exportFileName="organizations_list.csv"
        onAdd={() => window.open("/dashboard/organizations/new", "_blank")}
      />

      <DataTable<OrganizationData>
        data={organizations}
        columns={columns}
        tableId="org-management-table"
        getRowId={(row) => row.id}
        loading={isLoading}
        onRowClick={(o) => window.open(`/dashboard/organizations/${o.id}`, "_blank")}
        dateField="createdAt" 
      />

      {/* Pagination Footer */}
      <div className="flex justify-between items-center text-xs pt-2">
        <span className="opacity-50 text-[10px] font-bold uppercase tracking-tighter">
          Total Organizations: {total}
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