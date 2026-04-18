"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X, Maximize2, Minimize2, Package, Calendar,
  User, Loader2, CheckCircle2, AlertOctagon, Archive, ShieldAlert
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/* -------------------------
Types
------------------------- */
                                                                                 
interface POItem {
  id: string;
  productId: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  product?: {
    name: string;
    sku: string;
  };
}

interface PO {
  id: string;
  poNumber: string;
  organizationId: string;
  branchId: string;
  status: string; // FULFILLED, CANCELLED, PARTIALLY_RECEIVED, DRAFT, SUBMITTED
  totalAmount: number | string;
  expectedDate?: string | null;
  createdAt: string;
  vendor?: {
    id: string;
    name: string;
    email: string;
  };
  createdBy?: {
    name: string;
  };
  items: POItem[];
}

interface ReceiveItemInput {
  poItemId: string;
  productId: string;
  quantityAccepted: number;
}

interface PODetailViewProps {
  po: PO;
  onClose: () => void;
}

/* -------------------------
Component
------------------------- */

export default function PODetailView({ po, onClose }: PODetailViewProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  const [isVoiding, setIsVoiding] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);

  // Status flags & Audit Logic
  const isCancelled = po.status === "CANCELLED";
  const isFulfilled = po.status === "FULFILLED";
  const isPartiallyReceived = po.status === "PARTIALLY_RECEIVED";
  
  // Audit-proof logic: Prevent voiding if items have already been received to protect GRN/StockMove      integrity
  const canVoid = !isCancelled && !isFulfilled && !isPartiallyReceived;

  // Initialize receiving state
  const [receiveItems, setReceiveItems] = useState<ReceiveItemInput[]>(
    po.items.map((it) => ({
      poItemId: it.id,
      productId: it.productId, 
      quantityAccepted: Math.max(0, it.quantityOrdered - (it.quantityReceived || 0)),
    }))
  );

  useEffect(() => {
    setReceiveItems(
      po.items.map((it) => ({
        poItemId: it.id,
        productId: it.productId,
        quantityAccepted: Math.max(0, it.quantityOrdered - (it.quantityReceived || 0)),
      }))
    );
  }, [po]);

  const totalCommitment = useMemo(() => Number(po.totalAmount || 0), [po]);

  async function handleVoid() {
    if (!canVoid) {
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "Action Denied", message: "Cannot void a PO that has been partially received." });
      return;
    }

    const confirm = window.confirm(`Void PO ${po.poNumber}? This will permanently cancel the order.`);
    if (!confirm) return;
    
    setIsVoiding(true);
    try {
      const res = await fetch(`/api/inventory/purchase-orders/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (!res.ok) throw new Error("Failed to void purchase order");

      dispatch?.({
        kind: "PUSH",
        type: "SUCCESS",
        title: "PO Voided",
        message: `Successfully cancelled ${po.poNumber}`
      });

      window.dispatchEvent(new CustomEvent("po:updated", {
        detail: { id: po.id, action: "VOID" }
      }));
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Void failed";
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "Void failed", message: msg });
    } finally {
      setIsVoiding(false);
    }
  }

  function updateReceiveQty(index: number, value: number) {
    setReceiveItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        quantityAccepted: Math.max(0, Math.floor(Number(value) || 0))
      };
      return copy;
    });
  }

  async function submitReceive() {
    const activeItems = receiveItems.filter((it) => it.quantityAccepted > 0);
    
    if (activeItems.length === 0) {
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "Receive failed", message: "Enter at least one quantity." });
      return;
    }

    setIsReceiving(true);
    try {
      const payload = {
        purchaseOrderId: po.id,
        branchId: po.branchId,
        vendorId: po.vendor?.id,
        items: activeItems.map((it) => {
          const original = po.items.find((p) => p.id === it.poItemId);
          if (!original?.productId) throw new Error(`Product ID missing for item ${it.poItemId}`);

          return {
            poItemId: it.poItemId,
            productId: String(original.productId),
            quantityAccepted: it.quantityAccepted,
            quantityRejected: 0,
            unitCost: original.unitCost ? Number(original.unitCost) : 0,
          };
        }),
      };

      const res = await fetch(`/api/inventory/grns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to create GRN");

      dispatch?.({ kind: "PUSH", type: "SUCCESS", title: "Received", message: `GRN created successfully.` });

      window.dispatchEvent(new CustomEvent("po:updated", {
        detail: { id: po.id, action: "RECEIVE", grnId: body?.id }
      }));

      setReceiveOpen(false);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "Receive failed", message: msg });
    } finally {
      setIsReceiving(false);
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-xl relative">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200/60 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{po.poNumber}</h2>
            {isPartiallyReceived && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                PARTIAL
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Created {new Date(po.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleFullScreen} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        <section>
          <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Package className="w-3 h-3" /> Vendor Details
          </h4>
          <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{po.vendor?.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{po.vendor?.email}</p>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-8">
          <div>
            <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Calendar className="w-3 h-3" /> Expected
            </h4>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : "Not Specified"}
            </p>
          </div>

          <div>
            <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <User className="w-3 h-3" /> Originator
            </h4>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {po.createdBy?.name || "System"}
            </p>
          </div>
        </div>

        <section>
          <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3">Itemized Commitment</h4>
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/50 dark:bg-slate-800/50">
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Product</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-center">Ordered</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-center">Received</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {po.items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{item.product?.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono uppercase">{item.product?.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-slate-700 dark:text-slate-300">
                      {item.quantityOrdered}
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-slate-700 dark:text-slate-300">
                      <span className={item.quantityReceived >= item.quantityOrdered ? "text-emerald-600 dark:text-emerald-400 font-bold" : ""}>
                        {item.quantityReceived || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                      ₦{(item.quantityOrdered * item.unitCost).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50/80 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700">
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase text-right">Total Commitment</td>
                  <td className="px-4 py-4 text-right text-base font-bold text-slate-900 dark:text-white">
                    ₦{totalCommitment.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between gap-3">
        {isCancelled ? (
          <button disabled className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-400 text-[11px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 cursor-not-allowed">
            <AlertOctagon className="w-4 h-4" /> Order Voided
          </button>
        ) : isFulfilled ? (
          <button disabled className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 text-emerald-600/60 dark:text-emerald-500/60 text-[11px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 cursor-not-allowed">
            <Archive className="w-4 h-4" /> Order Fulfilled
          </button>
        ) : (
          <>
            <div className="flex-1">
              {canVoid ? (
                <button
                  onClick={handleVoid}
                  disabled={isVoiding}
                  className="w-full h-full py-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all border border-transparent hover:border-red-200"
                >
                  {isVoiding ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Void Order"}
                </button>
              ) : (
                <button
                  disabled
                  title="Cannot void: Items have already been received."
                  className="w-full h-full py-2.5 text-slate-400 bg-slate-50 dark:bg-slate-800/50 text-[11px] font-bold uppercase tracking-wider rounded-lg border border-slate-200 dark:border-slate-700 cursor-not-allowed flex justify-center items-center gap-1.5"
                >
                  <ShieldAlert className="w-3.5 h-3.5" /> Locked
                </button>
              )}
            </div>

            <button
              onClick={() => setReceiveOpen(true)}
              className="flex-[2] py-2.5 bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-500 text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-md transition-all active:scale-[0.98]"
            >
              {isPartiallyReceived ? "Continue Receiving" : "Receive Items"}
            </button>
          </>
        )}
      </div>

      {/* Inline Receive Items Modal */}
      {receiveOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Receive: {po.poNumber}</h3>
              <button onClick={() => setReceiveOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {receiveItems.map((it, idx) => {
                const poItem = po.items.find((p) => p.id === it.poItemId);
                const remaining = Math.max(0, (poItem?.quantityOrdered || 0) - (poItem?.quantityReceived || 0));
                return (
                  <div key={it.poItemId} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex justify-between items-start mb-3">
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{poItem?.product?.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{poItem?.product?.sku}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] font-bold text-slate-400 uppercase">Remaining</div>
                        <div className="font-bold text-sm text-slate-700 dark:text-slate-300">{remaining}</div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0}
                        max={remaining}
                        value={it.quantityAccepted}
                        onChange={(e) => updateReceiveQty(idx, Number(e.target.value))}
                        className="flex-1 rounded-lg px-3 py-2 bg-white dark:bg-slate-950 text-sm font-bold text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex gap-3">
              <button onClick={() => setReceiveOpen(false)} className="flex-1 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
                Cancel
              </button>

              <button
                onClick={submitReceive}
                disabled={isReceiving}
                className="flex-[2] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all"
              >
                {isReceiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirm Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}