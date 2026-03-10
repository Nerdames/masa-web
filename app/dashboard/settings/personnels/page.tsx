"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import { usePathname, useRouter } from "next/navigation";

import Summary, { SummaryCard } from "@/components/ui/Summary";
import DataTable, { DataTableColumn } from "@/components/ui/DataTable";
import DataTableToolbar from "@/components/ui/DataTableToolbar";

import type { AuthorizedPersonnel, BranchAssignment } from "@prisma/client";

/* -------------------- TYPES -------------------- */

type PersonnelWithRelations = AuthorizedPersonnel & {
  branch?: { name: string } | null;
  branchAssignments: (BranchAssignment & { branch: { name: string } })[];
};

interface PersonnelListResponse {
  data: PersonnelWithRelations[];
  total: number;
  pageSize: number;
  summary?: {
    total: number;
    active: number;
    disabled: number;
    locked: number;
  };
  branchSummaries?: {
    branchId: string;
    branchName: string;
    total: number;
    active: number;
    disabled: number;
    locked: number;
  }[];
}

/* -------------------- FETCHER -------------------- */

const fetcher = async (url: string): Promise<PersonnelListResponse> => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch personnel");
  return res.json();
};

/* -------------------- SORT / FILTER -------------------- */

const SORT_VALUES = ["recent", "az"] as const;
type SortOrder = (typeof SORT_VALUES)[number];

const FILTER_OPTIONS = [
  { label: "All", value: "" },
  { label: "Active", value: "active" },
  { label: "Disabled", value: "disabled" },
  { label: "Locked", value: "locked" },
];

/* -------------------- PAGE -------------------- */

export default function PersonnelsPage() {
  const toast = useToast();
  const pathname = usePathname();
  const router = useRouter();

  /* ---------------- STATE ---------------- */
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("recent");
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  /* ---------------- RESET PAGE ---------------- */
  useEffect(() => setPage(1), [debouncedSearch, filter, sortOrder]);

  /* ---------------- QUERY ---------------- */
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (filter) params.set("status", filter);
    if (sortOrder === "az") params.set("sort", "az");
    return params.toString();
  }, [page, debouncedSearch, filter, sortOrder]);

  /* ---------------- FETCH DATA ---------------- */
  const { data, error, isLoading, mutate } = useSWR<PersonnelListResponse>(
    `/api/personnels?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  useEffect(() => {
    if (error) toast.addToast({ type: "error", message: "Failed to fetch personnel" });
  }, [error, toast]);

  const personnels = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 10;
  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  /* ---------------- SUMMARY ---------------- */
  const summaryCards: SummaryCard[] = useMemo(() => [
    { id: "total", title: "Total Staff", value: data?.summary?.total ?? total },
    { id: "active", title: "Active", value: data?.summary?.active ?? personnels.filter(p => !p.disabled && !p.isLocked).length, color: "text-green-600" },
    { id: "disabled", title: "Disabled", value: data?.summary?.disabled ?? personnels.filter(p => p.disabled).length, color: "text-slate-500" },
    { id: "locked", title: "Locked", value: data?.summary?.locked ?? personnels.filter(p => p.isLocked).length, color: "text-rose-600" },
  ], [personnels, total, data?.summary]);

  /* ---------------- FILTER & SORT ---------------- */
  const filteredPersonnels = useMemo(() => {
    let result = personnels;

    if (filter === "active") result = result.filter(p => !p.disabled && !p.isLocked);
    if (filter === "disabled") result = result.filter(p => p.disabled);
    if (filter === "locked") result = result.filter(p => p.isLocked);

    if (sortOrder === "az") result = [...result].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    if (sortOrder === "recent") result = [...result].sort(
      (a, b) => new Date(b.lastActivityAt ?? 0).getTime() - new Date(a.lastActivityAt ?? 0).getTime()
    );

    return result;
  }, [personnels, filter, sortOrder]);

  /* ---------------- EXPORT DATA ---------------- */
  const exportData = useMemo(() => filteredPersonnels.map(p => ({
    Name: p.name ?? "—",
    Email: p.email,
    StaffCode: p.staffCode ?? "N/A",
    Assignments: p.branchAssignments.map(ba => `${ba.branch.name} (${ba.role})`).join(", "),
    Status: p.isLocked ? "Locked" : p.disabled ? "Disabled" : "Active",
    LastActivity: p.isLocked ? "LOCKED" : p.lastActivityAt ? new Date(p.lastActivityAt).toLocaleDateString() : "Never"
  })), [filteredPersonnels]);

  /* ---------------- STATUS CLASS ---------------- */
  const statusClass = useCallback((p: PersonnelWithRelations) => {
    if (p.isLocked) return "bg-rose-50 text-rose-700";
    if (p.disabled) return "bg-slate-100 text-slate-500";
    return "bg-emerald-50 text-emerald-700";
  }, []);

  /* ---------------- COLUMNS ---------------- */
  const columns: DataTableColumn<PersonnelWithRelations>[] = useMemo(() => [
    {
      key: "name",
      header: "Personnel Details",
      render: p => (
        <div className="flex flex-col py-1">
          <span className="font-bold text-slate-800">{p.name ?? "—"}</span>
          <span className="text-[11px] text-slate-500">{p.email}</span>
        </div>
      ),
    },
    {
      key: "staffCode",
      header: "Code",
      render: p => <span className="font-mono text-xs font-bold text-slate-500">{p.staffCode ?? "N/A"}</span>,
    },
    {
      key: "assignments",
      header: "Active Assignments",
      render: p => (
        <span className="text-[10px]">{p.branchAssignments.map(ba => `${ba.branch.name} (${ba.role})`).join(", ") || "Unassigned"}</span>
      ),
    },
    {
      key: "status",
      header: "Account Status",
      render: p => (
        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusClass(p)}`}>
          {p.isLocked ? "LOCKED" : p.disabled ? "DISABLED" : "ACTIVE"}
        </span>
      ),
    },
    {
      key: "lastActivity",
      header: "Last Seen",
      render: p => (
        <span className="text-[11px]">
          {p.isLocked ? "LOCKED" : p.lastActivityAt ? new Date(p.lastActivityAt).toLocaleString() : "Never"}
        </span>
      ),
    },
  ], [statusClass]);

  /* ---------------- TABLE HELPERS ---------------- */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await mutate();
    setRefreshing(false);
  }, [mutate]);

  const tableId = useMemo(() => pathname ? pathname.replace(/^\//, "").replace(/\//g, "-") : "personnel-table", [pathname]);

  /* ---------------- UI ---------------- */
  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh)] p-4 bg-white">
      
      <Summary cardsData={summaryCards} />

      <DataTableToolbar<PersonnelWithRelations, string, string>
        search={search}
        onSearchChange={setSearch}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
        sortOptions={[
          { value: "recent", label: "Recently Updated" },
          { value: "az", label: "Name (A-Z)" },
        ]}
        onAdd={() => window.open(`${pathname}/add`, '_blank')}
        filters={[
          { label: "Status", value: filter, defaultValue: "", onChange: setFilter, options: FILTER_OPTIONS },
        ]}
        exportData={exportData}
        exportFileName="staff_directory.csv"
      />

      <DataTable<PersonnelWithRelations>
        tableId={tableId}
        data={filteredPersonnels}
        columns={columns}
        loading={isLoading}
        getRowId={p => p.id}
        onRowClick={p => window.open(`${pathname}/${p.id}`, '_blank')}
      />

      <div className="flex justify-between items-center text-xs pt-2">
        <span className="opacity-50 text-[10px] font-bold uppercase tracking-tighter">Total Records: {total}</span>
        <div className="flex gap-4 items-center">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="hover:text-blue-500 disabled:opacity-30 transition-colors uppercase font-bold tracking-tighter"
          >
            Prev
          </button>
          <span className="font-mono">{page} / {pageCount}</span>
          <button
            disabled={page >= pageCount}
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