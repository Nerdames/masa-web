"use client";

import { useState, useMemo, useCallback } from "react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import Summary, { SummaryCard } from "@/components/ui/Summary";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";

/* ================= Types ================= */

type OrderStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "CANCELLED"
  | "RETURNED";

interface Invoice {
  id: string;
  total: number;
  paid: boolean;
  currency: string;
  createdAt: string;
  order: {
    id: string;
    status: OrderStatus;
    dueDate?: string;
    balance: number;
    customer?: {
      name: string;
      email?: string;
      phone?: string;
    };
  };
}

interface InvoicesResponse {
  invoices: Invoice[];
  total: number;
  totalRevenue: number;
  unpaidTotal: number;
}

/* ================= Fetcher ================= */

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(res => res.json());

/* ================= Skeleton ================= */

const SkeletonRow = () => (
  <tr className="animate-pulse bg-white shadow-sm rounded-lg">
    {Array.from({ length: 7 }).map((_, i) => (
      <td key={i} className="p-3">
        <div className="h-4 bg-gray-200 rounded w-full" />
      </td>
    ))}
  </tr>
);

/* ================= Page ================= */

export default function InvoicePage() {
  const toast = useToast();
  const router = useRouter();

  /* ---------- State ---------- */
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [paidFilter, setPaidFilter] = useState<"ALL" | "PAID" | "UNPAID">(
    "ALL"
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMarkPaidOpen, setBulkMarkPaidOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  /* ---------- Query String ---------- */
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");

    if (debouncedSearch) params.set("search", debouncedSearch);
    if (paidFilter !== "ALL") {
      params.set("paid", paidFilter === "PAID" ? "true" : "false");
    }

    return params.toString();
  }, [page, debouncedSearch, paidFilter]);

  /* ---------- Fetch Data ---------- */
  const { data, isLoading, mutate } = useSWR<InvoicesResponse>(
    `/api/dashboard/invoices?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  /* ---------- Derived Data ---------- */
  const invoices = useMemo(() => data?.invoices ?? [], [data?.invoices]);
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  // Selection helpers
  const selectableIds = useMemo(
    () =>
      invoices
        .filter(i => !i.paid && i.order.status !== "CANCELLED")
        .map(i => i.id),
    [invoices]
  );

  const isAllSelected =
    selectableIds.length > 0 &&
    selectableIds.every(id => selectedIds.has(id));

  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  /* ---------- Callbacks ---------- */
  const toggleSelect = useCallback(
    (id: string) => {
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    },
    [setSelectedIds]
  );

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev =>
      isAllSelected ? new Set() : new Set(selectableIds)
    );
  }, [isAllSelected, selectableIds]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await mutate();
    setRefreshing(false);
  }, [mutate]);

  const bulkMarkPaid = useCallback(async () => {
    try {
      await fetch("/api/dashboard/invoices/mark-paid", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });

      toast.addToast({
        type: "success",
        message: "Invoices marked as paid",
      });

      setSelectedIds(new Set());
      setBulkMarkPaidOpen(false);
      mutate();
    } catch {
      toast.addToast({
        type: "error",
        message: "Failed to update invoices",
      });
    }
  }, [selectedIds, toast, mutate]);

  /* ---------- Memoized Counts for Summary ---------- */
  const paidCount = useMemo(() => invoices.filter(i => i.paid).length, [
    invoices,
  ]);
  const unpaidCount = useMemo(() => invoices.length - paidCount, [
    invoices,
    paidCount,
  ]);

  const summaryCards: SummaryCard[] = useMemo(
    () => [
      { id: "total", title: "Total Invoices", value: total, filter: "ALL" },
      {
        id: "paid",
        title: "Paid",
        value: paidCount,
        filter: "PAID",
        color: "text-green-600",
      },
      {
        id: "unpaid",
        title: "Unpaid",
        value: unpaidCount,
        filter: "UNPAID",
        color: "text-red-600",
      },
      {
        id: "revenue",
        title: "Revenue",
        value: data?.totalRevenue ?? 0,
        filter: "ALL",
        isCurrency: true,
      },
    ],
    [total, paidCount, unpaidCount, data?.totalRevenue]
  );

  /* ================= Render ================= */

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">
      <Summary cardsData={summaryCards} />

      {/* Top Bar */}
      <div className="sticky top-0 z-20 bg-white p-3 flex flex-wrap items-center gap-2 shadow-sm">
        <input
          type="text"
          placeholder="Search invoice or customer"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded-lg p-2 text-sm min-w-[250px]"
        />

        <button
          onClick={handleRefresh}
          className={`w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center ${
            refreshing ? "animate-spin" : ""
          }`}
        >
          <i className="bx bx-refresh text-lg" />
        </button>

        {selectedIds.size > 0 && (
          <button
            onClick={() => setBulkMarkPaidOpen(true)}
            className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"
          >
            <i className="bx bx-check text-green-700 text-lg" />
          </button>
        )}

        <div className="ml-auto">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="bg-gray-100 px-3 rounded-full h-10 flex items-center text-sm">
              Status: {paidFilter}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="bg-white shadow rounded-md py-1 min-w-[120px]">
              {(["ALL", "PAID", "UNPAID"] as const).map(p => (
                <DropdownMenu.Item
                  key={p}
                  onSelect={() => setPaidFilter(p)}
                  className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                >
                  {p}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-y-3 min-w-[900px]">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-10">
            <tr>
              <th className="w-10 p-2">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={el => {
                    if (el) el.indeterminate = isIndeterminate;
                  }}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="sticky left-0 bg-gray-50 p-2 z-30">Invoice</th>
              <th className="p-2">Customer</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2">Paid</th>
              <th className="p-2">Status</th>
              <th className="p-2">Created</th>
            </tr>
          </thead>

          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))
              : invoices.map(inv => {
                  const disabled = inv.paid || inv.order.status === "CANCELLED";

                  return (
                    <tr
                      key={inv.id}
                      className={`bg-white shadow-sm rounded-lg hover:bg-gray-50 ${
                        disabled
                          ? "opacity-60 cursor-not-allowed"
                          : "cursor-pointer"
                      }`}
                      onClick={() =>
                        !disabled &&
                        router.push(`/dashboard/invoices/${inv.id}`)
                      }
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={selectedIds.has(inv.id)}
                          onClick={e => e.stopPropagation()}
                          onChange={() => toggleSelect(inv.id)}
                        />
                      </td>
                      <td className="p-3 sticky left-0 bg-white font-mono text-xs z-20">
                        #{inv.id.slice(-6)}
                      </td>
                      <td className="p-3">
                        {inv.order.customer?.name ?? "Walk-in"}
                      </td>
                      <td className="p-3 text-right">
                        ₦{inv.total.toLocaleString()}
                      </td>
                      <td
                        className={`p-3 font-semibold ${
                          inv.paid ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {inv.paid ? "Paid" : "Unpaid"}
                      </td>
                      <td className="p-3">{inv.order.status}</td>
                      <td className="p-3">
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center text-xs">
        <span>Total: {total}</span>
        <div className="flex gap-2 items-center">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            Prev
          </button>
          <span>
            {page} / {pageCount}
          </span>
          <button
            disabled={page >= pageCount}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {bulkMarkPaidOpen && selectedIds.size > 0 && (
        <ConfirmModal
          open
          title="Mark invoices as paid"
          message={`Mark ${selectedIds.size} invoice(s) as paid?`}
          onClose={() => setBulkMarkPaidOpen(false)}
          onConfirm={bulkMarkPaid}
        />
      )}
    </div>
  );
}
