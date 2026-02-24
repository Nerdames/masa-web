"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/core/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import Summary, { SummaryCard } from "@/components/ui/Summary";

import type { AuthorizedPersonnel, Role } from "@prisma/client";

/* ================= Fetcher ================= */
const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(res => res.json());

/* ================= Skeleton ================= */
const SkeletonRow = () => (
  <tr className="animate-pulse">
    {Array.from({ length: 6 }).map((_, i) => (
      <td key={i} className="p-4">
        <div className="h-4 w-full bg-gray-200 rounded" />
      </td>
    ))}
  </tr>
);

type PersonnelRow = AuthorizedPersonnel & {
  branch?: { name: string };
  organization?: { name: string };
  roles?: Role[];
};

export default function PersonnelsPage() {
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
    `/api/personnels?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  const personnels: PersonnelRow[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 10;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  /* ================= Summary ================= */
  const summaryCards: SummaryCard[] = [
    { id: "total", title: "Total Staff", value: total },
    {
      id: "active",
      title: "Active",
      value: personnels.filter(p => !p.disabled && !p.deletedAt).length,
      color: "text-green-600",
    },
    {
      id: "disabled",
      title: "Disabled",
      value: personnels.filter(p => p.disabled).length,
      color: "text-red-600",
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
    const all = personnels.every(p => selectedIds.has(p.id));
    setSelectedIds(all ? new Set() : new Set(personnels.map(p => p.id)));
  };

  const isAllSelected = personnels.length > 0 && personnels.every(p => selectedIds.has(p.id));
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  /* ================= Actions ================= */
  const toggleDisabled = (p: AuthorizedPersonnel) => {
    setConfirmMessage(
      `${p.disabled ? "Enable" : "Disable"} account for ${p.name ?? p.email}?`
    );
    setConfirmAction(() => async () => {
      try {
        const res = await fetch(`/api/personnels/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ disabled: !p.disabled }),
        });
        if (!res.ok) throw new Error();
        toast.addToast({ type: "success", message: "Personnel updated" });
        mutate();
      } catch {
        toast.addToast({ type: "error", message: "Update failed" });
      } finally {
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const bulkDisable = () => {
    setConfirmMessage(`Disable ${selectedIds.size} selected personnel?`);
    setConfirmAction(() => async () => {
      try {
        await Promise.all(
          [...selectedIds].map(id =>
            fetch(`/api/personnels/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ disabled: true }),
            })
          )
        );
        toast.addToast({ type: "success", message: "Personnel disabled" });
        setSelectedIds(new Set());
        mutate();
      } catch {
        toast.addToast({ type: "error", message: "Bulk action failed" });
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
          placeholder="Search personnel"
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
            onClick={bulkDisable}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <i className="bx bx-block text-red-600 text-lg" />
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
              <th className="p-4">Name</th>
              <th className="p-4">Email</th>
              <th className="p-4">Branch</th>
              <th className="p-4">Role</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>

          <tbody>
            {isLoading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading &&
              personnels.map(p => {
                const selected = selectedIds.has(p.id);

                return (
                  <tr
                    key={p.id}
                    className={`
                      bg-white rounded-xl shadow-sm transition
                      hover:bg-blue-50
                      ${selected ? "bg-blue-100" : ""}
                    `}
                  >
                    <td className="p-4 text-center">
                      <input
                        type="checkbox"
                        checked={selected}
                        onClick={e => e.stopPropagation()}
                        onChange={() => toggleSelect(p.id)}
                      />
                    </td>

                    <td className="p-4 text-center font-medium">
                      {p.name ?? "—"}
                    </td>

                    <td className="p-4 text-center text-xs">
                      {p.email}
                    </td>

                    <td className="p-4 text-center">
                      {p.branch?.name ?? "—"}
                    </td>

                    <td className="p-4 text-center text-xs">
                      {p.roles?.join(", ") ?? "—"}
                    </td>

                    <td className="p-4 text-center">
                      <span
                        onClick={() => toggleDisabled(p)}
                        className={`
                          px-3 py-1 rounded-full text-xs font-semibold cursor-pointer
                          ${p.disabled
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"}
                        `}
                      >
                        {p.disabled ? "Disabled" : "Active"}
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
