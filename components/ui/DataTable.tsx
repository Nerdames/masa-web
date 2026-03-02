"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Tooltip } from "@/components/feedback/Tooltip";
import { useToast } from "@/components/feedback/ToastProvider";

/* ================= Types ================= */

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
  render: (row: T) => React.ReactNode;
  hideTooltip?: boolean; // Added this property
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

function getAlignClass(align?: "left" | "center" | "right"): string {
  if (align === "left") return "text-left";
  if (align === "right") return "text-right";
  return "text-center";
}

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
  const pathname = usePathname();
  const { addToast } = useToast();
  const { data: session } = useSession();

  const [columnOrder, setColumnOrder] = useState<string[]>(columns.map((c) => c.key));
  const dragCol = useRef<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preferenceKey = `columnOrder:${pathname}`;

  /* ================= Load Preferences ================= */

  useEffect(() => {
    if (!session?.user) return;
    const controller = new AbortController();

    const loadPreference = async () => {
      try {
        const params = new URLSearchParams({
          category: "TABLE",
          key: preferenceKey,
          target: tableId,
        });

        const res = await fetch(`/api/preferences?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to fetch preferences");

        const json: unknown = await res.json();
        if (typeof json === "object" && json !== null && "preference" in json) {
          const pref = (json as { preference: unknown }).preference;
          if (Array.isArray(pref) && pref.every((item) => typeof item === "string")) {
            setColumnOrder(pref);
            return;
          }
        }
        setColumnOrder(columns.map((c) => c.key));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        addToast({
          type: "error",
          title: "Preference Load Failed",
          message: "Could not load your saved table preferences.",
        });
      }
    };

    loadPreference();
    return () => controller.abort();
  }, [session, tableId, pathname, preferenceKey, columns, addToast]);

  /* ================= Save Preferences ================= */

  const savePreferences = useCallback(
    (newOrder: string[]) => {
      if (!session?.user) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const payload: Record<string, unknown> = {
            scope: "USER",
            category: "TABLE",
            key: preferenceKey,
            target: tableId,
            value: newOrder,
            organizationId: session.user.organizationId,
            branchId: session.user.branchId,
            personnelId: session.user.id,
          };
          const res = await fetch("/api/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error("Save failed");

          addToast({ type: "success", title: "Preferences Saved", message: "Your table layout has been updated." });
        } catch {
          addToast({ type: "error", title: "Save Failed", message: "Could not save table preferences." });
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

  const orderedColumns = useMemo<DataTableColumn<T>[]>(() => {
    const validKeys = columns.map((c) => c.key);
    const safeOrder = [
      ...columnOrder.filter((k) => validKeys.includes(k)),
      ...validKeys.filter((k) => !columnOrder.includes(k)),
    ];
    return safeOrder
      .map((key) => columns.find((c) => c.key === key))
      .filter((col): col is DataTableColumn<T> => typeof col !== "undefined");
  }, [columnOrder, columns]);

  const handleDragStart = (key: string) => {
    dragCol.current = key;
  };
  const handleDrop = (targetKey: string) => {
    const sourceKey = dragCol.current;
    if (!sourceKey || sourceKey === targetKey) return;

    setColumnOrder((prev) => {
      const newOrder = [...prev];
      const from = newOrder.indexOf(sourceKey);
      const to = newOrder.indexOf(targetKey);
      if (from === -1 || to === -1) return prev;
      newOrder.splice(from, 1);
      newOrder.splice(to, 0, sourceKey);
      savePreferences(newOrder);
      return newOrder;
    });
    dragCol.current = null;
  };

  /* ================= Render ================= */

  return (
    <div className="w-full rounded-2xl bg-white/80 dark:bg-neutral-900/60 backdrop-blur-xl border border-white/30 dark:border-white/20 shadow-lg overflow-x-auto">
      <table className="w-full table-auto text-sm">
        <thead className="sticky top-0 z-10 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border-b border-neutral-300 dark:border-neutral-700">
          <tr>
            {orderedColumns.map((col) => (
              <th
                key={col.key}
                draggable
                onDragStart={() => handleDragStart(col.key)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(col.key)}
                style={{ width: col.width, minWidth: "80px" }}
                className={`px-5 py-4 text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-400 cursor-move select-none ${getAlignClass(
                  col.align
                )}`}
              >
                <Tooltip content={typeof col.header === "string" ? col.header : ""}>
                  <div className="truncate max-w-[250px]">{col.header}</div>
                </Tooltip>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {!loading &&
            data.map((row, index) => {
              const key = getRowId?.(row, index) ?? `${JSON.stringify(row)}-${index}`;

              let showDateLabel = false;
              let formattedDate = "";
              if (dateField && row[dateField]) {
                const rowDate = new Date(row[dateField] as unknown as string);
                formattedDate = rowDate.toLocaleDateString("en-GB");
                if (index === 0) showDateLabel = true;
                else {
                  const prevRowDate = new Date(data[index - 1][dateField] as unknown as string).toLocaleDateString("en-GB");
                  if (formattedDate !== prevRowDate) showDateLabel = true;
                }
              }

              return (
                <React.Fragment key={key}>
                  {showDateLabel && (
                    <tr>
                      <td colSpan={columns.length} className="px-5 py-1 text-center text-neutral-400 dark:text-neutral-500 text-xs italic select-none">
                        {formattedDate}
                      </td>
                    </tr>
                  )}

                  <tr
                    onClick={() => {
                      if (onRowClick) {
                        const url = onRowClick(row);
                        if (typeof url === "string") window.open(url, "_blank");
                      }
                    }}
                    className={`border-b border-neutral-200 dark:border-neutral-700 transition-colors duration-200
                      ${index % 2 === 0 ? "bg-white dark:bg-neutral-900" : "bg-neutral-50 dark:bg-neutral-800"}
                      hover:bg-blue-50 dark:hover:bg-blue-900 cursor-pointer ${getRowClassName?.(row) ?? ""}`}
                  >
                    {orderedColumns.map((col) => {
                      const cellContent = col.render(row);
                      const tooltipText =
                        typeof cellContent === "string" || typeof cellContent === "number" ? String(cellContent) : "";

                      return (
                        <td
                          key={col.key}
                          style={{ width: col.width, minWidth: "80px" }}
                          className={`px-5 py-4 text-neutral-700 dark:text-neutral-200 ${getAlignClass(col.align)}`}
                        >
                          {/* Conditional rendering based on hideTooltip */}
                          {col.hideTooltip ? (
                            <div className="truncate max-w-[250px]">{cellContent}</div>
                          ) : (
                            <Tooltip content={tooltipText}>
                              <div className="truncate max-w-[250px]">{cellContent}</div>
                            </Tooltip>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

export default React.memo(DataTable) as typeof DataTable;