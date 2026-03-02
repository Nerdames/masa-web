"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";

/* ================= Types ================= */

interface SortOption<T extends string> {
  value: T;
  label: string;
}

interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface FilterConfig<T extends string> {
  label: string;
  value: readonly T[];
  defaultValue: readonly T[];
  options: readonly FilterOption<T>[];
  onChange: (value: readonly T[]) => void;
}

type ExportableRow = Record<string, unknown>;

interface DataTableToolbarProps<
  T extends ExportableRow,
  TSort extends string,
  TFilter extends string = string
> {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;

  onRefresh: () => void;
  refreshing?: boolean;

  filters?: readonly FilterConfig<TFilter>[];
  sortOrder?: TSort;
  onSortChange?: (value: TSort) => void;
  sortOptions?: readonly SortOption<TSort>[];

  exportData?: readonly T[];
  exportFileName?: string;

  onAdd?: () => void;
}

/* ================= CSV ================= */

function escapeCsvCell(value: unknown): string {
  if (value == null) return "";
  const str = value instanceof Date ? value.toISOString() : String(value);
  const mustQuote =
    str.includes(",") || str.includes('"') || str.includes("\n");
  const escaped = str.replace(/"/g, '""');
  return mustQuote ? `"${escaped}"` : escaped;
}

/* ================= Component ================= */

function DataTableToolbarInner<
  T extends ExportableRow,
  TSort extends string,
  TFilter extends string = string
>({
  search,
  onSearchChange,
  searchPlaceholder = "Search",
  onRefresh,
  refreshing = false,
  filters = [],
  sortOrder,
  onSortChange,
  sortOptions = [],
  exportData,
  exportFileName = "export.csv",
  onAdd,
}: DataTableToolbarProps<T, TSort, TFilter>) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  /* ================= Draft Filters ================= */

  const [draftFilters, setDraftFilters] = useState<Record<string, TFilter[]>>(
    () => {
      const initial: Record<string, TFilter[]> = {};
      filters.forEach((f) => (initial[f.label] = [...f.value]));
      return initial;
    }
  );

  useEffect(() => {
    const initial: Record<string, TFilter[]> = {};
    filters.forEach((f) => (initial[f.label] = [...f.value]));
    setDraftFilters(initial);
  }, [filters]);

  const toggleDraftValue = (label: string, value: TFilter) => {
    setDraftFilters((prev) => {
      const current = prev[label] ?? [];
      const exists = current.includes(value);
      return {
        ...prev,
        [label]: exists
          ? current.filter((v) => v !== value)
          : [...current, value],
      };
    });
  };

  const applyFilters = useCallback(() => {
    filters.forEach((f) => f.onChange(draftFilters[f.label] ?? []));
    setFiltersOpen(false);
  }, [filters, draftFilters]);

  const resetFilters = useCallback(() => {
    const reset: Record<string, TFilter[]> = {};
    filters.forEach((f) => {
      reset[f.label] = [...f.defaultValue];
      f.onChange(f.defaultValue);
    });
    setDraftFilters(reset);
  }, [filters]);

  /* ================= EXPORT ================= */

  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    () => (exportData && exportData.length ? Object.keys(exportData[0]) : [])
  );

  // Auto-sync columns when exportData changes
  useEffect(() => {
    if (exportData && exportData.length) {
      setSelectedColumns(Object.keys(exportData[0]));
    } else {
      setSelectedColumns([]);
    }
  }, [exportData]);

  const toggleColumn = (col: string) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const handleExport = useCallback(() => {
    if (!exportData?.length || !selectedColumns.length) return;

    const csv =
      "\uFEFF" +
      [
        selectedColumns.map(escapeCsvCell).join(","),
        ...exportData.map((row) =>
          selectedColumns.map((h) => escapeCsvCell(row[h])).join(",")
        ),
      ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName;
    link.click();
    URL.revokeObjectURL(url);
  }, [exportData, selectedColumns, exportFileName]);

  /* ================= Styles ================= */

  const baseControl =
    "h-9 text-sm rounded-md border border-black/10 dark:border-white/10 backdrop-blur transition";

  const iconButton =
    "w-9 h-9 flex items-center justify-center rounded-md border border-black/10 " +
    "bg-white/40 dark:bg-white/10 backdrop-blur transition hover:bg-gradient-to-b " +
    "hover:from-white/90 hover:to-white/60 dark:hover:from-white/20 dark:hover:to-white/5 " +
    "active:from-white/70 active:to-white/40";

  const dropdownItem =
    "flex items-center justify-between px-3 py-2 text-sm rounded-md transition " +
    "hover:bg-gradient-to-b hover:from-white/90 hover:to-white/60 " +
    "dark:hover:from-white/20 dark:hover:to-white/5 active:scale-[0.99]";

  const badgeStyle =
    "flex items-center gap-2 px-3 py-1 rounded-full text-xs " +
    "bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 " +
    "backdrop-blur truncate max-w-[220px]";

  /* ================= Active Badges ================= */

  const activeBadges = useMemo(() => {
    const tokens: { label: string; value: string; onRemove: () => void }[] = [];

    if (search) {
      tokens.push({
        label: "Search",
        value: search,
        onRemove: () => onSearchChange(""),
      });
    }

    filters.forEach((f) => {
      f.value.forEach((val) => {
        tokens.push({
          label: f.label,
          value: val,
          onRemove: () => f.onChange(f.value.filter((v) => v !== val)),
        });
      });
    });

    // Sort badge always present
    if (sortOrder && onSortChange) {
      tokens.push({
        label: "Sort",
        value: sortOrder,
        onRemove: () => onSortChange(sortOptions[0]?.value as TSort),
      });
    }

    return tokens;
  }, [filters, search, sortOrder, onSearchChange, onSortChange, sortOptions]);

  const hasSearchOrFilters =
    search.length > 0 || filters.some((f) => f.value.length > 0);

  const clearAll = () => {
    onSearchChange("");
    filters.forEach((f) => f.onChange([]));
  };

  /* ================= RENDER ================= */

  return (
    <>
      <div className="sticky top-0 z-30 backdrop-blur-xl bg-white/60 dark:bg-neutral-900/60 border-b border-black/10 dark:border-white/10">
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3 overflow-hidden">
          {/* LEFT CONTROLS */}
          <div className="flex items-center gap-2 flex-wrap min-w-0 overflow-hidden">
            {onAdd && <button onClick={onAdd} className={iconButton}>+</button>}
            <button onClick={onRefresh} disabled={refreshing} className={iconButton}>
              {refreshing ? "⟳" : "↻"}
            </button>
          </div>

          {/* RIGHT CONTROLS */}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-64 max-w-full rounded-md bg-white/60 dark:bg-white/10 border border-black/10 dark:border-white/10 text-sm px-4 outline-none backdrop-blur"
            />

            {/* FILTERS */}
            {filters.length > 0 && (
              <Popover.Root open={filtersOpen} onOpenChange={setFiltersOpen}>
                <Popover.Trigger asChild>
                  <button
                    className={`${baseControl} px-4 ${
                      filters.some(f => f.value.length > 0) ? "bg-blue-100 dark:bg-blue-900" : "bg-white/40 dark:bg-white/10"
                    }`}
                  >
                    Filters
                  </button>
                </Popover.Trigger>

                <Popover.Content
                  sideOffset={10}
                  className="w-[260px] max-w-[90vw] max-h-[80vh] overflow-hidden flex flex-col rounded-xl bg-white dark:bg-neutral-900 shadow-2xl border border-black/10 dark:border-white/10 backdrop-blur-xl p-4"
                >
                  <div className="flex-1 overflow-y-auto space-y-4">
                    {filters.map((filter) => (
                      <div key={filter.label}>
                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                          {filter.label}
                        </div>
                        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
                          {filter.options.map((opt) => {
                            const active = draftFilters[filter.label]?.includes(opt.value);
                            return (
                              <button
                                key={opt.value}
                                onClick={() => toggleDraftValue(filter.label, opt.value)}
                                className={`${dropdownItem} ${
                                  active ? "bg-blue-500 text-white" : "text-gray-800 dark:text-gray-200"
                                }`}
                              >
                                <span className="truncate">{opt.label}</span>
                                {active && <span>✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between pt-3 border-t border-black/5 dark:border-white/10">
                    <button
                      onClick={resetFilters}
                      className="px-4 py-1 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                      Reset
                    </button>
                    <button
                      onClick={applyFilters}
                      className="px-4 py-1 rounded-md bg-blue-500 text-white hover:bg-blue-600"
                    >
                      Done
                    </button>
                  </div>
                </Popover.Content>
              </Popover.Root>
            )}

            {/* SORT */}
            {onSortChange && sortOptions.length > 0 && (
              <Popover.Root open={sortOpen} onOpenChange={setSortOpen}>
                <Popover.Trigger asChild>
                  <button className={`${baseControl} px-4 bg-white/40 dark:bg-white/10`}>
                    Sort
                  </button>
                </Popover.Trigger>

                <Popover.Content
                  sideOffset={10}
                  className="w-[260px] max-w-[90vw] max-h-[80vh] overflow-hidden flex flex-col rounded-xl bg-white dark:bg-neutral-900 shadow-2xl border border-black/10 dark:border-white/10 backdrop-blur-xl p-4"
                >
                  <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                    {sortOptions.map((opt) => {
                      const active = sortOrder === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            onSortChange(opt.value);
                            setSortOpen(false);
                          }}
                          className={`${dropdownItem} ${
                            active ? "bg-blue-500 text-white" : "text-gray-800 dark:text-gray-200"
                          }`}
                        >
                          <span className="truncate">{opt.label}</span> {active && "✓"}
                        </button>
                      );
                    })}
                  </div>
                </Popover.Content>
              </Popover.Root>
            )}

            {/* EXPORT */}
            {exportData && (
              <Popover.Root open={exportOpen} onOpenChange={setExportOpen}>
                <Popover.Trigger asChild>
                  <button className={iconButton}>⬇</button>
                </Popover.Trigger>

                <Popover.Content
                  sideOffset={10}
                  className="w-64 max-w-[90vw] rounded-xl bg-white dark:bg-neutral-900 shadow-2xl border border-black/10 dark:border-white/10 backdrop-blur-xl p-4 flex flex-col gap-2 max-h-80 overflow-y-auto"
                >
                  <div className="text-sm font-semibold mb-2">Select columns to export</div>
                  {exportData.length > 0 &&
                    Object.keys(exportData[0]).map((col) => (
                      <label key={col} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedColumns.includes(col)}
                          onChange={() => toggleColumn(col)}
                        />
                        {col}
                      </label>
                    ))}

                  <button
                    onClick={() => {
                      handleExport();
                      setExportOpen(false);
                    }}
                    className="mt-2 px-3 py-1 rounded-md bg-blue-500 text-white hover:bg-blue-600"
                  >
                    Export
                  </button>
                </Popover.Content>
              </Popover.Root>
            )}
          </div>
        </div>
      </div>

      {/* BADGES + CLEAR ALL */}
      <div className="px-5 py-2 flex flex-wrap items-center gap-2 overflow-hidden">
        {hasSearchOrFilters && (
          <button
            onClick={clearAll}
            className="px-3 py-1 rounded-md bg-red-500 text-white hover:bg-red-600 text-xs"
          >
            Clear All
          </button>
        )}

        {activeBadges.map((badge, idx) => (
          <span key={idx} className={badgeStyle}>
            <span className="truncate">
              {badge.label}: {badge.value}
            </span>
            <button onClick={badge.onRemove} className="text-xs opacity-60 hover:opacity-100">
              ×
            </button>
          </span>
        ))}
      </div>
    </>
  );
}

const DataTableToolbar = React.memo(DataTableToolbarInner) as typeof DataTableToolbarInner;

export default DataTableToolbar;