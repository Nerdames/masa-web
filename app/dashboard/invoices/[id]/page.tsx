"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";

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
  price: number;
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
  paid: boolean;
  currency: string;
  createdAt: string;
  discount?: number | null;
  tax?: number | null;
  order: Order;
}

interface InvoiceResponse {
  invoice: Invoice;
}

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(res => res.json());

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<InvoiceResponse>(
    id ? `/api/dashboard/invoices/${id}` : null,
    fetcher
  );

  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  if (isLoading) return <div className="p-6 animate-pulse">Loading invoice…</div>;
  if (!data) return <div className="p-6">Invoice not found</div>;

  const { invoice } = data;

  const formatCurrency = (value: number) =>
    `₦${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const markPaid = async () => {
    if (!invoice) return;
    setIsMarkingPaid(true);

    // Optimistic UI update
    mutate(
      prev => ({
        invoice: { ...prev!.invoice, paid: true },
      }),
      false
    );

    try {
      const res = await fetch("/api/dashboard/invoices/mark-paid", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [invoice.id] }),
      });

      if (!res.ok) throw new Error("Failed to mark as paid");

      toast.addToast({ type: "success", message: "Invoice marked as paid" });
      setMarkPaidOpen(false);
      mutate(); // revalidate
    } catch {
      mutate(); // rollback optimistic update
      toast.addToast({ type: "error", message: "Failed to mark invoice as paid" });
    } finally {
      setIsMarkingPaid(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-semibold">Invoice #{invoice.id.slice(-6)}</h1>
        <div className="flex gap-2">
          {!invoice.paid && (
            <button
              onClick={() => setMarkPaidOpen(true)}
              className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              disabled={isMarkingPaid}
            >
              <i className={`bx bx-check text-lg ${isMarkingPaid ? "animate-spin" : ""}`}></i>
              {isMarkingPaid ? "Marking..." : "Mark Paid"}
            </button>
          )}
          <a
            href={`/api/dashboard/invoices/${invoice.id}/pdf`}
            download={`invoice-${invoice.id}.pdf`}
            className="flex items-center gap-1 px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition"
          >
            <i className="bx bx-download text-lg"></i>
            PDF
          </a>
        </div>
      </div>

      {/* Customer info */}
      <div className="bg-white shadow rounded-lg p-4">
        <h2 className="font-medium text-gray-700 mb-1">Customer</h2>
        <p className="text-gray-900">{invoice.order.customer?.name ?? "Walk-in"}</p>
        {invoice.order.customer?.email && (
          <p className="text-sm text-gray-500">{invoice.order.customer.email}</p>
        )}
        {invoice.order.customer?.phone && (
          <p className="text-sm text-gray-500">{invoice.order.customer.phone}</p>
        )}
      </div>

      {/* Items Table */}
      <div className="bg-white shadow rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Item</th>
              <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">Qty</th>
              <th className="px-4 py-2 text-right text-sm font-medium text-gray-700">Price</th>
              <th className="px-4 py-2 text-right text-sm font-medium text-gray-700">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {invoice.order.items.map(item => (
              <tr key={item.id}>
                <td className="px-4 py-2">{item.product.name}</td>
                <td className="px-4 py-2 text-center">{item.quantity}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(item.price)}</td>
                <td className="px-4 py-2 text-right font-semibold">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="bg-white shadow rounded-lg p-4 flex flex-col items-end space-y-1">
        {invoice.discount && <p>Discount: {formatCurrency(invoice.discount)}</p>}
        {invoice.tax && <p>Tax: {formatCurrency(invoice.tax)}</p>}
        <p className="font-semibold text-lg">Total: {formatCurrency(invoice.total)}</p>
        <p className={invoice.paid ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
          {invoice.paid ? "Paid" : "Unpaid"}
        </p>
      </div>

      {/* Back */}
      <button
        onClick={() => router.back()}
        className="text-sm underline text-gray-600 hover:text-gray-900"
      >
        ← Back
      </button>

      {/* Confirm mark paid */}
      {markPaidOpen && (
        <ConfirmModal
          open
          title="Mark invoice as paid"
          message={`Are you sure you want to mark this invoice as paid?`}
          onClose={() => setMarkPaidOpen(false)}
          onConfirm={markPaid}
        />
      )}
    </div>
  );
}
