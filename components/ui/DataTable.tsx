import React, { useMemo } from "react";
import { Tooltip } from "@/components/feedback/Tooltip";

/* ================= Types ================= */
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

  getRowId?: (row: T, index: number) => string;
  onRowClick?: (row: T) => string | void; // return URL to open in new tab
  getRowClassName?: (row: T) => string;

  emptyMessage?: string;

  groupByDate?: boolean;
  getRowDate?: (row: T) => string | Date;
  tableWidth?: number;
}

/* ================= Helpers ================= */
function getAlignClass(align?: "left" | "center" | "right") {
  switch (align) {
    case "left":
      return "text-left";
    case "right":
      return "text-right";
    default:
      return "text-center";
  }
}

function normalizeDate(date: string | Date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function formatDDMMYYYY(dateString: string) {
  const d = new Date(dateString);
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}/${d.getFullYear()}`;
}

/* ================= Component ================= */
function DataTable<T>({
  data,
  columns,
  loading = false,
  getRowId,
  onRowClick,
  getRowClassName,
  emptyMessage = "No records found.",
  groupByDate = false,
  getRowDate,
  tableWidth,
}: DataTableProps<T>) {
  /* ================= Grouping ================= */
  const groupedData = useMemo(() => {
    if (!groupByDate || !getRowDate) return { All: data };

    const today = normalizeDate(new Date());
    const yesterday = normalizeDate(new Date(Date.now() - 86400000));

    const groups: Record<string, T[]> = { Today: [], Yesterday: [] };
    const older: Record<string, T[]> = {};

    data.forEach((row) => {
      const rowTime = normalizeDate(getRowDate(row));
      if (rowTime === today) groups.Today.push(row);
      else if (rowTime === yesterday) groups.Yesterday.push(row);
      else {
        const d = new Date(rowTime);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(d.getDate()).padStart(2, "0")}`;
        if (!older[key]) older[key] = [];
        older[key].push(row);
      }
    });

    const sortedOlderKeys = Object.keys(older).sort((a, b) => (a > b ? -1 : 1));
    const sortedOlder: Record<string, T[]> = {};
    sortedOlderKeys.forEach((k) => (sortedOlder[k] = older[k]));

    return { ...groups, ...sortedOlder };
  }, [data, groupByDate, getRowDate]);

  /* ================= Column Width ================= */
  const computeMaxWidth = (col: DataTableColumn<T>) => {
    if (col.width) return col.width;
    if (!tableWidth) return "150px";
    return `${Math.floor(tableWidth / columns.length)}px`;
  };

  /* ================= Render ================= */
  return (
    <div className="flex-1 overflow-x-auto">
      <table className="w-full text-sm table-fixed border-separate border-spacing-y-2">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={col.key}
                className={`px-4 py-4 font-medium bg-gray-50 ${getAlignClass(
                  col.align
                )} ${i === 0 ? "rounded-tl-xl" : ""} ${
                  i === columns.length - 1 ? "rounded-tr-xl" : ""
                }`}
                style={{ width: computeMaxWidth(col) }}
              >
                <Tooltip content={typeof col.header === "string" ? col.header : ""}>
                  <div className="truncate max-w-full">{col.header}</div>
                </Tooltip>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {!loading &&
            Object.entries(groupedData).map(([group, rows]) => (
              <React.Fragment key={group}>
                {groupByDate && rows.length > 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase text-center"
                    >
                      {group === "Today" || group === "Yesterday"
                        ? group
                        : formatDDMMYYYY(group)}
                    </td>
                  </tr>
                )}

                {rows.map((row, index) => {
                  const key = getRowId ? getRowId(row, index) : JSON.stringify(row) + index;
                  const rowClass = getRowClassName?.(row) ?? "";
                  return (
                    <tr
                      key={key}
                      className={`bg-white rounded-xl shadow-sm transition hover:bg-emerald-50 hover:-translate-y-0.5 cursor-pointer ${rowClass}`}
                      onClick={() => {
                        if (onRowClick) {
                          const url = onRowClick(row);
                          if (typeof url === "string") window.open(url, "_blank");
                        }
                      }}
                    >
                      {columns.map((col) => {
                        const cellContent = col.render(row);
                        const tooltipText =
                          typeof cellContent === "string" || typeof cellContent === "number"
                            ? String(cellContent)
                            : "";

                        return (
                          <td
                            key={col.key}
                            className={`px-4 py-4 ${getAlignClass(col.align)}`}
                            style={{ maxWidth: computeMaxWidth(col) }}
                          >
                            <Tooltip content={tooltipText}>
                              <div className="truncate max-w-full">{cellContent}</div>
                            </Tooltip>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
        </tbody>
      </table>

      {!loading &&
        Object.values(groupedData).every((rows) => rows.length === 0) && (
          <div className="p-4 text-center text-gray-500">{emptyMessage}</div>
        )}
    </div>
  );
}

export default React.memo(DataTable) as typeof DataTable;