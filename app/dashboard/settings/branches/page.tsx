"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSession} from "next-auth/react";
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

/* ---------------- MINIMUM LOADING HELPER ---------------- */
const minLoading = async (fn: () => Promise<void>, delay = 400) => {
  const start = Date.now();
  await fn();
  const elapsed = Date.now() - start;
  if (elapsed < delay) await new Promise((res) => setTimeout(res, delay - elapsed));
};

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
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
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

  /* ---------------- FETCH BRANCHES ---------------- */
  const fetchBranches = useCallback(
    async (pageIndex: number = 1) => {
      if (!organizationId) return;

      await minLoading(async () => {
        setLoading(true);
        try {
          const params = new URLSearchParams();
          params.set("organizationId", organizationId);
          params.set("page", String(pageIndex));
          params.set("perPage", String(perPage));
          if (searchQuery.trim()) params.set("search", searchQuery.trim());

          const res = await fetch(`/api/dashboard/branches?${params.toString()}`);
          if (!res.ok) throw new Error("Failed to load branches");

          const json: { branches: Branch[] } = await res.json();
          setBranches(json.branches ?? []);
          setSelectedIds(new Set());
        } catch (err: unknown) {
          toast.addToast({ type: "error", message: (err as Error).message });
          setBranches([]);
          setSelectedIds(new Set());
        } finally {
          setLoading(false);
        }
      });
    },
    [organizationId, perPage, searchQuery, toast]
  );

  useEffect(() => {
    fetchBranches(1);
  }, [fetchBranches]);

  /* ---------------- PAGINATION ---------------- */
  const filteredBranches = useMemo(
    () => branches.filter((b) => b.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [branches, searchQuery]
  );
  const pageCount = Math.max(1, Math.ceil(filteredBranches.length / perPage));
  const paginatedBranches = useMemo(() => {
    const start = (page - 1) * perPage;
    return filteredBranches.slice(start, start + perPage);
  }, [filteredBranches, page, perPage]);

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
  const hasSelection = selectedIds.size > 0;

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

        setBranches((prev) => prev.map((b) => (b.id === branch.id ? { ...b, name: inlineName } : b)));
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

        setBranches((prev) => prev.map((b) => (b.id === branch.id ? { ...b, active: !b.active } : b)));
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

  /* ---------------- BULK TOGGLE ACTIVE ---------------- */
  const handleBulkToggle = () => {
    if (!hasSelection) return;
    setConfirmMessage(`Toggle active status for ${selectedIds.size} selected branches?`);
    setConfirmAction(() => async () => {
      setConfirmLoading(true);
      try {
        await Promise.all(
          [...selectedIds].map((id) => {
            const branch = branches.find((b) => b.id === id);
            if (!branch) return;
            return fetch(`/api/dashboard/branches/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ active: !branch.active }),
            });
          })
        );
        setBranches((prev) => prev.map((b) => (selectedIds.has(b.id) ? { ...b, active: !b.active } : b)));
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

  /* ---------------- BULK DELETE ---------------- */
  const handleBulkDelete = () => {
    if (!hasSelection) return;
    setConfirmMessage(`Are you sure you want to delete ${selectedIds.size} selected branches?`);
    setConfirmAction(() => async () => {
      setConfirmLoading(true);
      try {
        await Promise.all([...selectedIds].map((id) => fetch(`/api/dashboard/branches/${id}`, { method: "DELETE" })));
        setBranches((prev) => prev.filter((b) => !selectedIds.has(b.id)));
        setSelectedIds(new Set());
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

  /* ---------------- RENDER ---------------- */
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] space-y-4">
      {/* ---------------- TOP TOOLBAR ---------------- */}
      <div className="sticky top-0 z-20 bg-white flex justify-between items-center w-full gap-4 p-2 border-b border-gray-200">
        <input
          type="text"
          placeholder="Search branches..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchBranches(1)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="flex gap-2 items-center">
          <Tooltip content="Refresh">
            <button
              onClick={() => fetchBranches(page)}
              disabled={loading}
              className="px-2 py-2 flex bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105"
            >
              <i className="bx bx-refresh text-lg" />
            </button>
          </Tooltip>

          {hasSelection && (
            <>
              <Tooltip content="Toggle Active Status">
                <button
                  onClick={handleBulkToggle}
                  className="px-2 py-2 flex bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105"
                >
                  <i className="bx bx-toggle-left text-lg" />
                </button>
              </Tooltip>

              <Tooltip content="Delete Selected">
                <button
                  onClick={handleBulkDelete}
                  className="px-2 py-2 flex bg-red-100 rounded-full hover:bg-red-200 transition transform hover:scale-105"
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
            {loading
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

            {!loading && filteredBranches.length === 0 && (
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
