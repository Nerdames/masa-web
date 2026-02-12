"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import Summary, { SummaryCard } from "@/components/ui/Summary";

/* ================= Types ================= */

type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOIDED";

interface Invoice {
  id: string;
  total: number;
  paidAmount: number;
  balance: number;
  status: InvoiceStatus;
  currency: string;
  issuedAt: string;
  buyerName?: string; // updated from customerName
}

/* ================= Fetcher ================= */

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((res) => res.json());

/* ================= Skeleton ================= */

const SkeletonRow = () => (
  <tr className="animate-pulse bg-white shadow-sm rounded-lg">
    {Array.from({ length: 6 }).map((_, i) => (
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
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PAID" | "UNPAID">("ALL");
  const [targetDate, setTargetDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMarkPaidOpen, setBulkMarkPaidOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  /* ---------- Query ---------- */
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "10");

    if (debouncedSearch) params.set("search", debouncedSearch);
    if (targetDate) params.set("date", targetDate);
    if (statusFilter === "PAID") params.set("status", "PAID");
    if (statusFilter === "UNPAID") params.set("status", "UNPAID");

    return params.toString();
  }, [page, debouncedSearch, targetDate, statusFilter]);

  /* ---------- Fetch ---------- */
  const { data, isLoading, mutate, error } = useSWR<{ data: Invoice[]; total: number }>(
    `/api/dashboard/invoices?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  useEffect(() => {
    if (error) toast.addToast({ type: "error", message: "Failed to fetch invoices" });
  }, [error, toast]);

  const invoices = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  /* ---------- Summary ---------- */
  const paidCount = invoices.filter((i) => i.status === "PAID").length;
  const unpaidCount = invoices.filter((i) => i.status !== "PAID").length;

  const summaryCards: SummaryCard[] = [
    { id: "total", title: "Total Invoices", value: total, filter: "ALL" },
    { id: "paid", title: "Paid", value: paidCount, filter: "PAID", color: "text-green-600" },
    {
      id: "unpaid",
      title: "Unpaid",
      value: unpaidCount,
      filter: "UNPAID",
      color: unpaidCount === 0 ? "text-green-600" : "text-red-600",
    },
  ];

  /* ---------- Selection ---------- */
  const selectableIds = useMemo(
    () => invoices.filter((i) => i.status !== "PAID" && i.status !== "VOIDED").map((i) => i.id),
    [invoices]
  );

  const isAllSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(isAllSelected ? new Set() : new Set(selectableIds));
  }, [isAllSelected, selectableIds]);

  /* ---------- Bulk Mark Paid ---------- */
  const bulkMarkPaid = useCallback(async () => {
    try {
      if (selectedIds.size === 0) return;
      const res = await fetch("/api/dashboard/invoices/mark-paid", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });

      if (!res.ok) throw new Error("Failed to mark invoices as paid");

      toast.addToast({ type: "success", message: "Invoices marked as paid" });
      setSelectedIds(new Set());
      setBulkMarkPaidOpen(false);
      mutate();
    } catch {
      toast.addToast({ type: "error", message: "Failed to mark invoices as paid" });
    }
  }, [selectedIds, toast, mutate]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await mutate();
    setTimeout(() => setRefreshing(false), 300);
  }, [mutate]);

  /* ---------- Group by Day ---------- */
  const groupedInvoices = useMemo(() => {
    const todayStr = new Date().toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yestStr = yesterday.toDateString();

    const groups: Record<string, Invoice[]> = { Today: [], Yesterday: [] };
    const older: Record<string, Invoice[]> = {};

    invoices.forEach((inv) => {
      const dateStr = new Date(inv.issuedAt).toDateString();
      if (dateStr === todayStr) groups.Today.push(inv);
      else if (dateStr === yestStr) groups.Yesterday.push(inv);
      else {
        const key = new Date(inv.issuedAt).toISOString().split("T")[0];
        if (!older[key]) older[key] = [];
        older[key].push(inv);
      }
    });

    return {
      ...groups,
      ...Object.keys(older)
        .sort((a, b) => (a > b ? -1 : 1))
        .reduce((acc, k) => {
          acc[k] = older[k];
          return acc;
        }, {} as Record<string, Invoice[]>),
    };
  }, [invoices]);

  /* ================= Render ================= */
  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">
      <Summary cardsData={summaryCards} />

      {/* Top Bar */}
      <div className="sticky top-0 z-20 bg-white p-3 flex flex-wrap items-center gap-2 shadow-sm">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoice or buyer"
          className="border rounded-lg p-2 text-sm min-w-[250px]"
        />

        <div className="flex items-center gap-2 border rounded-lg px-3 py-2 h-10">
          <i className="bx bx-calendar text-gray-500" />
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="text-sm outline-none"
          />
        </div>

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
            <DropdownMenu.Trigger className="bg-gray-100 px-3 rounded-full h-10 text-sm">
              Status: {statusFilter}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="bg-white shadow rounded-md py-1">
              {(["ALL", "PAID", "UNPAID"] as const).map((s) => (
                <DropdownMenu.Item
                  key={s}
                  onSelect={() => setStatusFilter(s)}
                  className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                >
                  {s}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-sm table-fixed border-separate border-spacing-y-3">
          <thead className="text-xs bg-gray-100 uppercase text-gray-500 text-center">
            <tr>
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => {
                    if (el) el!.indeterminate = isIndeterminate;
                  }}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="p-4">Invoice</th>
              <th className="p-4">Buyer</th> {/* Updated header */}
              <th className="p-4">Total</th>
              <th className="p-4">Balance</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>

          <tbody>
            {isLoading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading &&
              Object.entries(groupedInvoices).map(([group, items]) => {
                if (!items.length) return null;

                return (
                  <React.Fragment key={group}>
                    <tr className="bg-gray-100 font-semibold">
                      <td colSpan={6} className="p-2 text-left">
                        {group === "Today" || group === "Yesterday"
                          ? group
                          : new Date(group).toLocaleDateString()}
                      </td>
                    </tr>

                    {items.map((inv) => {
                      const disabled = inv.status === "VOIDED";
                      const selected = selectedIds.has(inv.id);

                      return (
                        <tr
                          key={inv.id}
                          className={`
                            bg-white rounded-xl shadow-sm transition
                            ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-green-50 hover:text-green-700"}
                            ${selected ? "bg-green-100 text-green-700" : ""}
                          `}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).tagName !== "INPUT" && !disabled) {
                              router.push(`/dashboard/invoices/${inv.id}`);
                            }
                          }}
                        >
                          <td className="p-4 text-center">
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={disabled}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleSelect(inv.id)}
                            />
                          </td>
                          <td className="p-4 text-center font-mono">#{inv.id.slice(-6)}</td>
                          <td className="p-4 text-center">{inv.buyerName ?? "Walk-in"}</td> {/* Updated */}
                          <td className="p-4 text-center">₦{inv.total.toLocaleString()}</td>
                          <td className="p-4 text-center">₦{Math.max(inv.balance, 0).toLocaleString()}</td>
                          <td className={`p-4 text-center font-semibold ${inv.status === "PAID" ? "text-green-700" : "text-red-700"}`}>
                            {inv.status}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center text-xs">
        <span>Total Invoices: {total}</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>{page} / {pageCount}</span>
          <button disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>

      {bulkMarkPaidOpen && (
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
