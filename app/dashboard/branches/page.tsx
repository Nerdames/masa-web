"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import Summary, { SummaryCard } from "@/components/ui/Summary";
import DataTableToolbar from "@/components/ui/DataTableToolbar";
import DataTable, { DataTableColumn } from "@/components/ui/DataTable";
import AccessDenied from "@/components/feedback/AccessDenied";
import { useSession } from "next-auth/react";

/* -------------------- TYPES -------------------- */

interface BranchPersonnel {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

interface BranchWithDetails {
  id: string;
  organizationId: string;
  name: string;
  location: string | null;
  active: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  personnel: BranchPersonnel[];

  personnelCount: number;
  productCount: number;
  orderCount: number;
  salesTotal: number;

  receiptsCount: number;
  notificationsCount: number;
  activityLogsCount: number;
}

interface BranchListResponse {
  branches: BranchWithDetails[];
  total: number;
  pageSize: number;
}

/* -------------------- FETCHER -------------------- */

const fetcher = async (url: string): Promise<BranchListResponse> => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch branches");
  return res.json();
};

/* -------------------- SORT / FILTER -------------------- */

const SORT_VALUES = ["recent", "az"] as const;
type SortOrder = (typeof SORT_VALUES)[number];

const FILTER_OPTIONS = [
  { label: "All", value: "" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

/* -------------------- PAGE COMPONENT -------------------- */

export default function BranchesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  if (!isAdmin) return <AccessDenied />;

  const pathname = usePathname();

  /* ---------------- STATE ---------------- */
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("recent");
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("");

  const debouncedSearch = useDebounce(search, 400);

  /* ---------------- QUERY ---------------- */
  const query = useMemo(() => {
    const params = new URLSearchParams();
    // Fetch all branches for client-side pagination
    params.set("page", "1");
    params.set("perPage", "1000");
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (filter) params.set("status", filter);
    return params.toString();
  }, [debouncedSearch, filter]);

  /* ---------------- FETCH ---------------- */
  const { data, isLoading, mutate } = useSWR<BranchListResponse>(
    `/api/dashboard/branches?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  const branches = data?.branches ?? [];
  const total = data?.total ?? 0;

  /* ---------------- SUMMARY ---------------- */
  const summaryCards: SummaryCard[] = useMemo(() => {
    const activeCount = branches.filter((b) => b.active).length;
    const inactiveCount = branches.filter((b) => !b.active).length;
    const personnelTotal = branches.reduce((sum, b) => sum + b.personnelCount, 0);

    return [
      { id: "total", title: "Total Branches", value: total },
      { id: "active", title: "Active Branches", value: activeCount, color: "text-green-600" },
      { id: "inactive", title: "Inactive Branches", value: inactiveCount, color: "text-gray-500" },
      { id: "personnel", title: "Total Personnel", value: personnelTotal },
    ];
  }, [branches, total]);

  /* ---------------- FILTER / SORT ---------------- */
  const filteredBranches = useMemo(() => {
    let result = branches;
    if (filter === "active") result = result.filter((b) => b.active);
    if (filter === "inactive") result = result.filter((b) => !b.active);

    if (sortOrder === "az") result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    if (sortOrder === "recent") result = [...result].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return result;
  }, [branches, filter, sortOrder]);

  /* ---------------- EXPORT ---------------- */
  const exportData = useMemo(
    () =>
      filteredBranches.map((b) => ({
        Name: b.name,
        Status: b.active ? "Active" : "Inactive",
        Location: b.location ?? "",
        Personnel: b.personnelCount,
        Products: b.productCount,
        Orders: b.orderCount,
        Sales: b.salesTotal,
        CreatedAt: b.createdAt,
        UpdatedAt: b.updatedAt,
      })),
    [filteredBranches]
  );

  /* ---------------- COLUMNS ---------------- */
  const columns: DataTableColumn<BranchWithDetails>[] = useMemo(
    () => [
      { key: "name", header: "Branch", render: (b) => b.name },
      { key: "location", header: "Location", render: (b) => b.location ?? "-" },
      { key: "active", header: "Status", render: (b) => (b.active ? "Active" : "Inactive") },
      { key: "personnel", header: "Personnel", render: (b) => b.personnelCount },
      { key: "updatedAt", header: "Last Updated", render: (b) => new Date(b.updatedAt).toLocaleDateString() },
    ],
    []
  );

  /* ---------------- TABLE HELPERS ---------------- */
  const resolveRowId = useCallback((row: BranchWithDetails) => row.id, []);
  const tableId = useMemo(
    () =>
      pathname ? pathname.replace(/^\//, "").replace(/\//g, "-") : "branches-table",
    [pathname]
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await mutate();
    setRefreshing(false);
  };

  const sortOptions = useMemo(
    () => [
      { value: "recent" as SortOrder, label: "Recently Updated" },
      { value: "az" as SortOrder, label: "Name (A → Z)" },
    ],
    []
  );

  /* ---------------- UI ---------------- */
  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh)] p-4 bg-white">
      
      <Summary cardsData={summaryCards} />

      <DataTableToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
        sortOptions={sortOptions}
        exportData={exportData}
        exportFileName="branches.csv"
        onAdd={() => window.open("/dashboard/branches/create", "_blank")}
        filters={[
          {
            label: "Status",
            value: filter,
            defaultValue: "",
            options: FILTER_OPTIONS,
            onChange: setFilter,
          },
        ]}
      />

      <DataTable
        tableId={tableId}
        data={filteredBranches}
        columns={columns}
        getRowId={resolveRowId}
        loading={isLoading}
        dateField="createdAt"
      />
    </div>
  );
}