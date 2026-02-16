"use client";

import React, { useState, useEffect } from "react";
import { Tooltip } from "@/components/feedback/Tooltip";

interface DataTableToolbarProps {
  /* Search */
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchLoading?: boolean;

  /* Optional Date Filter */
  date?: string;
  onDateChange?: (value: string) => void;

  /* Refresh */
  onRefresh: () => void;
  refreshing?: boolean;

  /* Bulk Action */
  selectedCount?: number;
  onBulkAction?: () => void;
  bulkActionIcon?: React.ReactNode;
  bulkActionTooltip?: string;

  /* Add / Create */
  onAdd?: () => void;
  addTooltip?: string;
  addIcon?: React.ReactNode;

  /* Extra Slots */
  leftExtra?: React.ReactNode;
  rightExtra?: React.ReactNode;
}

export default function DataTableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  searchLoading = false,
  date,
  onDateChange,
  onRefresh,
  refreshing = false,
  selectedCount = 0,
  onBulkAction,
  bulkActionIcon,
  bulkActionTooltip = "Bulk action",
  onAdd,
  addTooltip = "Add",
  addIcon,
  leftExtra,
  rightExtra,
}: DataTableToolbarProps) {
  const [localSearch, setLocalSearch] = useState(search);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localSearch !== search) onSearchChange(localSearch);
    }, 300);
    return () => clearTimeout(handler);
  }, [localSearch, onSearchChange, search]);

  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  return (
    <div className="sticky top-0 z-40 bg-white p-3 flex flex-wrap items-center gap-2 shadow-sm">
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="border rounded-lg p-2 text-sm h-10 min-w-[250px] pr-10"
          aria-label="Search"
        />
        {searchLoading && (
          <i className="bx bx-loader-alt animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        )}
      </div>

      {/* Date Filter (optional) */}
      {onDateChange && (
        <div className="flex items-center gap-2 border rounded-lg px-3 bg-white h-10">
          <i className="bx bx-calendar text-gray-500" />
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="text-sm outline-none"
            aria-label="Filter by date"
          />
        </div>
      )}

      {/* Left Extra Slot */}
      {leftExtra}

      {/* Refresh Button */}
      <Tooltip content="Refresh">
        <button
          onClick={onRefresh}
          className={`w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition ${
            refreshing ? "animate-spin" : ""
          }`}
          disabled={refreshing}
          aria-label="Refresh"
        >
          <i className="bx bx-refresh text-lg" />
        </button>
      </Tooltip>

      {/* Bulk Action Button */}
      {selectedCount > 0 && onBulkAction && (
        <Tooltip content={bulkActionTooltip}>
          <button
            onClick={onBulkAction}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-red-100 transition"
            aria-label={bulkActionTooltip}
          >
            {bulkActionIcon ?? (
              <i className="bx bx-trash-alt text-red-600 text-lg" />
            )}
          </button>
        </Tooltip>
      )}

      {/* Right Section */}
      <div className="ml-auto flex items-center gap-2">
        {rightExtra}

        {/* Add Button */}
        {onAdd && (
          <Tooltip content={addTooltip}>
            <button
              onClick={onAdd}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-green-100 transition"
              aria-label={addTooltip}
            >
              {addIcon ?? (
                <i className="bx bx-plus text-green-600 text-lg" />
              )}
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
