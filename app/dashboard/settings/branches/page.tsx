"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import useSWR from "swr";
import { useDebounce } from "@/hooks/useDebounce";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/feedback/ToastProvider";
import { Tooltip } from "@/components/feedback/Tooltip";
import ConfirmModal from "@/components/modal/ConfirmModal";
import type { Branch } from "@prisma/client";

/* ---------------- SKELETON ROW ---------------- */
const SkeletonRow = () => (
  <tr className="animate-pulse h-16 cursor-pointer">
    {Array.from({ length: 4 }).map((_, i) => (
      <td key={i} className="p-3">
        <div className="bg-gray-200 h-4 w-full rounded" />
      </td>
    ))}
  </tr>
);

/* ---------------- FETCHER ---------------- */
const fetcher = (url: string) => fetch(url).then((res) => res.json());

/* ---------------- CUSTOM USER TYPE ---------------- */
interface CustomUser {
  name?: string;
  email?: string;
  image?: string;
  organizationId: string;
  organizationName: string;
}

/* ---------------- BRANCHES PAGE ---------------- */
export default function BranchesPage() {
  const { data: session } = useSession();
  const toast = useToast();
  const user = session?.user as CustomUser | undefined;
  const organizationId = user?.organizationId ?? "";
  const organizationName = user?.organizationName ?? "Unknown";

  /* ---------------- STATE ---------------- */
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 12;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [inlineName, setInlineName] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => Promise<void>>(async () => {});

  const debouncedSearch = useDebounce(searchQuery, 300);

  /* ---------------- SWR FETCH ---------------- */
  const { data, mutate, isValidating } = useSWR(
    organizationId
      ? `/api/dashboard/branches?organizationId=${organizationId}&search=${debouncedSearch}&page=${page}&perPage=${perPage}`
      : null,
    fetcher
  );

  const branches: Branch[] = data?.branches ?? [];
  const filteredBranches = branches; // already filtered server-side
  const pageCount = Math.max(1, Math.ceil(filteredBranches.length / perPage));
  const paginatedBranches = useMemo(() => {
    const start = (page - 1) * perPage;
    return filteredBranches.slice(start, start + perPage);
  }, [filteredBranches, page, perPage]);

  const hasSelection = selectedIds.size > 0;

  /* ---------------- SELECTION ---------------- */
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredBranches.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredBranches.map((b) => b.id)));
  };

  /* ---------------- INLINE EDIT ---------------- */
  const startInlineEdit = (branch: Branch) => {
    setEditingBranchId(branch.id);
    setInlineName(branch.name);
  };
  const saveInlineEdit = (branch: Branch) => {
    if (!inlineName.trim()) return;
    setConfirmMessage(`Save changes to branch "${branch.name}"?`);
    setConfirmAction(() => async () => {
      setConfirmLoading(true);
      try {
        const res = await fetch(`/api/dashboard/branches/${branch.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: inlineName }),
        });
        if (!res.ok) throw new Error("Update failed");
        mutate();
        setEditingBranchId(null);
        toast.addToast({ type: "success", message: "Branch updated" });
      } catch (err) {
        toast.addToast({ type: "error", message: (err as Error).message });
      } finally {
        setConfirmLoading(false);
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  /* ---------------- TOGGLE ACTIVE ---------------- */
  const toggleActive = (branch: Branch) => {
    setConfirmMessage(
      `Are you sure you want to ${branch.active ? "deactivate" : "activate"} branch "${branch.name}"?`
    );
    setConfirmAction(() => async () => {
      setConfirmLoading(true);
      try {
        const res = await fetch(`/api/dashboard/branches/${branch.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !branch.active }),
        });
        if (!res.ok) throw new Error("Update failed");
        mutate();
        toast.addToast({ type: "success", message: "Branch status updated" });
      } catch (err) {
        toast.addToast({ type: "error", message: (err as Error).message });
      } finally {
        setConfirmLoading(false);
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  /* ---------------- BULK ACTIONS ---------------- */
  const handleBulkToggle = () => {
    if (!hasSelection) return;
    setConfirmMessage(`Toggle active status for ${selectedIds.size} selected branches?`);
    setConfirmAction(() => async () => {
      setConfirmLoading(true);
      try {
        await Promise.all(
          [...selectedIds].map((id) =>
            fetch(`/api/dashboard/branches/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ active: !branches.find((b) => b.id === id)?.active }),
            })
          )
        );
        setSelectedIds(new Set());
        mutate();
        toast.addToast({ type: "success", message: "Bulk status updated" });
      } catch (err) {
        toast.addToast({ type: "error", message: (err as Error).message });
      } finally {
        setConfirmLoading(false);
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const handleBulkDelete = () => {
    if (!hasSelection) return;
    setConfirmMessage(`Are you sure you want to delete ${selectedIds.size} selected branches?`);
    setConfirmAction(() => async () => {
      setConfirmLoading(true);
      try {
        await Promise.all([...selectedIds].map((id) => fetch(`/api/dashboard/branches/${id}`, { method: "DELETE" })));
        setSelectedIds(new Set());
        mutate();
        toast.addToast({ type: "success", message: "Branches deleted" });
      } catch (err) {
        toast.addToast({ type: "error", message: (err as Error).message });
      } finally {
        setConfirmLoading(false);
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  /* ---------------- SUMMARY CARDS ---------------- */
  const totalBranches = branches.length;
  const activeBranches = branches.filter((b) => b.active).length;
  const inactiveBranches = totalBranches - activeBranches;

  /* ---------------- RENDER ---------------- */
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] space-y-4">
      {/* ---------------- SUMMARY CARDS ---------------- */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded shadow flex flex-col">
          <span className="text-gray-500 text-sm">Total Branches</span>
          <span className="text-2xl font-bold">{totalBranches}</span>
        </div>
        <div className="p-4 bg-white rounded shadow flex flex-col">
          <span className="text-gray-500 text-sm">Active Branches</span>
          <span className="text-2xl font-bold">{activeBranches}</span>
        </div>
        <div className="p-4 bg-white rounded shadow flex flex-col">
          <span className="text-gray-500 text-sm">Inactive Branches</span>
          <span className="text-2xl font-bold">{inactiveBranches}</span>
        </div>
      </div>

      {/* ---------------- TOP TOOLBAR ---------------- */}
      <div className="flex justify-between items-center gap-4 p-2 bg-white rounded shadow">
        <input
          type="text"
          placeholder="Search branches..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="flex gap-2 items-center">
          <Tooltip content="Refresh">
            <button
              onClick={() => mutate()}
              disabled={isValidating}
              className="flex px-3 py-3 bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105"
            >
              <i className="bx bx-refresh text-lg" />
            </button>
          </Tooltip>
          {hasSelection && (
            <>
              <Tooltip content="Toggle Active Status">
                <button
                  onClick={handleBulkToggle}
                  className="flex px-3 py-3 bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105"
                >
                  <i className="bx bx-toggle-left text-lg" />
                </button>
              </Tooltip>
              <Tooltip content="Delete Selected">
                <button
                  onClick={handleBulkDelete}
                  className="flex px-3 py-3 bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105"
                >
                  <i className="bx bx-trash text-red-600 text-lg" />
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {/* ---------------- TABLE ---------------- */}
      <div className="flex-1 overflow-x-auto rounded-md border border-gray-200 shadow-sm">
        <table className="w-full text-sm table-auto">
          <thead className="bg-gray-50 text-gray-600 uppercase text-xs tracking-wide">
            <tr>
              <th className="p-3">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  checked={selectedIds.size === filteredBranches.length && filteredBranches.length > 0}
                  ref={(el) => {
                    if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredBranches.length;
                  }}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Organization</th>
              <th className="p-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isValidating
              ? Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
              : paginatedBranches.map((branch) => (
                  <tr
                    key={branch.id}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors duration-150 ${
                      selectedIds.has(branch.id) ? "bg-gray-100" : ""
                    }`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        checked={selectedIds.has(branch.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSelect(branch.id)}
                      />
                    </td>
                    <td className="p-3 font-medium">
                      {editingBranchId === branch.id ? (
                        <input
                          className="border px-2 py-1 rounded w-full"
                          value={inlineName}
                          onChange={(e) => setInlineName(e.target.value)}
                          onBlur={() => saveInlineEdit(branch)}
                          onKeyDown={(e) => e.key === "Enter" && saveInlineEdit(branch)}
                          autoFocus
                        />
                      ) : (
                        <span className="cursor-pointer" onDoubleClick={() => startInlineEdit(branch)}>
                          {branch.name}
                        </span>
                      )}
                    </td>
                    <td className="p-3">{organizationName}</td>
                    <td className="p-3">
                      <Tooltip content="Toggle Active">
                        <div
                          onClick={() => toggleActive(branch)}
                          className={`w-10 h-5 relative rounded-full transition-colors cursor-pointer ${
                            branch.active ? "bg-green-500" : "bg-gray-400"
                          }`}
                        >
                          <div
                            className={`absolute w-3 h-3 bg-white rounded-full top-1 transition-all ${
                              branch.active ? "left-6" : "left-1"
                            }`}
                          />
                        </div>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
            {!isValidating && filteredBranches.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-gray-400">
                  No branches found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------------- PAGINATION ---------------- */}
      <div className="flex justify-between text-xs mt-2">
        <div>Total: {filteredBranches.length}</div>
        <div className="flex gap-2 items-center">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-2 py-1 bg-gray-50 rounded-md disabled:opacity-50"
          >
            Prev
          </button>
          <span>
            {page} / {pageCount}
          </span>
          <button
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            className="px-2 py-1 bg-gray-50 rounded-md disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* ---------------- CONFIRM MODAL ---------------- */}
      <ConfirmModal
        open={confirmOpen}
        title="Confirm Action"
        message={confirmMessage}
        destructive
        loading={confirmLoading}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmAction}
      />
    </div>
  );
}
