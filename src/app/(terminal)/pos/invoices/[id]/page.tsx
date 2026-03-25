"use client";

import { useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { useToast } from "@/core/components/feedback/ToastProvider";
import ConfirmModal from "@/core/components/modal/ConfirmModal";

interface Customer {
  name: string;
  email?: string;
  phone?: string;
}

interface Product {
  name: string;
}

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  total: number;
  product: Product;
}

interface Order {
  id: string;
  status: string;
  dueDate?: string;
  balance: number;
  customer?: Customer | null;
  items: OrderItem[];
}

interface Invoice {
  id: string;
  total: number;
  paidAmount: number;
  balance: number;
  status: "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOIDED";
  currency: string;
  issuedAt: string;
  discount?: number | null;
  tax?: number | null;
  order: Order;
}

interface InvoiceResponse {
  invoice: Invoice;
}

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((res) => res.json());

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  /* ---------------- SWR ---------------- */
  const { data, isLoading, mutate } = useSWR<InvoiceResponse>(
    id ? `/api/dashboard/invoices/${id}` : null,
    fetcher
  );

  /* ---------------- State ---------------- */
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [partialPaymentOpen, setPartialPaymentOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* ---------------- Derived ---------------- */
  const invoice = data?.invoice;

  const formatCurrency = useCallback(
    (value: number) =>
      `${invoice?.currency ?? "₦"} ${value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
    [invoice?.currency]
  );

  /* ---------------- Mark Paid ---------------- */
  const markPaid = useCallback(async () => {
    if (!invoice || invoice.status === "PAID") return;
    setIsSubmitting(true);

    mutate(
      (prev) =>
        prev
          ? { invoice: { ...prev.invoice, status: "PAID", balance: 0, paidAmount: prev.invoice.total } }
          : prev,
      false
    );

    try {
      const res = await fetch("/api/dashboard/invoices/mark-paid", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [invoice.id] }),
      });
      if (!res.ok) throw new Error();

      toast.addToast({ type: "success", message: "Invoice marked as paid" });
      setMarkPaidOpen(false);
      mutate(); // revalidate
    } catch {
      mutate(); // rollback
      toast.addToast({ type: "error", message: "Failed to mark invoice as paid" });
    } finally {
      setIsSubmitting(false);
    }
  }, [invoice, mutate, toast]);

  /* ---------------- Partial Payment ---------------- */
  const submitPartialPayment = useCallback(async () => {
    if (!invoice || partialAmount <= 0 || partialAmount > invoice.balance) return;
    setIsSubmitting(true);

    // Optimistic update
    const newBalance = invoice.balance - partialAmount;
    mutate(
      (prev) =>
        prev
          ? {
              invoice: {
                ...prev.invoice,
                balance: newBalance,
                paidAmount: prev.invoice.paidAmount + partialAmount,
                status: newBalance === 0 ? "PAID" : "PARTIALLY_PAID",
              },
            }
          : prev,
      false
    );

    try {
      const res = await fetch("/api/dashboard/invoices/partial-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, amount: partialAmount }),
      });
      if (!res.ok) throw new Error();

      toast.addToast({ type: "success", message: "Partial payment applied" });
      setPartialPaymentOpen(false);
      setPartialAmount(0);
      mutate();
    } catch {
      mutate(); // rollback
      toast.addToast({ type: "error", message: "Failed to apply partial payment" });
    } finally {
      setIsSubmitting(false);
    }
  }, [invoice, partialAmount, mutate, toast]);

  /* ---------------- Render ---------------- */
  if (isLoading) return <div className="p-6 animate-pulse">Loading invoice…</div>;
  if (!invoice) return <div className="p-6">Invoice not found</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-semibold">Invoice #{invoice.id.slice(-6)}</h1>
        <div className="flex gap-2">
          {invoice.status !== "PAID" && (
            <>
              <button
                onClick={() => setMarkPaidOpen(true)}
                disabled={isSubmitting}
                className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                Mark Paid
              </button>
              <button
                onClick={() => setPartialPaymentOpen(true)}
                disabled={isSubmitting}
                className="flex items-center gap-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition disabled:opacity-50"
              >
                Partial Payment
              </button>
            </>
          )}
          <a
            href={`/api/dashboard/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition"
          >
            PDF
          </a>
        </div>
      </div>

      {/* Confirm Mark Paid */}
      {markPaidOpen && (
        <ConfirmModal
          open
          title="Mark invoice as paid"
          message="Are you sure you want to mark this invoice as paid?"
          onClose={() => setMarkPaidOpen(false)}
          onConfirm={markPaid}
        />
      )}

      {/* Confirm Partial Payment */}
      {partialPaymentOpen && (
        <ConfirmModal
          open
          title="Partial Payment"
          message={`Apply ₦${partialAmount.toLocaleString()} to this invoice?`}
          onClose={() => setPartialPaymentOpen(false)}
          onConfirm={submitPartialPayment}
          input={{
            type: "number",
            value: partialAmount,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
              setPartialAmount(Number(e.target.value)),
            placeholder: "Amount",
          }}
        />
      )}
    </div>
  );
}