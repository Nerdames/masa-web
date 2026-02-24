"use client";

import React, { useCallback, useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "framer-motion";

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
  value: T;
  defaultValue: T;
  options: readonly FilterOption<T>[];
  onChange: (value: T) => void;
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

/* ================= Utils ================= */
function escapeCsvCell(value: unknown): string {
  if (value == null) return "";
  const str = value instanceof Date ? value.toISOString() : String(value);
  const normalized = str.replace(/\r?\n/g, "\r\n");
  const mustQuote =
    normalized.includes(",") ||
    normalized.includes('"') ||
    normalized.includes("\n") ||
    normalized.includes("\r");
  const escaped = normalized.replace(/"/g, '""');
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
  searchPlaceholder = "Search...",
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
  const [scrolled, setScrolled] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<Record<string, TFilter>>({});

  // Initialize draftFilters
  useEffect(() => {
    const initial: Record<string, TFilter> = {};
    filters.forEach((f) => {
      initial[f.label] = f.value;
    });
    setDraftFilters(initial);
  }, [filters]);

  // Scroll shadow
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const effectiveSortOrder =
    sortOrder ?? (sortOptions.length > 0 ? sortOptions[0].value : "Newest");

  /* ======= Filter / Sort Actions ======= */
  const applyFilters = useCallback(() => {
    filters.forEach((f) => {
      const draft = draftFilters[f.label];
      if (draft !== undefined) f.onChange(draft);
    });
    setFiltersOpen(false);
  }, [filters, draftFilters]);

  const resetFilters = useCallback(() => {
    const resetState: Record<string, TFilter> = {};
    filters.forEach((f) => {
      resetState[f.label] = f.defaultValue;
      f.onChange(f.defaultValue);
    });
    setDraftFilters(resetState);
  }, [filters]);

  const removeFilter = useCallback(
    (label: string) => {
      const filter = filters.find((f) => f.label === label);
      if (!filter) return;
      setDraftFilters((prev) => ({ ...prev, [label]: filter.defaultValue }));
      filter.onChange(filter.defaultValue);
    },
    [filters]
  );

  /* ======= CSV Export ======= */
  const handleExport = useCallback(() => {
    if (!exportData?.length) return;
    const headers = Object.keys(exportData[0]);
    const csv =
      "\uFEFF" +
      [
        headers.map(escapeCsvCell).join(","),
        ...exportData.map((row) =>
          headers.map((h) => escapeCsvCell(row[h])).join(",")
        ),
      ].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [exportData, exportFileName]);

  const handleAddClick = useCallback(() => onAdd?.(), [onAdd]);
  const handleRefreshClick = useCallback(() => onRefresh(), [onRefresh]);

  const popoverMotion = {
    initial: { opacity: 0, y: -10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
  };

  const iconButtonClasses =
    "w-9 h-9 rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-700";

  return (
    <>
      {/* ================= TOP TOOLBAR ================= */}
      <div
        role="toolbar"
        className={`sticky top-0 z-20 bg-white/90 backdrop-blur transition-shadow duration-200 ${
          scrolled ? "shadow-sm border-b border-gray-200" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          {/* LEFT: Search + Filters + Sort */}
          <div className="flex items-center flex-1 gap-2 min-w-0">
            {/* SEARCH */}
            <div className="relative w-[250px] h-9 rounded-lg border border-gray-300 bg-white">
              <input
                type="text"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full h-full px-3 text-sm outline-none bg-transparent truncate"
              />
            </div>

            <div className="flex gap-2">
              {/* FILTERS */}
              {filters.length > 0 && (
                <Popover.Root open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <Popover.Trigger asChild>
                    <button className={iconButtonClasses} aria-label="Filters">
                      <i className="bx bx-filter text-lg" />
                    </button>
                  </Popover.Trigger>
                  <AnimatePresence>
                    {filtersOpen && (
                      <Popover.Portal forceMount>
                        <Popover.Content sideOffset={6} asChild>
                          <motion.div
                            {...popoverMotion}
                            className="w-80 bg-white border border-gray-200 rounded-lg shadow p-4 space-y-3"
                          >
                            {filters.map((filter) => (
                              <div key={filter.label}>
                                <div className="text-sm font-medium text-gray-700">
                                  {filter.label}
                                </div>
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {filter.options.map((opt) => {
                                    const selected = draftFilters[filter.label] === opt.value;
                                    return (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() =>
                                          setDraftFilters((prev) => ({
                                            ...prev,
                                            [filter.label]: opt.value,
                                          }))
                                        }
                                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                          selected
                                            ? "bg-gray-700 text-white"
                                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}

                            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                              <button
                                type="button"
                                onClick={resetFilters}
                                className="text-sm text-gray-500 hover:text-gray-700 font-medium"
                              >
                                Reset
                              </button>
                              <button
                                type="button"
                                onClick={applyFilters}
                                className="px-4 py-1.5 rounded-lg text-sm font-medium bg-gray-700 text-white hover:bg-gray-800"
                              >
                                Apply
                              </button>
                            </div>
                          </motion.div>
                        </Popover.Content>
                      </Popover.Portal>
                    )}
                  </AnimatePresence>
                </Popover.Root>
              )}

              {/* SORT */}
              {onSortChange && sortOptions.length > 0 && (
                <Popover.Root open={sortOpen} onOpenChange={setSortOpen}>
                  <Popover.Trigger asChild>
                    <button className={iconButtonClasses} aria-label="Sort">
                      <i className="bx bx-sort text-lg" />
                    </button>
                  </Popover.Trigger>
                  <AnimatePresence>
                    {sortOpen && (
                      <Popover.Portal forceMount>
                        <Popover.Content sideOffset={6} asChild>
                          <motion.div
                            {...popoverMotion}
                            className="w-48 bg-white border border-gray-200 rounded-lg shadow p-3 space-y-2"
                          >
                            {sortOptions.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  onSortChange(opt.value);
                                  setSortOpen(false);
                                }}
                                className={`w-full text-left px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                                  effectiveSortOrder === opt.value
                                    ? "bg-gray-700 text-white"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </motion.div>
                        </Popover.Content>
                      </Popover.Portal>
                    )}
                  </AnimatePresence>
                </Popover.Root>
              )}
            </div>
          </div>

          {/* RIGHT: Add / Export / Refresh */}
          <div className="flex items-center gap-2">
            {onAdd && (
              <button
                onClick={handleAddClick}
                aria-label="Add"
                className="w-9 h-9 rounded-full border border-gray-300 bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-700"
              >
                <i className="bx bx-plus text-lg" />
              </button>
            )}

            {exportData && (
              <button
                onClick={handleExport}
                disabled={!exportData.length}
                aria-label="Export CSV"
                className="w-9 h-9 rounded-full border border-gray-300 bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-700 disabled:opacity-50"
              >
                <i className="bx bx-download text-lg" />
              </button>
            )}

            <button
              onClick={handleRefreshClick}
              disabled={refreshing}
              aria-label="Refresh"
              className="w-9 h-9 rounded-full border border-gray-300 bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-700 disabled:opacity-50"
            >
              <i className={`bx bx-refresh ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ================= BADGE / PILL LAYER ================= */}
      <div className="flex flex-wrap items-center justify-between gap-2 min-h-[30px] px-2 py-1">
        {/* MIDDLE: Search (truncated) */}
        <div className="flex-1 flex justify-left min-w-0">
          {search ? (
            <div className="flex items-center text-gray-700 text-sm font-medium truncate">
              Search:{" "}
              <span className="ml-1 truncate max-w-[150px]">{search}</span>
              <button
                onClick={() => onSearchChange("")}
                className="ml-2 text-gray-700 hover:text-gray-500 font-bold"
                aria-label="Clear search"
              >
                ×
              </button>
            </div>
          ) : (
            <span className="text-gray-400">&nbsp;</span>
          )}
        </div>

        {/* RIGHT: Active filters + Sorting */}
        <div className="flex items-center gap-2 min-h-[22px] min-w-[120px]">
          {filters
            .filter((f) => f.value !== f.defaultValue)
            .map((f) => (
              <div
                key={f.label}
                className="flex items-center bg-gray-50 border border-gray-300 text-gray-700 rounded-full text-xs font-medium px-2 py-1 truncate"
              >
                <span className="truncate max-w-[80px]">
                  {f.label}: {f.value}
                </span>
                <button
                  onClick={() => removeFilter(f.label)}
                  className="ml-1 text-gray-700 hover:text-red-500 font-bold"
                  aria-label={`Remove filter ${f.label}`}
                >
                  ×
                </button>
              </div>
            ))}

          {sortOrder && (
            <span className="text-sm font-medium text-gray-700 truncate max-w-[120px]">
              Sorted by: {sortOrder}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

const DataTableToolbar = React.memo(DataTableToolbarInner) as typeof DataTableToolbarInner;
export default DataTableToolbar;