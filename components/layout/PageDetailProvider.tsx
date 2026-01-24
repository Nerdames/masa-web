"use client";

import { useState, useMemo, useCallback } from "react";
import ConfirmModal from "@/components/modal/ConfirmModal";
import { useToast } from "@/components/feedback/ToastProvider";

/* =========================================================
   Backend-resolved table view (authoritative)
========================================================= */

export interface ResolvedTableColumn {
  key: string;
  label: string;
  visible: boolean;
  locked: boolean;
}

export interface ResolvedTableView {
  columns: ResolvedTableColumn[];
  capabilities: {
    selectable: boolean;
    bulkDelete: boolean;
  };
  pageSize: number;
}

/* =========================================================
   Page detail config (consumed by provider)
========================================================= */

export interface PageDetailConfig<T> {
  title: string;
  description?: string;

  tableView: ResolvedTableView;

  useFetch: (params: {
    page: number;
    pageSize: number;
    search: string;
  }) => {
    data?: {
      data: T[];
      total: number;
    };
    isLoading: boolean;
    mutate: () => Promise<void>;
  };

  getRowId: (row: T) => string;

  /** Backend-derived per-row capability */
  getRowCapabilities?: (row: T) => {
    selectable: boolean;
    deletable: boolean;
  };

  onBulkDelete?: (ids: string[]) => Promise<void>;

  renderSummary?: (rows: T[]) => React.ReactNode;
  renderFilters?: () => React.ReactNode;

  renderTableHeader?: () => React.ReactNode;

  renderTable: (props: {
    rows: T[];
    selectedIds: Set<string>;
    toggleRow: (row: T) => void;
  }) => React.ReactNode;
}

/* =========================================================
   Provider
========================================================= */

interface Props<T> {
  config: PageDetailConfig<T>;
}

export default function PageDetailProvider<T>({
  config,
}: Props<T>) {
  const { addToast } = useToast();

  /* ---------------- STATE ---------------- */

  const [page, setPage] = useState<number>(1);
  const [search, setSearch] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const pageSize = config.tableView.pageSize;

  /* ---------------- DATA ---------------- */

  const { data, isLoading, mutate } = config.useFetch({
    page,
    pageSize,
    search,
  });

  const rows: T[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const pageCount: number = Math.max(1, Math.ceil(total / pageSize));

  /* ---------------- SELECTION (BACKEND-DRIVEN) ---------------- */

  const selectableIds = useMemo<string[]>(() => {
    if (!config.tableView.capabilities.selectable) return [];

    return rows
      .filter(row => {
        const caps = config.getRowCapabilities?.(row);
        return caps ? caps.selectable : true;
      })
      .map(config.getRowId);
  }, [rows, config]);

  const isAllSelected =
    selectableIds.length > 0 &&
    selectableIds.every(id => selectedIds.has(id));

  const isIndeterminate =
    selectedIds.size > 0 && !isAllSelected;

  const toggleRow = (row: T) => {
    if (!config.tableView.capabilities.selectable) return;

    const caps = config.getRowCapabilities?.(row);
    if (caps && !caps.selectable) return;

    const id = config.getRowId(row);

    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!config.tableView.capabilities.selectable) return;

    setSelectedIds(
      isAllSelected ? new Set() : new Set(selectableIds)
    );
  };

  const clearSelection = () => setSelectedIds(new Set());

  /* ---------------- ACTIONS ---------------- */

  const handleBulkDelete = useCallback(async () => {
    if (
      !config.onBulkDelete ||
      !config.tableView.capabilities.bulkDelete ||
      selectedIds.size === 0
    ) {
      return;
    }

    try {
      await config.onBulkDelete([...selectedIds]);

      addToast({
        type: "success",
        message: `${selectedIds.size} item(s) deleted`,
      });

      clearSelection();
      setConfirmOpen(false);
      await mutate();
    } catch {
      addToast({
        type: "error",
        message: "Bulk delete failed",
      });
    }
  }, [
    config,
    selectedIds,
    addToast,
    mutate,
  ]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await mutate();
    setTimeout(() => setRefreshing(false), 300);
  };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)]">

      {/* ================= HEADER ================= */}
      <header>
        <h1 className="text-xl font-semibold">{config.title}</h1>
        {config.description && (
          <p className="text-sm text-muted-foreground">
            {config.description}
          </p>
        )}
      </header>

      {/* ================= SUMMARY ================= */}
      {config.renderSummary && rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {config.renderSummary(rows)}
        </div>
      )}

      {/* ================= TOOLBAR ================= */}
      <div className="sticky top-0 z-20 bg-white p-3 flex flex-wrap items-center gap-2 shadow-sm">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          className="border rounded-lg p-2 text-sm min-w-[250px]"
        />

        <button
          onClick={handleRefresh}
          className={`w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center transition-transform ${
            refreshing ? "animate-spin" : ""
          }`}
        >
          <i className="bx bx-refresh text-lg" />
        </button>

        {selectedIds.size > 0 &&
          config.onBulkDelete &&
          config.tableView.capabilities.bulkDelete && (
            <button
              onClick={() => setConfirmOpen(true)}
              className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"
            >
              <i className="bx bx-trash-alt text-red-600 text-lg" />
            </button>
          )}

        <div className="ml-auto flex gap-2">
          {config.renderFilters?.()}
        </div>
      </div>

      {/* ================= TABLE ================= */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-y-3 min-w-[700px]">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-20">
            <tr>
              {config.tableView.capabilities.selectable && (
                <th className="w-10 p-2">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={el => {
                      if (el) el.indeterminate = isIndeterminate;
                    }}
                    onChange={toggleSelectAll}
                  />
                </th>
              )}

              {config.renderTableHeader?.()}
            </tr>
          </thead>

          <tbody>
            {isLoading &&
              Array.from({ length: pageSize }).map((_, i) => (
                <tr
                  key={i}
                  className="animate-pulse bg-white shadow-sm rounded-lg"
                >
                  <td colSpan={99} className="p-4">
                    <div className="h-4 bg-gray-200 rounded w-full" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              config.renderTable({
                rows,
                selectedIds,
                toggleRow,
              })}
          </tbody>
        </table>
      </div>

      {/* ================= PAGINATION ================= */}
      <div className="flex justify-between items-center text-xs">
        <span>Total: {total}</span>

        <div className="flex gap-2 items-center">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40"
          >
            Prev
          </button>

          <span>
            {page} / {pageCount}
          </span>

          <button
            disabled={page >= pageCount}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {/* ================= CONFIRM MODAL ================= */}
      {confirmOpen && (
        <ConfirmModal
          open
          title="Confirm delete"
          message={`Delete ${selectedIds.size} selected item(s)?`}
          destructive
          onClose={() => setConfirmOpen(false)}
          onConfirm={handleBulkDelete}
        />
      )}
    </div>
  );
}
