"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import type { Customer, CustomerType } from "@/types/customer";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";

type TypeFilter = "ALL" | CustomerType;

interface CustomersResponse {
  customers: Customer[];
  total: number;
}

// Fetcher automatically includes org + branch from session
const createFetcher = (organizationId: string, branchId: string) => (url: string) =>
  fetch(`${url}&organizationId=${organizationId}&branchId=${branchId}`, { credentials: "include" }).then(res =>
    res.json()
  );

const SkeletonRow = () => (
  <tr className="animate-pulse bg-white shadow-sm rounded-lg">
    {Array.from({ length: 5 }).map((_, i) => (
      <td key={i} className="p-3">
        <div className="h-4 bg-gray-200 rounded w-full" />
      </td>
    ))}
  </tr>
);

export default function CustomersPage() {
  const toast = useToast();
  const router = useRouter();
  const { data: session } = useSession();

  // Ensure organizationId + branchId exist
  const organizationId = session?.user?.organizationId;
  const branchId = session?.user?.branchId;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "12");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (typeFilter && typeFilter !== "ALL") params.set("type", typeFilter);
    return params.toString();
  }, [page, debouncedSearch, typeFilter]);

  const { data, isLoading, mutate } = useSWR<CustomersResponse>(
    organizationId && branchId ? `/api/dashboard/customers?${query}` : null,
    organizationId && branchId ? createFetcher(organizationId, branchId) : null,
    { keepPreviousData: true }
  );

  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 12));

  // Summary counts
  const buyersCount = customers.filter(c => c.type === "BUYER").length;
  const suppliersCount = customers.filter(c => c.type === "SUPPLIER").length;

  // Selection logic
  const selectableIds = useMemo(() => customers.map(c => c.id), [customers]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = selectableIds.every(id => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  };

  const isAllSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  // Bulk delete via PATCH (single request)
  const bulkDelete = async () => {
    if (!selectedIds.size) return;
    try {
      const res = await fetch(`/api/dashboard/customers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.addToast({ type: "success", message: `${json.deletedCount} customers removed` });
        setSelectedIds(new Set());
        setBulkDeleteOpen(false);
        mutate();
      } else {
        toast.addToast({ type: "error", message: json.error || "Bulk delete failed" });
      }
    } catch {
      toast.addToast({ type: "error", message: "Bulk delete failed" });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await mutate();
    setTimeout(() => setRefreshing(false), 300);
  };

  // Fallback render if session not loaded yet
  if (!session) return <div className="p-4 text-center text-gray-500">Loading user session...</div>;

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)]">
      {/* ================= Summary Cards ================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className="p-4 bg-white rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:bg-gray-50"
          onClick={() => setTypeFilter("ALL")}
        >
          <div className="text-sm text-slate-500">Total Customers</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{total}</div>
        </div>

        <div
          className="p-4 bg-white rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:bg-gray-50"
          onClick={() => setTypeFilter("BUYER")}
        >
          <div className="text-sm text-slate-500">Buyers</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{buyersCount}</div>
        </div>

        <div
          className="p-4 bg-white rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:bg-gray-50"
          onClick={() => setTypeFilter("SUPPLIER")}
        >
          <div className="text-sm text-slate-500">Suppliers</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{suppliersCount}</div>
        </div>
      </div>

      {/* ================= Top Bar ================= */}
      <div className="sticky top-0 z-20 bg-white p-3 flex flex-wrap items-center gap-2 shadow-sm">
        <input
          type="text"
          placeholder="Search by name, email, or phone"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded-lg p-2 text-sm h-10 min-w-[300px]"
        />

        <button
          onClick={handleRefresh}
          className={`w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center transition-transform duration-300 ${refreshing ? "animate-spin" : ""}`}
        >
          <i className="bx bx-refresh text-lg" />
        </button>

        {selectedIds.size > 0 && (
          <button
            onClick={() => setBulkDeleteOpen(true)}
            className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"
          >
            <i className="bx bx-trash-alt text-red-600 text-lg" />
          </button>
        )}

        <div className="ml-auto flex gap-2 items-center">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="bg-gray-100 px-3 rounded-full h-10 flex items-center justify-center text-sm">
              <i className="bx bx-filter-alt mr-1" /> {typeFilter}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="bg-white shadow rounded-md py-1 min-w-[120px]">
              {(["ALL", "BUYER", "SUPPLIER"] as TypeFilter[]).map(t => (
                <DropdownMenu.Item key={t} className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                                   onSelect={() => setTypeFilter(t)}>
                  {t}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* ================= Table ================= */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-y-3 min-w-[700px]">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-20">
            <tr>
              <th className="w-10 p-2">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={el => { if(el) el.indeterminate = isIndeterminate; }}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="sticky left-0 bg-gray-50 p-2 z-30">Name</th>
              <th className="p-2 min-w-[100px]">Type</th>
              <th className="p-2 min-w-[150px]">Contact</th>
              <th className="p-2 min-w-[120px]">Joined</th>
            </tr>
          </thead>

          <tbody>
            {isLoading && Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading && customers.map(c => (
              <tr key={c.id} className="bg-white shadow-sm rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/dashboard/customers/${c.id}`)}>
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={e => { e.stopPropagation(); toggleSelect(c.id); }}
                  />
                </td>
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 capitalize">{c.type.toLowerCase()}</td>
                <td className="p-3 text-xs text-gray-600">{c.email ?? "-"}<br/>{c.phone ?? "-"}</td>
                <td className="p-3 text-xs text-gray-500">{new Date(c.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}

            {!isLoading && customers.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-400">
                  {search ? "No customers match your search." : "No customers found in this branch."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ================= Pagination ================= */}
      <div className="flex justify-between items-center text-xs">
        <span>Total: {total}</span>
        <div className="flex gap-2 items-center">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span>{page} / {pageCount}</span>
          <button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>

      {/* ================= Bulk Delete Modal ================= */}
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
