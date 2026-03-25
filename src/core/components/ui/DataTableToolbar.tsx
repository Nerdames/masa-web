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
  searchPlaceholder = "Search for category, name, company, etc",
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
  const [exportOpen, setExportOpen] = useState(false);

  /* ================= Logic Restored: Draft Filters ================= */
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
          [filter.label]: exists ? arr.filter((v) => v !== optionValue) : [...arr, optionValue],
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

  /* ================= Logic Restored: Export Columns ================= */
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  useEffect(() => {
    if (exportData?.length) setSelectedColumns(Object.keys(exportData[0]));
    else setSelectedColumns([]);
  }, [exportData]);

  const handleExport = useCallback(() => {
    if (!exportData?.length || !selectedColumns.length) return;
    const csv = "\uFEFF" + [
      selectedColumns.map(escapeCsvCell).join(","),
      ...exportData.map((row) => selectedColumns.map((h) => escapeCsvCell(row[h])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName;
    link.click();
    URL.revokeObjectURL(url);
  }, [exportData, selectedColumns, exportFileName]);

  /* ================= Logic Restored: Active Badges ================= */
  const activeBadges = useMemo(() => {
    const tokens: { label: string; value: string; onRemove?: () => void }[] = [];
    if (search) {
      tokens.push({ label: "Search", value: search, onRemove: () => onSearchChange("") });
    }
    filters.forEach((f) => {
      const isMulti = Array.isArray(f.value);
      const isDefault = isMulti 
        ? f.value.length === 0 || JSON.stringify(f.value) === JSON.stringify(f.defaultValue)
        : f.value === f.defaultValue;

      if (!isDefault) {
        tokens.push({
          label: f.label,
          value: isMulti ? (f.value as TFilter[]).join(", ") : String(f.value),
          onRemove: () => f.onChange(f.defaultValue),
        });
      }
    });
    return tokens;
  }, [filters, search, onSearchChange]);

  /* ================= Styles (Aligned to Images) ================= */
  const labelStyle = "text-[11px] font-bold text-slate-500 mb-1.5 ml-1 block uppercase tracking-tight";
  const inputBase = "h-11 rounded-xl bg-slate-50 border border-slate-200 px-4 text-sm transition-all outline-none focus:ring-2 focus:ring-[#3D5AFE]/10 focus:border-[#3D5AFE]/40";
  const primaryBtn = "h-11 px-8 rounded-xl bg-[#3D5AFE] hover:bg-[#2A48E0] text-white text-[11px] font-bold tracking-widest transition-all active:scale-95 uppercase shadow-md shadow-blue-500/20";
  const ghostIconBtn = "w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors text-slate-400";
  const badgeStyle = "flex items-center gap-2 px-3 py-1 rounded-lg text-[10px] font-bold uppercase bg-slate-100 border border-slate-200 text-slate-600";

  return (
    <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 mb-4 overflow-hidden">
      
      {/* Top Header: Image 1 Reference */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
        <h2 className="text-lg font-bold text-slate-800 tracking-tight">Product Summary</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Show 
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
              ALL COLUMN <i className="bx bx-chevron-down text-sm" />
            </button>
          </div>
          <button onClick={onAdd} className={primaryBtn}>
            DISPATCH SELECTED
          </button>
          <div className="flex items-center border-l border-slate-100 ml-2 pl-4 gap-1">
             <button onClick={onRefresh} className={ghostIconBtn} title="Refresh">
                <i className={`bx bx-refresh text-2xl ${refreshing ? "bx-spin" : ""}`} />
             </button>
             {exportData && (
              <Popover.Root open={exportOpen} onOpenChange={setExportOpen}>
                <Popover.Trigger asChild>
                  <button className={ghostIconBtn} title="Export CSV">
                    <i className="bx bx-download text-xl" />
                  </button>
                </Popover.Trigger>
                <Popover.Content align="end" className="w-64 z-50 rounded-xl bg-white shadow-2xl border border-slate-200 p-4">
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-3">Columns to Export</div>
                  <div className="space-y-1 max-h-48 overflow-y-auto mb-4 pr-2">
                    {exportData.length > 0 && Object.keys(exportData[0]).map((col) => (
                      <label key={col} className="flex items-center gap-3 text-sm cursor-pointer p-1.5 hover:bg-slate-50 rounded-lg">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-[#3D5AFE]"
                          checked={selectedColumns.includes(col)}
                          onChange={() => setSelectedColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col])}
                        />
                        <span className="truncate text-slate-600">{col}</span>
                      </label>
                    ))}
                  </div>
                  <button onClick={() => { handleExport(); setExportOpen(false); }} className="w-full py-2.5 rounded-lg bg-[#3D5AFE] text-white text-xs font-bold shadow-lg">
                    Download CSV
                  </button>
                </Popover.Content>
              </Popover.Root>
             )}
          </div>
        </div>
      </div>

      {/* Main Toolbar: Image 2 Reference */}
      <div className="p-6 flex flex-wrap items-end gap-4 bg-white">
        <div className="flex-1 min-w-[280px]">
          <label className={labelStyle}>What are you looking for?</label>
          <div className="relative">
            <i className="bx bx-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className={`${inputBase} w-full pl-11`}
            />
          </div>
        </div>

        {/* Dynamic Filter Selects */}
        {filters.map((filter) => (
          <div key={filter.label} className="w-48">
            <label className={labelStyle}>{filter.label}</label>
            <Popover.Root>
              <Popover.Trigger asChild>
                <button className={`${inputBase} w-full flex items-center justify-between text-slate-600`}>
                  <span className="truncate">{Array.isArray(filter.value) ? (filter.value.length ? filter.value.join(", ") : "All") : filter.value || "All"}</span>
                  <i className="bx bx-chevron-down text-slate-300" />
                </button>
              </Popover.Trigger>
              <Popover.Content align="start" className="w-56 z-50 rounded-xl bg-white shadow-2xl border border-slate-100 p-2">
                <div className="max-h-60 overflow-y-auto">
                   {filter.options.map((opt) => {
                      const active = Array.isArray(draftFilters[filter.label]) 
                        ? draftFilters[filter.label]?.includes(opt.value) 
                        : draftFilters[filter.label] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => toggleDraftValue(filter, opt.value)}
                          className={`w-full text-left px-3 py-2 text-sm rounded-lg mb-1 transition-colors ${active ? 'bg-blue-50 text-[#3D5AFE] font-medium' : 'hover:bg-slate-50 text-slate-600'}`}
                        >
                          {opt.label}
                        </button>
                      )
                   })}
                </div>
                <div className="flex gap-2 pt-2 mt-2 border-t border-slate-50">
                   <button onClick={resetFilters} className="flex-1 py-1.5 text-[10px] font-bold text-slate-400 hover:text-red-500 uppercase">Reset</button>
                   <button onClick={applyFilters} className="flex-1 py-1.5 bg-[#3D5AFE] text-white text-[10px] font-bold rounded-md uppercase">Apply</button>
                </div>
              </Popover.Content>
            </Popover.Root>
          </div>
        ))}

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button className="w-11 h-11 flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 shadow-sm transition-all">
            <i className="bx bx-chevrons-down" />
          </button>
          <button className={primaryBtn}>
            SEARCH
          </button>
        </div>
      </div>

      {/* Active Badges Area (Restored Logic) */}
      {activeBadges.length > 0 && (
        <div className="px-6 pb-4 flex flex-wrap items-center gap-2">
           <button onClick={() => { onSearchChange(""); resetFilters(); }} className="text-[10px] font-black text-red-500 uppercase tracking-tighter mr-2 hover:underline">
             Clear All
           </button>
           {activeBadges.map((badge, idx) => (
            <span key={idx} className={badgeStyle}>
              <span className="opacity-40">{badge.label}:</span> {badge.value}
              <button onClick={badge.onRemove} className="ml-1.5 text-slate-400 hover:text-red-500 text-sm leading-none">×</button>
            </span>
           ))}
        </div>
      )}
    </div>
  );
}

const DataTableToolbar = React.memo(DataTableToolbarInner) as typeof DataTableToolbarInner;
export default DataTableToolbar;