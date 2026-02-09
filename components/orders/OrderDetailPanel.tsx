"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Order } from "@/types/order"; // Use your MASA order type
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";

interface OrderDetailPanelProps {
  orderId: string;
  onUnsavedChange?: (unsaved: boolean) => void;
}

export default function OrderDetailPanel({ orderId, onUnsavedChange }: OrderDetailPanelProps) {
  const toast = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsaved, setUnsaved] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  // ----- Fetch Order -----
  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/orders/${orderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch order");
      const data: Order = await res.json();
      setOrder(data);
    } catch {
      toast.addToast({ type: "error", message: "Unable to fetch order details" });
    } finally {
      setLoading(false);
    }
  }, [orderId, toast]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // ----- Track unsaved changes -----
  const handleChange = (field: keyof Order, value: any) => {
    if (!order) return;
    setOrder(prev => prev ? { ...prev, [field]: value } : prev);
    if (!unsaved) {
      setUnsaved(true);
      onUnsavedChange?.(true);
    }
  };

  const handleSave = async () => {
    if (!order) return;
    try {
      const res = await fetch(`/api/dashboard/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.addToast({ type: "success", message: "Order saved" });
      setUnsaved(false);
      onUnsavedChange?.(false);
    } catch {
      toast.addToast({ type: "error", message: "Failed to save order" });
    }
  };

  // ----- Confirm close tab -----
  const handleCloseTab = () => {
    if (unsaved) setShowConfirmClose(true);
    else onUnsavedChange?.(false);
  };

  const confirmClose = () => {
    setShowConfirmClose(false);
    onUnsavedChange?.(false); // inform workspace to close tab
  };

  return (
    <div className="flex flex-col space-y-4 p-4 min-h-[calc(100vh-4rem)] bg-white rounded-md shadow">
      {loading && <div className="text-gray-500">Loading order...</div>}

      {!loading && order && (
        <>
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Order #{order.id}</h2>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                disabled={!unsaved}
              >
                Save
              </button>
              <button
                onClick={handleCloseTab}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="text-sm text-gray-500">Customer</label>
              <input
                type="text"
                value={order.customer?.name ?? ""}
                onChange={e => handleChange("customer", { ...order.customer, name: e.target.value })}
                className="border rounded p-2 w-full text-sm"
              />
            </div>

            <div>
              <label className="text-sm text-gray-500">Salesperson</label>
              <input
                type="text"
                value={order.salesperson?.name ?? ""}
                onChange={e => handleChange("salesperson", { ...order.salesperson, name: e.target.value })}
                className="border rounded p-2 w-full text-sm"
              />
            </div>

            <div>
              <label className="text-sm text-gray-500">Total</label>
              <input
                type="number"
                value={order.total}
                onChange={e => handleChange("total", parseFloat(e.target.value))}
                className="border rounded p-2 w-full text-sm"
              />
            </div>

            <div>
              <label className="text-sm text-gray-500">Currency</label>
              <input
                type="text"
                value={order.currency}
                onChange={e => handleChange("currency", e.target.value)}
                className="border rounded p-2 w-full text-sm"
              />
            </div>
          </div>
        </>
      )}

      {showConfirmClose && (
        <ConfirmModal
          open
          title="Unsaved Changes"
          message="You have unsaved changes. Close tab anyway?"
          destructive
          onClose={() => setShowConfirmClose(false)}
          onConfirm={confirmClose}
        />
      )}
    </div>
  );
}
