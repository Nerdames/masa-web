"use client";

import React from "react";

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  loading?: boolean;

  /* Selection */
  selectable?: boolean;
  selectedIds?: Set<string>;
  getRowId?: (row: T) => string;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
  isAllSelected?: boolean;
  isIndeterminate?: boolean;

  /* Row click */
  onRowClick?: (row: T) => void;

  /* Skeleton */
  skeletonRows?: number;

  /* Empty state */
  emptyMessage?: string;
}

export default function DataTable<T>({
  data,
  columns,
  loading = false,

  selectable = false,
  selectedIds,
  getRowId,
  onToggleSelect,
  onToggleSelectAll,
  isAllSelected,
  isIndeterminate,

  onRowClick,

  skeletonRows = 8,
  emptyMessage = "No records found.",
}: DataTableProps<T>) {
  return (
    <div className="flex-1 overflow-x-auto">
      <table className="w-full text-sm table-fixed border-separate border-spacing-y-3">
        <thead className="text-xs bg-gray-100 uppercase text-gray-500 text-center">
          <tr>
            {selectable && (
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = Boolean(isIndeterminate);
                  }}
                  onChange={onToggleSelectAll}
                  className="accent-blue-600"
                />
              </th>
            )}

            {columns.map((col) => (
              <th
                key={col.key}
                className={`p-4 ${
                  col.align === "left"
                    ? "text-left"
                    : col.align === "right"
                    ? "text-right"
                    : "text-center"
                }`}
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Loading Skeleton */}
          {loading &&
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                {selectable && (
                  <td className="p-4">
                    <div className="h-4 w-4 bg-gray-200 rounded mx-auto" />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className="p-4">
                    <div className="h-4 w-full bg-gray-200 rounded" />
                  </td>
                ))}
              </tr>
            ))}

          {/* Empty State */}
          {!loading && data.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="p-6 text-center text-gray-400"
              >
                {emptyMessage}
              </td>
            </tr>
          )}

          {/* Rows */}
          {!loading &&
            data.map((row) => {
              const id = getRowId?.(row);
              const isSelected = id && selectedIds?.has(id);

              return (
                <tr
                  key={id}
                  className={`
                    bg-white rounded-xl shadow-sm transition
                    ${
                      isSelected
                        ? "bg-green-100 text-green-700"
                        : "hover:bg-green-50 hover:text-green-700"
                    }
                    ${onRowClick ? "cursor-pointer" : ""}
                  `}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable && id && (
                    <td
                      className="p-4 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect?.(id)}
                        className="accent-blue-600"
                      />
                    </td>
                  )}

                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`p-4 ${
                        col.align === "left"
                          ? "text-left"
                          : col.align === "right"
                          ? "text-right"
                          : "text-center"
                      }`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
