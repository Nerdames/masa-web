"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Tooltip } from "@/src/core/components/feedback/Tooltip";
import { useDataTablePreference } from "@/src/core/hooks/useDataTablePreference";

/* ================= Types ================= */

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
  render: (row: T) => React.ReactNode;
  hideTooltip?: boolean;
}

export interface FilterOption<T extends string = string> {
  value: T;
  label: string;
}

export interface FilterConfig<T = unknown> {
  label: string;
  value: T | readonly T[];
  defaultValue: T | readonly T[];
  options: readonly FilterOption<string>[];
  onChange: (value: T | readonly T[]) => void;
}

export interface SortOption {
  label: string;
  value: string;
}

interface DataTableProps<T> {
  // Table Core
  data: T[];
  columns: DataTableColumn<T>[];
  tableId: string;
  loading?: boolean;
  getRowId?: (row: T, index: number) => string;
  onRowClick?: (row: T) => string | void;
  getRowClassName?: (row: T) => string;
  dateField?: keyof T;

  // Design Matches
  title?: string;
  enableSelection?: boolean;
  onSelectionChange?: (selectedRows: T[]) => void;

  // Toolbar & Filters Core
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  filters?: readonly FilterConfig[];
  exportData?: readonly Record<string, unknown>[];
  exportFileName?: string;

  // Sorting
  sortOrder?: string;
  sortOptions?: SortOption[];
  onSortChange?: (value: string | undefined) => void;

  // Row Actions (Icons only)
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  onMore?: (row: T) => void;

  // Bulk Actions
  onBulkDelete?: (selectedRows: T[]) => void;
  onBulkMore?: (selectedRows: T[]) => void;
}

/* ================= Helpers ================= */

function getAlignClass(align?: "left" | "center" | "right") {
  if (align === "left") return "text-left";
  if (align === "right") return "text-right";
  return "text-center";
}

function escapeCsvCell(value: unknown): string {
  if (value == null) return "";
  let str: string;
  if (value instanceof Date) str = value.toISOString();
  else if (Array.isArray(value)) str = value.join(", ");
  else str = String(value);

  const mustQuote = str.includes(",") || str.includes('"') || str.includes("\n");
  const escaped = str.replace(/"/g, '""');
  return mustQuote ? `"${escaped}"` : escaped;
}

/* ================= Component ================= */

function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  tableId,
  loading = false,
  getRowId,
  onRowClick,
  getRowClassName,
  title = "Product Summary",
  enableSelection = true,
  onSelectionChange,
  search,
  onSearchChange,
  searchPlaceholder = "Search for category, name, company, etc",
  onRefresh,
  refreshing = false,
  filters = [],
  exportData,
  exportFileName = "export.csv",
  sortOrder,
  sortOptions = [],
  onSortChange,
  onEdit,
  onDelete,
  onMore,
  onBulkDelete,
  onBulkMore,
}: DataTableProps<T>) {
  const initialColumnKeys = useMemo(() => columns.map((c) => c.key), [columns]);
  const { tablePrefs, columnOrder, saveColumnOrder } = useDataTablePreference(tableId, initialColumnKeys);

  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const dragCol = useRef<string | null>(null);

  /* ---------------- Toolbar Logic (Draft Filters & Export) ---------------- */
  const [draftFilters, setDraftFilters] = useState<Record<string, unknown>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedExportColumns, setSelectedExportColumns] = useState<string[]>([]);

  useEffect(() => {
    const initial: Record<string, unknown> = {};
    filters.forEach((f) => (initial[f.label] = f.value));
    setDraftFilters(initial);
  }, [filters]);

  useEffect(() => {
    if (exportData?.length) setSelectedExportColumns(Object.keys(exportData[0]));
    else setSelectedExportColumns([]);
  }, [exportData]);

  const toggleDraftValue = (filter: FilterConfig, optionValue: string) => {
    const isMulti = Array.isArray(filter.value);
    setDraftFilters((prev) => {
      const current = prev[filter.label];
      if (isMulti) {
        const arr = Array.isArray(current) ? (current as string[]) : [];
        const exists = arr.includes(optionValue);
        return {
          ...prev,
          [filter.label]: exists ? arr.filter((v) => v !== optionValue) : [...arr, optionValue],
        };
      } else {
        return { ...prev, [filter.label]: optionValue };
      }
    });
  };

  const applyFilters = useCallback(() => {
    filters.forEach((f) => f.onChange(draftFilters[f.label] as string | readonly string[]));
  }, [filters, draftFilters]);

  const resetFilters = useCallback(() => {
    filters.forEach((f) => f.onChange(f.defaultValue));
    onSearchChange?.("");
    onSortChange?.(undefined);
  }, [filters, onSearchChange, onSortChange]);

  const handleExport = useCallback(() => {
    if (!exportData?.length || !selectedExportColumns.length) return;
    const csv =
      "\uFEFF" +
      [
        selectedExportColumns.map(escapeCsvCell).join(","),
        ...exportData.map((row) => selectedExportColumns.map((h) => escapeCsvCell(row[h])).join(",")),
      ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName;
    link.click();
    URL.revokeObjectURL(url);
  }, [exportData, selectedExportColumns, exportFileName]);

  const activeBadges = useMemo(() => {
    const tokens: { label: string; value: string; onRemove?: () => void }[] = [];
    if (search && onSearchChange) {
      tokens.push({ label: "Search", value: search, onRemove: () => onSearchChange("") });
    }
    if (sortOrder && onSortChange && sortOptions.length) {
      const activeSort = sortOptions.find((o) => o.value === sortOrder);
      if (activeSort) {
        tokens.push({ label: "Sort", value: activeSort.label, onRemove: () => onSortChange(undefined) });
      }
    }
    filters.forEach((f) => {
      const isMulti = Array.isArray(f.value);
      const isDefault = isMulti
        ? (f.value as unknown[]).length === 0 || JSON.stringify(f.value) === JSON.stringify(f.defaultValue)
        : f.value === f.defaultValue;

      if (!isDefault) {
        tokens.push({
          label: f.label,
          value: isMulti ? (f.value as string[]).join(", ") : String(f.value),
          onRemove: () => f.onChange(f.defaultValue),
        });
      }
    });
    return tokens;
  }, [filters, search, onSearchChange, sortOrder, onSortChange, sortOptions]);

  /* ---------------- Column Ordering & Selection ---------------- */
  const orderedColumns = useMemo(() => {
    const validKeys = columns.map((c) => c.key);
    const safeOrder = [
      ...columnOrder.filter((k) => validKeys.includes(k)),
      ...validKeys.filter((k) => !columnOrder.includes(k)),
    ];
    return safeOrder.map((key) => columns.find((c) => c.key === key)!).filter(Boolean);
  }, [columnOrder, columns]);

  const handleDrop = (targetKey: string) => {
    const sourceKey = dragCol.current;
    if (!sourceKey || sourceKey === targetKey) return;
    const newOrder = [...columnOrder];
    newOrder.splice(newOrder.indexOf(sourceKey), 1);
    newOrder.splice(newOrder.indexOf(targetKey), 0, sourceKey);
    saveColumnOrder(newOrder);
    dragCol.current = null;
  };

  const paginatedData = useMemo(() => {
    const rowsPerPage = (tablePrefs.table_rows_per_page as number) ?? 10;
    const start = (page - 1) * rowsPerPage;
    return data.slice(start, start + rowsPerPage);
  }, [data, page, tablePrefs.table_rows_per_page]);

  const toggleRowSelection = (id: string, row: T) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      if (onSelectionChange) {
        onSelectionChange(
          data.filter((r, i) => newSet.has(getRowId?.(r, i) ?? `${JSON.stringify(r)}-${i}`))
        );
      }
      return newSet;
    });
  };

  const toggleAllSelection = () => {
    if (selectedIds.size === paginatedData.length && paginatedData.length > 0) {
      setSelectedIds(new Set());
      if (onSelectionChange) onSelectionChange([]);
    } else {
      const newSet = new Set<string>();
      paginatedData.forEach((row, i) => newSet.add(getRowId?.(row, i) ?? `${JSON.stringify(row)}-${i}`));
      setSelectedIds(newSet);
      if (onSelectionChange) onSelectionChange(paginatedData);
    }
  };

  /* ---------------- Pagination Math ---------------- */
  const total = data.length;
  const rowsPerPage = (tablePrefs.table_rows_per_page as number) ?? 10;
  const pageCount = Math.ceil(total / rowsPerPage) || 1;

  const paginationRange = useMemo(() => {
    if (pageCount <= 5) return Array.from({ length: pageCount }, (_, i) => i + 1);
    if (page <= 3) return [1, 2, 3, "...", pageCount];
    if (page >= pageCount - 2) return [1, "...", pageCount - 2, pageCount - 1, pageCount];
    return [1, "...", page, "...", pageCount];
  }, [page, pageCount]);

  /* ---------------- UI Classes ---------------- */
  const showToolbar = search !== undefined || filters.length > 0 || sortOptions.length > 0;
  const inputBase =
    "h-11 rounded-xl bg-[#F8FAFC] border border-transparent px-4 text-sm transition-all outline-none focus:ring-2 focus:ring-[#3D5AFE]/20 focus:bg-white";
  const iconBtn =
    "w-11 h-11 flex items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-400 hover:text-slate-600 hover:bg-slate-50 shadow-sm transition-all";
  const checkboxClass =
    "w-4 h-4 rounded border-slate-300 text-[#3D5AFE] focus:ring-[#3D5AFE] cursor-pointer";

  const hasRowActions = !!(onEdit || onDelete || onMore);
  const selectedRows = useMemo(
    () => data.filter((r, i) => selectedIds.has(getRowId?.(r, i) ?? `${JSON.stringify(r)}-${i}`)),
    [data, selectedIds, getRowId]
  );

  return (
    <div className="w-full flex flex-col gap-6">
      {/* ================= TOP TOOLBAR ================= */}
      {showToolbar && (
        <div className="w-full bg-white rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-100 p-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4 flex-1">
              {/* Search */}
              {search !== undefined && (
                <div className="flex-1 min-w-[280px]">
                  <label className="text-[11px] font-bold text-slate-800 mb-1.5 ml-1 block">
                    What are you looking for?
                  </label>
                  <div className="relative">
                    <i className="bx bx-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg" />
                    <input
                      value={search}
                      onChange={(e) => onSearchChange?.(e.target.value)}
                      placeholder={searchPlaceholder}
                      className={`${inputBase} w-full pl-11`}
                    />
                  </div>
                </div>
              )}

              {/* Filters */}
              {filters.map((filter) => (
                <div key={filter.label} className="w-48">
                  <label className="text-[11px] font-bold text-slate-800 mb-1.5 ml-1 block">
                    {filter.label}
                  </label>
                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <button
                        className={`${inputBase} w-full flex items-center justify-between text-slate-500`}
                      >
                        <span className="truncate">
                          {Array.isArray(filter.value)
                            ? filter.value.length
                              ? filter.value.join(", ")
                              : "All"
                            : (filter.value as string) || "All"}
                        </span>
                      </button>
                    </Popover.Trigger>
                    <Popover.Content
                      align="start"
                      className="w-56 z-50 rounded-xl bg-white shadow-2xl border border-slate-100 p-2"
                    >
                      <div className="max-h-60 overflow-y-auto">
                        {filter.options.map((opt) => {
                          const active = Array.isArray(draftFilters[filter.label])
                            ? (draftFilters[filter.label] as string[])?.includes(opt.value)
                            : draftFilters[filter.label] === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => toggleDraftValue(filter, opt.value)}
                              className={`w-full text-left px-3 py-2 text-sm rounded-lg mb-1 transition-colors ${
                                active
                                  ? "bg-blue-50 text-[#3D5AFE] font-medium"
                                  : "hover:bg-slate-50 text-slate-600"
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex gap-2 pt-2 mt-2 border-t border-slate-50">
                        <button
                          onClick={() => filters.forEach((f) => f.onChange(f.defaultValue))}
                          className="flex-1 py-1.5 text-[10px] font-bold text-slate-400 hover:text-red-500 uppercase"
                        >
                          Reset
                        </button>
                        <button
                          onClick={applyFilters}
                          className="flex-1 py-1.5 bg-[#3D5AFE] text-white text-[10px] font-bold rounded-md uppercase"
                        >
                          Apply
                        </button>
                      </div>
                    </Popover.Content>
                  </Popover.Root>
                </div>
              ))}

              {/* Sort Dropdown */}
              {sortOptions.length > 0 && onSortChange && (
                <div className="w-40">
                  <label className="text-[11px] font-bold text-slate-800 mb-1.5 ml-1 block">
                    Sort By
                  </label>
                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <button
                        className={`${inputBase} w-full flex items-center justify-between text-slate-500`}
                      >
                        <span className="truncate">
                          {sortOptions.find((o) => o.value === sortOrder)?.label || "Default"}
                        </span>
                      </button>
                    </Popover.Trigger>
                    <Popover.Content
                      align="start"
                      className="w-48 z-50 rounded-xl bg-white shadow-2xl border border-slate-100 p-2"
                    >
                      <div className="max-h-60 overflow-y-auto">
                        {sortOptions.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => onSortChange(opt.value)}
                            className={`w-full text-left px-3 py-2 text-sm rounded-lg mb-1 transition-colors ${
                              sortOrder === opt.value
                                ? "bg-blue-50 text-[#3D5AFE] font-medium"
                                : "hover:bg-slate-50 text-slate-600"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </Popover.Content>
                  </Popover.Root>
                </div>
              )}
            </div>

            {/* Right-Aligned Compact Actions Bar */}
            <div className="flex items-center gap-2 h-11">
              {selectedIds.size > 0 && enableSelection ? (
                <>
                  <span className="text-[11px] font-bold text-[#3D5AFE] bg-blue-50 px-3 py-1.5 rounded-lg mr-1 tracking-wide">
                    {selectedIds.size} SELECTED
                  </span>
                  {onBulkDelete && (
                    <Tooltip content="Bulk Delete">
                      <button
                        onClick={() => onBulkDelete(selectedRows)}
                        aria-label="Bulk Delete"
                        className={`${iconBtn} text-red-500 hover:text-red-600 hover:bg-red-50`}
                      >
                        <i className="bx bx-trash text-lg" />
                      </button>
                    </Tooltip>
                  )}
                  {onBulkMore && (
                    <Tooltip content="More Actions">
                      <button
                        onClick={() => onBulkMore(selectedRows)}
                        aria-label="More Bulk Actions"
                        className={iconBtn}
                      >
                        <i className="bx bx-dots-vertical-rounded text-lg" />
                      </button>
                    </Tooltip>
                  )}
                </>
              ) : (
                <>
                  {onRefresh && (
                    <Tooltip content="Refresh">
                      <button onClick={onRefresh} aria-label="Refresh Data" className={iconBtn}>
                        <i className={`bx bx-revision ${refreshing ? "bx-spin" : ""}`} />
                      </button>
                    </Tooltip>
                  )}

                  {exportData && (
                    <Popover.Root open={exportOpen} onOpenChange={setExportOpen}>
                      <Popover.Trigger asChild>
                        <button aria-label="Export Data" className={iconBtn}>
                          <Tooltip content="Export">
                            <i className="bx bx-export text-lg" />
                          </Tooltip>
                        </button>
                      </Popover.Trigger>
                      <Popover.Content
                        align="end"
                        className="w-64 z-50 rounded-xl bg-white shadow-2xl border border-slate-200 p-4"
                      >
                        <div className="text-[10px] font-bold text-slate-400 uppercase mb-3">
                          Columns to Export
                        </div>
                        <div className="space-y-1 max-h-48 overflow-y-auto mb-4 pr-2">
                          {exportData.length > 0 &&
                            Object.keys(exportData[0]).map((col) => (
                              <label
                                key={col}
                                className="flex items-center gap-3 text-sm cursor-pointer p-1.5 hover:bg-slate-50 rounded-lg"
                              >
                                <input
                                  type="checkbox"
                                  className={checkboxClass}
                                  checked={selectedExportColumns.includes(col)}
                                  onChange={() =>
                                    setSelectedExportColumns((prev) =>
                                      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
                                    )
                                  }
                                />
                                <span className="truncate text-slate-600 font-medium">{col}</span>
                              </label>
                            ))}
                        </div>
                        <button
                          onClick={() => {
                            handleExport();
                            setExportOpen(false);
                          }}
                          className="w-full py-2.5 rounded-lg bg-[#3D5AFE] text-white text-xs font-bold shadow-md"
                        >
                          Download CSV
                        </button>
                      </Popover.Content>
                    </Popover.Root>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Active Badges */}
          {activeBadges.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-50">
              <span className="text-[10px] font-bold text-slate-400 uppercase mr-2">Active:</span>
              {activeBadges.map((badge, idx) => (
                <span
                  key={idx}
                  className="flex items-center gap-2 px-3 py-1 rounded-lg text-[10px] font-bold uppercase bg-slate-50 border border-slate-200 text-slate-600"
                >
                  <span className="opacity-50">{badge.label}:</span> {badge.value}
                  <button
                    onClick={badge.onRemove}
                    className="ml-1 text-slate-400 hover:text-red-500 text-sm leading-none"
                    aria-label={`Remove ${badge.label} filter`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                onClick={resetFilters}
                className="text-[10px] font-bold text-red-500 hover:underline ml-2"
              >
                CLEAR ALL
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================= TABLE COMPONENT ================= */}
      <div className="w-full bg-white rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-100 flex flex-col overflow-hidden">
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between p-6 gap-4 border-b border-slate-50">
          <h2 className="text-lg font-extrabold text-slate-800 tracking-tight">{title}</h2>

          <div className="flex flex-wrap items-center gap-4 justify-end">
            <div className="flex items-center gap-1.5 ml-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous Page"
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-[#3D5AFE] disabled:opacity-30 transition-colors"
              >
                <i className="bx bx-chevron-left text-xl" />
              </button>
              {paginationRange.map((p, idx) => (
                <button
                  key={idx}
                  disabled={p === "..."}
                  onClick={() => typeof p === "number" && setPage(p)}
                  className={`min-w-[32px] h-8 rounded-lg text-xs font-bold flex items-center justify-center transition-colors px-1.5 ${
                    page === p
                      ? "bg-[#3D5AFE] text-white shadow-sm shadow-blue-500/30"
                      : p === "..."
                      ? "text-slate-400 cursor-default bg-transparent"
                      : "text-slate-500 hover:bg-slate-100 bg-transparent"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                aria-label="Next Page"
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-[#3D5AFE] disabled:opacity-30 transition-colors"
              >
                <i className="bx bx-chevron-right text-xl" />
              </button>
            </div>
          </div>
        </div>

        {/* Table Area */}
        <div className="w-full overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead className="bg-white border-b border-slate-50">
              <tr>
                {enableSelection && (
                  <th className="py-4 px-6 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === paginatedData.length && paginatedData.length > 0}
                      onChange={toggleAllSelection}
                      className={checkboxClass}
                      aria-label="Select all rows"
                    />
                  </th>
                )}

                {orderedColumns.map((col) => (
                  <th
                    key={col.key}
                    draggable
                    onDragStart={() => (dragCol.current = col.key)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(col.key)}
                    style={{ width: col.width, minWidth: "100px" }}
                    className={`py-4 px-4 text-[11px] font-bold uppercase tracking-wider text-slate-400 cursor-move select-none ${getAlignClass(
                      col.align
                    )}`}
                  >
                    <Tooltip content={typeof col.header === "string" ? col.header : ""}>
                      <div className="truncate">{col.header}</div>
                    </Tooltip>
                  </th>
                ))}

                {hasRowActions && (
                  <th className="py-4 px-6 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400 w-24">
                    {/* Empty header for actions matching UI */}
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {!loading &&
                paginatedData.map((row, index) => {
                  const key = getRowId?.(row, index) ?? `${JSON.stringify(row)}-${index}`;
                  const isSelected = selectedIds.has(key);

                  return (
                    <tr
                      key={key}
                      onClick={() => {
                        if (onRowClick) {
                          const url = onRowClick(row);
                          if (typeof url === "string") window.open(url, "_blank");
                        }
                      }}
                      className={`border-b border-slate-50/80 transition-colors duration-200 ${
                        isSelected ? "bg-blue-50/30" : "bg-white"
                      } hover:bg-slate-50/50 cursor-pointer ${getRowClassName?.(row) ?? ""}`}
                    >
                      {/* Selection Checkbox */}
                      {enableSelection && (
                        <td className="py-4 px-6 w-12 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleRowSelection(key, row);
                            }}
                            className={checkboxClass}
                            aria-label={`Select row ${index + 1}`}
                          />
                        </td>
                      )}

                      {/* Dynamic Data Columns */}
                      {orderedColumns.map((col) => {
                        const cellContent = col.render(row);
                        const tooltipText =
                          typeof cellContent === "string" || typeof cellContent === "number"
                            ? String(cellContent)
                            : "";
                        const showTooltip = tablePrefs.table_tooltips && !col.hideTooltip;
                        return (
                          <td
                            key={col.key}
                            style={{ width: col.width }}
                            className={`py-4 px-4 text-slate-600 font-medium text-[13px] ${getAlignClass(
                              col.align
                            )}`}
                          >
                            {showTooltip ? (
                              <Tooltip content={tooltipText}>
                                <div className="truncate">{cellContent}</div>
                              </Tooltip>
                            ) : (
                              <div className="truncate">{cellContent}</div>
                            )}
                          </td>
                        );
                      })}

                      {/* Extreme Right Actions (Edit, Delete, More) */}
                      {hasRowActions && (
                        <td
                          className="py-4 px-6 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            {onEdit && (
                              <Tooltip content="Edit">
                                <button
                                  onClick={() => onEdit(row)}
                                  aria-label="Edit row"
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#3D5AFE] hover:bg-blue-50 transition-colors"
                                >
                                  <i className="bx bx-edit text-lg" />
                                </button>
                              </Tooltip>
                            )}
                            {onDelete && (
                              <Tooltip content="Delete">
                                <button
                                  onClick={() => onDelete(row)}
                                  aria-label="Delete row"
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                >
                                  <i className="bx bx-trash text-lg" />
                                </button>
                              </Tooltip>
                            )}
                            {onMore && (
                              <Tooltip content="More">
                                <button
                                  onClick={() => onMore(row)}
                                  aria-label="More row actions"
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                >
                                  <i className="bx bx-dots-vertical-rounded text-lg" />
                                </button>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}

              {/* Empty State */}
              {!loading && paginatedData.length === 0 && (
                <tr>
                  <td colSpan={100} className="py-12 text-center text-slate-400 text-sm">
                    No records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default React.memo(DataTable) as typeof DataTable;