"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import Summary, { SummaryCard } from "@/components/ui/Summary";

import type { Organization } from "@prisma/client";

/* ================= Fetcher ================= */
const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(res => res.json());

/* ================= Skeleton ================= */
const SkeletonRow = () => (
  <tr className="animate-pulse">
    {Array.from({ length: 5 }).map((_, i) => (
      <td key={i} className="p-4">
        <div className="h-4 w-full bg-gray-200 rounded" />
      </td>
    ))}
  </tr>
);

export default function OrganizationPage() {
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<() => Promise<void>>(async () => {});

  const debouncedSearch = useDebounce(search, 400);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (debouncedSearch) params.set("search", debouncedSearch);
    return params.toString();
  }, [page, debouncedSearch]);

  const { data, isLoading, mutate } = useSWR(
    `/api/organizations?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  const organizations: (Organization & {
    _count?: { branches: number; personnel: number };
    owner?: { name?: string; email: string };
  })[] = data?.data ?? [];

  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 10;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  /* ================= Summary ================= */
  const summaryCards: SummaryCard[] = [
    { id: "total", title: "Organizations", value: total },
    {
      id: "active",
      title: "Active",
      value: organizations.filter(o => o.active).length,
      color: "text-green-600",
    },
    {
      id: "inactive",
      title: "Inactive",
      value: organizations.filter(o => !o.active).length,
      color: "text-gray-500",
    },
  ];

  /* ================= Selection ================= */
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = organizations.every(o => selectedIds.has(o.id));
    setSelectedIds(allSelected ? new Set() : new Set(organizations.map(o => o.id)));
  };

  const isAllSelected = organizations.length > 0 && organizations.every(o => selectedIds.has(o.id));
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  /* ================= Actions ================= */
  const toggleActive = (org: Organization) => {
    setConfirmMessage(
      `${org.active ? "Deactivate" : "Activate"} organization "${org.name}"?`
    );
    setConfirmAction(() => async () => {
      try {
        const res = await fetch(`/api/dashboard/organizations/${org.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !org.active }),
        });
        if (!res.ok) throw new Error();
        toast.addToast({ type: "success", message: "Organization updated" });
        mutate();
      } catch {
        toast.addToast({ type: "error", message: "Update failed" });
      } finally {
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const bulkDelete = () => {
    setConfirmMessage(`Delete ${selectedIds.size} selected organizations?`);
    setConfirmAction(() => async () => {
      try {
        await Promise.all(
          [...selectedIds].map(id =>
            fetch(`/api/dashboard/organizations/${id}`, { method: "DELETE" })
          )
        );
        toast.addToast({ type: "success", message: "Organizations deleted" });
        setSelectedIds(new Set());
        mutate();
      } catch {
        toast.addToast({ type: "error", message: "Bulk delete failed" });
      } finally {
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  /* ================= Render ================= */
  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">
      {/* Summary */}
      <Summary cardsData={summaryCards} />

      {/* Top Bar */}
      <div className="sticky top-0 z-40 bg-white p-3 flex items-center gap-2 shadow-sm">
        <input
          type="text"
          placeholder="Search organizations"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded-lg p-2 text-sm h-10 min-w-[300px]"
        />

        <button
          onClick={() => mutate()}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
        >
          <i className="bx bx-refresh text-lg" />
        </button>

        {selectedIds.size > 0 && (
          <button
            onClick={bulkDelete}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <i className="bx bx-trash text-red-600 text-lg" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-sm table-fixed border-separate border-spacing-y-3">
          <thead className="text-xs bg-gray-100 uppercase text-gray-500 text-center">
            <tr>
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={el => {
                    if (el) el.indeterminate = isIndeterminate;
                  }}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="p-4">Organization</th>
              <th className="p-4">Owner</th>
              <th className="p-4">Branches</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>

          <tbody>
            {isLoading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading &&
              organizations.map(org => {
                const selected = selectedIds.has(org.id);

                return (
                  <tr
                    key={org.id}
                    className={`
                      bg-white rounded-xl shadow-sm transition cursor-pointer
                      hover:bg-indigo-50
                      ${selected ? "bg-indigo-100" : ""}
                    `}
                  >
                    <td className="p-4 text-center">
                      <input
                        type="checkbox"
                        checked={selected}
                        onClick={e => e.stopPropagation()}
                        onChange={() => toggleSelect(org.id)}
                      />
                    </td>

                    <td className="p-4 text-center font-medium">{org.name}</td>

                    <td className="p-4 text-center text-xs">
                      {org.owner?.name ?? org.owner?.email ?? "—"}
                    </td>

                    <td className="p-4 text-center">
                      {org._count?.branches ?? 0}
                    </td>

                    <td className="p-4 text-center">
                      <span
                        onClick={() => toggleActive(org)}
                        className={`
                          px-3 py-1 rounded-full text-xs font-semibold cursor-pointer
                          ${org.active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-200 text-gray-600"}
                        `}
                      >
                        {org.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center text-xs">
        <span>Total: {total}</span>
        <div className="flex gap-2 items-center">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span>{page} / {pageCount}</span>
          <button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>

      {/* Confirm */}
      <ConfirmModal
        open={confirmOpen}
        title="Confirm Action"
        message={confirmMessage}
        destructive
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmAction}
      />
    </div>
  );
}
