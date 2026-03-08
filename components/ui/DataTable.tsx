"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Tooltip } from "@/components/feedback/Tooltip";
import { useToast } from "@/components/feedback/ToastProvider";

/* ================= Types ================= */
export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
  render: (row: T) => React.ReactNode;
  hideTooltip?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  tableId: string;
  loading?: boolean;
  getRowId?: (row: T, index: number) => string;
  onRowClick?: (row: T) => string | void;
  getRowClassName?: (row: T) => string;
  dateField?: keyof T;
}

/* ================= Helpers ================= */
function getAlignClass(align?: "left" | "center" | "right") {
  if (align === "left") return "text-left";
  if (align === "right") return "text-right";
  return "text-center";
}

/* ================= Hub Settings Defaults ================= */
const HUB_SETTINGS = [
  { key: "row_density", defaultValue: "standard" },
  { key: "table_font_size", defaultValue: "md" },
  { key: "table_wrap_cells", defaultValue: false },
  { key: "table_sticky_header", defaultValue: true },
  { key: "table_row_numbers", defaultValue: false },
  { key: "table_highlight_hover", defaultValue: true },
  { key: "table_group_dates", defaultValue: true },
  { key: "table_rows_per_page", defaultValue: 25 },
  { key: "table_tooltips", defaultValue: true },
];

/* ================= Component ================= */
function DataTable<T>({
  data,
  columns,
  tableId,
  loading = false,
  getRowId,
  onRowClick,
  getRowClassName,
  dateField,
}: DataTableProps<T>) {
  const { data: session } = useSession();
  const { addToast } = useToast();
  const pathname = usePathname();

  /* ---------------- Page Key ---------------- */
  const pageKey = useMemo(() => {
    if (!pathname) return "unknown-page";
    const segments = pathname.split("/").filter(Boolean);
    let key = segments[segments.length - 1] || "overview";
    if (key.length > 20) key = key.slice(0, 20);
    return `${key}-page`;
  }, [pathname]);

  /* ---------------- Default Prefs ---------------- */
  const defaultTablePrefs = useMemo(() => {
    return HUB_SETTINGS.reduce((acc, s) => {
      acc[s.key] = s.defaultValue;
      return acc;
    }, {} as Record<string, any>);
  }, []);

  /* ---------------- State ---------------- */
  const [tablePrefs, setTablePrefs] = useState<Record<string, any>>(defaultTablePrefs);
  const [columnOrder, setColumnOrder] = useState<string[]>(columns.map(c => c.key));
  const [page, setPage] = useState(1);

  const dragCol = useRef<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const preferenceKey = `columnOrder:${pageKey}`;

  /* ---------------- Load Preferences ---------------- */
  useEffect(() => {
    if (!session?.user) return;

    const controller = new AbortController();

    const loadPreferences = async () => {
      try {
        /* Load column order */
        const orderRes = await fetch(
          `/api/preferences?category=TABLE&key=${preferenceKey}&target=${tableId}`,
          { signal: controller.signal }
        );

        if (orderRes.ok) {
          const json = await orderRes.json();
          if (Array.isArray(json.preference)) {
            setColumnOrder(json.preference);
          }
        }

        /* Load all TABLE preferences */
        const prefsRes = await fetch(`/api/preferences?category=TABLE&all=true`, {
          cache: "no-store",
        });

        if (prefsRes.ok) {
          const json = await prefsRes.json();

          if (Array.isArray(json.preferences)) {
            const mapped = json.preferences.reduce((acc: any, p: any) => {
              acc[p.key] = p.value;
              return acc;
            }, {});

            setTablePrefs(prev => ({
              ...prev,
              ...mapped,
            }));
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;

        addToast({
          type: "error",
          title: "Load Failed",
          message: "Could not load table preferences.",
        });
      }
    };

    loadPreferences();
    return () => controller.abort();
  }, [session, tableId, preferenceKey, addToast]);

  /* ---------------- Save Column Order ---------------- */
  const savePreferences = useCallback(
    (newOrder: string[]) => {
      if (!session?.user) return;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await fetch("/api/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scope: "USER",
              category: "TABLE",
              key: preferenceKey,
              target: tableId,
              value: newOrder,
              organizationId: session.user.organizationId,
              branchId: session.user.branchId,
              personnelId: session.user.id,
            }),
          });
        } catch {
          addToast({
            type: "error",
            title: "Save Failed",
            message: "Could not save column order.",
          });
        }
      }, 600);
    },
    [preferenceKey, tableId, session, addToast]
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  /* ---------------- Column Ordering ---------------- */
  const orderedColumns = useMemo(() => {
    const validKeys = columns.map(c => c.key);

    const safeOrder = [
      ...columnOrder.filter(k => validKeys.includes(k)),
      ...validKeys.filter(k => !columnOrder.includes(k)),
    ];

    return safeOrder
      .map(key => columns.find(c => c.key === key)!)
      .filter(Boolean);
  }, [columnOrder, columns]);

  const handleDragStart = (key: string) => (dragCol.current = key);

  const handleDrop = (targetKey: string) => {
    const sourceKey = dragCol.current;
    if (!sourceKey || sourceKey === targetKey) return;

    setColumnOrder(prev => {
      const newOrder = [...prev];
      const from = newOrder.indexOf(sourceKey);
      const to = newOrder.indexOf(targetKey);

      newOrder.splice(from, 1);
      newOrder.splice(to, 0, sourceKey);

      savePreferences(newOrder);

      addToast({
        type: "success",
        title: "Column Reordered",
        message: `${sourceKey} moved`,
        duration: 1500,
      });

      return newOrder;
    });

    dragCol.current = null;
  };

  /* ---------------- Pagination ---------------- */
  const total = data.length;
  const rowsPerPage = tablePrefs.table_rows_per_page ?? 25;
  const pageCount = Math.ceil(total / rowsPerPage);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return data.slice(start, start + rowsPerPage);
  }, [data, page, rowsPerPage]);

  /* ---------------- Row Padding ---------------- */
  const rowPaddingClass =
    tablePrefs.row_density === "compact" ? "py-2 px-3" : "py-4 px-5";

  /* ================= Render ================= */
  return (
    <div>
      <div className="w-full overflow-x-auto rounded-2xl bg-white/80 dark:bg-neutral-900/60 backdrop-blur-xl border border-white/30 dark:border-white/20 shadow-lg">
        <table
          className={`w-full table-auto ${
            tablePrefs.table_font_size === "sm"
              ? "text-sm"
              : tablePrefs.table_font_size === "lg"
              ? "text-lg"
              : "text-base"
          }`}
        >
          <thead
            className={`${
              tablePrefs.table_sticky_header ? "sticky top-0 z-10" : ""
            } bg-white/95 dark:bg-neutral-900/95 border-b border-neutral-300 dark:border-neutral-700`}
          >
            <tr>
              {tablePrefs.table_row_numbers && <th className={rowPaddingClass}>#</th>}

              {orderedColumns.map(col => (
                <th
                  key={col.key}
                  draggable
                  onDragStart={() => handleDragStart(col.key)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => handleDrop(col.key)}
                  style={{ width: col.width, minWidth: "80px" }}
                  className={`${rowPaddingClass} text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-400 cursor-move select-none ${getAlignClass(
                    col.align
                  )}`}
                >
                  <Tooltip content={typeof col.header === "string" ? col.header : ""}>
                    <div
                      className={`${
                        tablePrefs.table_wrap_cells ? "break-words" : "truncate"
                      } max-w-[250px]`}
                    >
                      {col.header}
                    </div>
                  </Tooltip>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {!loading &&
              paginatedData.map((row, index) => {
                const key =
                  getRowId?.(row, index) ??
                  `${JSON.stringify(row)}-${index}`;

                const globalIndex = (page - 1) * rowsPerPage + index;

                return (
                  <tr
                    key={key}
                    onClick={() => {
                      if (onRowClick) {
                        const url = onRowClick(row);
                        if (typeof url === "string") window.open(url, "_blank");
                      }
                    }}
                    className={`border-b border-neutral-200 dark:border-neutral-700 transition-colors duration-200 ${
                      tablePrefs.table_highlight_hover
                        ? globalIndex % 2 === 0
                          ? "bg-white dark:bg-neutral-900 hover:bg-blue-50 dark:hover:bg-blue-900"
                          : "bg-neutral-50 dark:bg-neutral-800 hover:bg-blue-50 dark:hover:bg-blue-900"
                        : globalIndex % 2 === 0
                        ? "bg-white dark:bg-neutral-900"
                        : "bg-neutral-50 dark:bg-neutral-800"
                    } cursor-pointer ${getRowClassName?.(row) ?? ""}`}
                  >
                    {tablePrefs.table_row_numbers && (
                      <td className={rowPaddingClass + " text-neutral-500"}>
                        {globalIndex + 1}
                      </td>
                    )}

                    {orderedColumns.map(col => {
                      const cellContent = col.render(row);
                      const tooltipText =
                        typeof cellContent === "string" ||
                        typeof cellContent === "number"
                          ? String(cellContent)
                          : "";

                      const showTooltip =
                        tablePrefs.table_tooltips && !col.hideTooltip;

                      return (
                        <td
                          key={col.key}
                          style={{ width: col.width, minWidth: "80px" }}
                          className={`${rowPaddingClass} text-neutral-700 dark:text-neutral-200 ${getAlignClass(
                            col.align
                          )}`}
                        >
                          {showTooltip ? (
                            <Tooltip content={tooltipText}>
                              <div
                                className={`${
                                  tablePrefs.table_wrap_cells
                                    ? "break-words"
                                    : "truncate"
                                } max-w-[250px]`}
                              >
                                {cellContent}
                              </div>
                            </Tooltip>
                          ) : (
                            <div
                              className={`${
                                tablePrefs.table_wrap_cells
                                  ? "break-words"
                                  : "truncate"
                              } max-w-[250px]`}
                            >
                              {cellContent}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between text-xs pt-2">
        <span>Total: {total}</span>

        <div className="flex gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            Prev
          </button>

          <span>
            {page} / {pageCount}
          </span>

          <button
            disabled={page >= pageCount}
            onClick={() => setPage(p => Math.min(pageCount, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(DataTable) as typeof DataTable;