"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import Summary, { SummaryCard } from "@/components/ui/Summary";

import type { Branch } from "@prisma/client";

/* ================= Fetcher ================= */
const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(res => res.json());

/* ================= Skeleton ================= */
const SkeletonRow = () => (
  <tr className="animate-pulse">
    {Array.from({ length: 4 }).map((_, i) => (
      <td key={i} className="p-4">
        <div className="h-4 bg-gray-200 rounded w-full" />
      </td>
    ))}
  </tr>
);

/* ================= Custom User ================= */
interface CustomUser {
  organizationId: string;
  organizationName: string;
}

/* ================= Page ================= */
export default function BranchesPage() {
  const toast = useToast();
  const { data: session } = useSession();
  const user = session?.user as CustomUser | undefined;

  const organizationId = user?.organizationId ?? "";
  const organizationName = user?.organizationName ?? "—";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => Promise<void>>(async () => {});
  const [confirmMessage, setConfirmMessage] = useState("");

  const debouncedSearch = useDebounce(search, 400);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (debouncedSearch) params.set("search", debouncedSearch);
    return params.toString();
  }, [page, debouncedSearch]);

  const { data, isLoading, mutate } = useSWR(
    organizationId ? `/api/dashboard/branches?organizationId=${organizationId}&${query}` : null,
    fetcher,
    { keepPreviousData: true }
  );

  const branches: Branch[] = data?.branches ?? [];
  const total = data?.total ?? branches.length;
  const pageSize = data?.pageSize ?? 10;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  /* ================= Summary ================= */
  const summaryCards: SummaryCard[] = [
    { id: "total", title: "Total Branches", value: total },
    { id: "active", title: "Active Branches", value: branches.filter(b => b.active).length, color: "text-green-600" },
    { id: "inactive", title: "Inactive Branches", value: branches.filter(b => !b.active).length, color: "text-gray-500" },
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
    const all = branches.every(b => selectedIds.has(b.id));
    setSelectedIds(all ? new Set() : new Set(branches.map(b => b.id)));
  };

  const isAllSelected = branches.length > 0 && branches.every(b => selectedIds.has(b.id));
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  /* ================= Actions ================= */
  const bulkDelete = () => {
    setConfirmMessage(`Delete ${selectedIds.size} selected branches?`);
    setConfirmAction(() => async () => {
      try {
        await Promise.all([...selectedIds].map(id =>
          fetch(`/api/dashboard/branches/${id}`, { method: "DELETE" })
        ));
        toast.addToast({ type: "success", message: "Branches deleted" });
        setSelectedIds(new Set());
        mutate();
      } catch {
        toast.addToast({ type: "error", message: "Delete failed" });
      } finally {
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const toggleActive = (branch: Branch) => {
    setConfirmMessage(
      `${branch.active ? "Deactivate" : "Activate"} branch "${branch.name}"?`
    );
    setConfirmAction(() => async () => {
      try {
        await fetch(`/api/dashboard/branches/${branch.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !branch.active }),
        });
        toast.addToast({ type: "success", message: "Status updated" });
        mutate();
      } catch {
        toast.addToast({ type: "error", message: "Update failed" });
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
          placeholder="Search branches"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded-lg p-2 text-sm h-10 min-w-[280px]"
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
                  ref={el => { if (el) el.indeterminate = isIndeterminate; }}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="p-4">Branch</th>
              <th className="p-4">Organization</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>

          <tbody>
            {isLoading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading && branches.map(branch => {
              const selected = selectedIds.has(branch.id);

              return (
                <tr
                  key={branch.id}
                  className={`
                    bg-white rounded-xl shadow-sm transition cursor-pointer
                    hover:bg-blue-50
                    ${selected ? "bg-blue-100" : ""}
                  `}
                >
                  <td className="p-4 text-center">
                    <input
                      type="checkbox"
                      checked={selected}
                      onClick={e => e.stopPropagation()}
                      onChange={() => toggleSelect(branch.id)}
                    />
                  </td>
                  <td className="p-4 font-medium text-center">{branch.name}</td>
                  <td className="p-4 text-center">{organizationName}</td>
                  <td className="p-4 text-center">
                    <span
                      onClick={() => toggleActive(branch)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer
                        ${branch.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}
                      `}
                    >
                      {branch.active ? "Active" : "Inactive"}
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
