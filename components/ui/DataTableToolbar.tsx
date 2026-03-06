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
  value: T | readonly T[];
  defaultValue: T | readonly T[];
  options: readonly FilterOption<T>[];
  onChange: (value: any) => void;
}

type ExportableRow = Record<string, unknown>;

interface DataTableToolbarProps<
  T extends ExportableRow,
  TSort extends string = string,
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

/* ================= CSV Helper ================= */

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

function DataTableToolbarInner<
  T extends ExportableRow,
  TSort extends string = string,
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

  /* ================= Draft Filters State ================= */

  const [draftFilters, setDraftFilters] = useState<Record<string, any>>({});

  useEffect(() => {
    const initial: Record<string, any> = {};
    filters.forEach((f) => (initial[f.label] = f.value));
    setDraftFilters(initial);
  }, [filters]);

  const toggleDraftValue = (filter: FilterConfig<TFilter>, optionValue: TFilter) => {
    const isMulti = Array.isArray(filter.value);
    
    setDraftFilters((prev) => {
      const current = prev[filter.label];

      if (isMulti) {
        const arr = Array.isArray(current) ? current : [];
        const exists = arr.includes(optionValue);
        return {
          ...prev,
          [filter.label]: exists 
            ? arr.filter((v) => v !== optionValue) 
            : [...arr, optionValue],
        };
      } else {
        return { ...prev, [filter.label]: optionValue };
      }
    });
  };

  const applyFilters = useCallback(() => {
    filters.forEach((f) => f.onChange(draftFilters[f.label]));
    setFiltersOpen(false);
  }, [filters, draftFilters]);

  const resetFilters = useCallback(() => {
    filters.forEach((f) => f.onChange(f.defaultValue));
    setFiltersOpen(false);
  }, [filters]);

  /* ================= EXPORT ================= */

  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  useEffect(() => {
    if (exportData?.length) setSelectedColumns(Object.keys(exportData[0]));
    else setSelectedColumns([]);
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
    "h-9 text-sm rounded-md border border-black/10 dark:border-white/10 backdrop-blur transition hover:bg-white/10";

  const iconButton =
    "w-9 h-9 flex items-center justify-center rounded-md border border-black/10 " +
    "bg-white/40 dark:bg-white/10 backdrop-blur transition hover:bg-white/80 dark:hover:bg-white/20 " +
    "active:scale-95";

  const dropdownItem =
    "flex items-center justify-between px-3 py-2 text-sm rounded-md transition " +
    "hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.98]";

  const badgeStyle =
    "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium " +
    "bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 " +
    "backdrop-blur truncate max-w-[220px]";

  /* ================= Active Badges Logic ================= */

  const activeBadges = useMemo(() => {
    const tokens: { label: string; value: string; onRemove?: () => void }[] = [];

    // 1. Search (Only show badge if there is actual input)
    if (search) {
      tokens.push({ 
        label: "Search", 
        value: search, 
        onRemove: () => onSearchChange("") 
      });
    }

    // 2. Filters (Always show)
    filters.forEach((f) => {
      const isMulti = Array.isArray(f.value);
      const isDefault = isMulti 
        ? f.value.length === 0 || JSON.stringify(f.value) === JSON.stringify(f.defaultValue)
        : f.value === f.defaultValue;

      const displayValue = isMulti 
        ? (f.value.length === 0 ? "None" : (f.value as TFilter[]).join(", ")) 
        : String(f.value);

      tokens.push({
        label: f.label,
        value: displayValue,
        // Only allow "removal" if it's not already default
        onRemove: !isDefault ? () => f.onChange(f.defaultValue) : undefined,
      });
    });

    // 3. Sort (Always show)
    if (sortOrder && onSortChange && sortOptions.length > 0) {
      const currentSort = sortOptions.find(o => o.value === sortOrder);
      const isDefaultSort = sortOrder === sortOptions[0].value;

      if (currentSort) {
        tokens.push({
          label: "Sort",
          value: currentSort.label,
          onRemove: !isDefaultSort ? () => onSortChange(sortOptions[0].value as TSort) : undefined,
        });
      }
    }

    return tokens;
  }, [filters, search, sortOrder, onSearchChange, onSortChange, sortOptions]);

  const hasBadges = activeBadges.length > 0;

  const clearAll = () => {
    onSearchChange("");
    filters.forEach((f) => f.onChange(f.defaultValue));
    if (onSortChange && sortOptions.length > 0) {
      onSortChange(sortOptions[0].value as TSort);
    }
  };

  return (
    <>
      <div className="sticky top-0 z-30 backdrop-blur-xl bg-white/60 dark:bg-neutral-900/60 border-b border-black/10 dark:border-white/10">
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          
          <div className="flex items-center gap-2">
            {onAdd && (
              <button onClick={onAdd} className={iconButton} title="Add New">
                <span className="text-lg">+</span>
              </button>
            )}
            <button 
              onClick={onRefresh} 
              disabled={refreshing} 
              className={iconButton} 
              title="Refresh Data"
            >
              <i className={`bx bx-refresh text-lg ${refreshing ? "bx-spin" : ""}`} />
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 justify-end">
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-48 md:w-64 rounded-md bg-white/60 dark:bg-white/10 border border-black/10 dark:border-white/10 text-sm px-4 outline-none focus:ring-1 focus:ring-blue-500/50 transition-all"
            />

            {filters.length > 0 && (
              <Popover.Root open={filtersOpen} onOpenChange={setFiltersOpen}>
                <Popover.Trigger asChild>
                  <button className={`${baseControl} px-4 bg-white/40 dark:bg-white/10 flex items-center gap-2`}>
                    Filters
                    {filters.some(f => JSON.stringify(f.value) !== JSON.stringify(f.defaultValue)) && (
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </button>
                </Popover.Trigger>

                <Popover.Content
                  sideOffset={10}
                  align="end"
                  className="w-[260px] z-50 rounded-xl bg-white dark:bg-neutral-900 shadow-2xl border border-black/10 dark:border-white/10 p-4 flex flex-col"
                >
                  <div className="flex-1 overflow-y-auto space-y-4 max-h-[60vh]">
                    {filters.map((filter) => (
                      <div key={filter.label}>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2">
                          {filter.label}
                        </div>
                        <div className="flex flex-col gap-1">
                          {filter.options.map((opt) => {
                            const isMulti = Array.isArray(draftFilters[filter.label]);
                            const active = isMulti 
                              ? draftFilters[filter.label]?.includes(opt.value)
                              : draftFilters[filter.label] === opt.value;
                            
                            return (
                              <button
                                key={opt.value}
                                onClick={() => toggleDraftValue(filter, opt.value)}
                                className={`${dropdownItem} ${active ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium" : "text-gray-600 dark:text-gray-300"}`}
                              >
                                <span className="truncate">{opt.label}</span>
                                {active && <span className="text-xs">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between pt-3 mt-3 border-t border-black/5 dark:border-white/10">
                    <button onClick={resetFilters} className="text-xs text-gray-500 hover:text-red-500 transition-colors">
                      Reset
                    </button>
                    <button onClick={applyFilters} className="px-3 py-1 rounded-md bg-blue-500 text-white text-xs font-semibold hover:bg-blue-600 transition-colors">
                      Apply
                    </button>
                  </div>
                </Popover.Content>
              </Popover.Root>
            )}

            {onSortChange && sortOptions.length > 0 && (
              <Popover.Root open={sortOpen} onOpenChange={setSortOpen}>
                <Popover.Trigger asChild>
                  <button className={`${baseControl} px-4 bg-white/40 dark:bg-white/10`}>
                    Sort
                  </button>
                </Popover.Trigger>
                <Popover.Content align="end" sideOffset={10} className="w-48 z-50 rounded-xl bg-white dark:bg-neutral-900 shadow-2xl border border-black/10 dark:border-white/10 p-2">
                  {sortOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { onSortChange(opt.value); setSortOpen(false); }}
                      className={`${dropdownItem} ${sortOrder === opt.value ? "text-blue-500 font-bold" : ""}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </Popover.Content>
              </Popover.Root>
            )}

            {exportData && (
              <Popover.Root open={exportOpen} onOpenChange={setExportOpen}>
                <Popover.Trigger asChild>
                  <button className={iconButton} title="Export CSV">⬇</button>
                </Popover.Trigger>
                <Popover.Content sideOffset={10} align="end" className="w-64 z-50 rounded-xl bg-white dark:bg-neutral-900 shadow-2xl border border-black/10 dark:border-white/10 p-4">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Columns</div>
                  <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
                    {exportData.length > 0 && Object.keys(exportData[0]).map((col) => (
                      <label key={col} className="flex items-center gap-3 text-sm cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 p-1 rounded transition-colors">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={selectedColumns.includes(col)}
                          onChange={() => toggleColumn(col)}
                        />
                        <span className="truncate">{col}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => { handleExport(); setExportOpen(false); }}
                    className="w-full py-2 rounded-md bg-blue-500 text-white text-xs font-bold hover:bg-blue-600 transition-colors"
                  >
                    Download CSV
                  </button>
                </Popover.Content>
              </Popover.Root>
            )}
          </div>
        </div>
      </div>

      {/* ACTIVE BADGES AREA */}
      {hasBadges && (
        <div className="px-5 py-2 flex flex-wrap items-center gap-2 border-b border-black/5 dark:border-white/5 bg-white/20 dark:bg-black/10">
          <button
            onClick={clearAll}
            className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-tighter bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white transition-all mr-1"
          >
            Clear All
          </button>
          {activeBadges.map((badge, idx) => (
            <span key={idx} className={badgeStyle}>
              <span className="opacity-50 font-normal">{badge.label}:</span>
              <span className="truncate">{badge.value}</span>
              {badge.onRemove && (
                <button onClick={badge.onRemove} className="ml-1 hover:text-red-500 transition-colors">
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

const DataTableToolbar = React.memo(DataTableToolbarInner) as typeof DataTableToolbarInner;

export default DataTableToolbar;