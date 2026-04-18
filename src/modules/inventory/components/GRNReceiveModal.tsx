"use client";

import React, { useState, useEffect } from "react";
import { X, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { PO, ReceiveItemInput } from "./types";

interface GRNReceiveModalProps {
  po: PO;
  onClose: () => void;
  onSuccess: () => void;
}

export default function GRNReceiveModal({ po, onClose, onSuccess }: GRNReceiveModalProps) {
  const { dispatch } = useAlerts();
  const [isReceiving, setIsReceiving] = useState(false);
  const [receiveItems, setReceiveItems] = useState<ReceiveItemInput[]>([]);

  // Dynamically extract items that still need receiving
  useEffect(() => {
    setReceiveItems(
      po.items
        .filter((it) => (it.quantityOrdered - (it.quantityReceived || 0)) > 0)
        .map((it) => ({
          poItemId: it.id,
          productId: it.productId,
          quantityAccepted: Math.max(0, it.quantityOrdered - (it.quantityReceived || 0)), // Default to receiving remaining
        }))
    );
  }, [po]);

  function updateReceiveQty(index: number, value: number, maxAllowed: number) {
    setReceiveItems((prev) => {
      const copy = [...prev];
      // Prevent receiving more than ordered to maintain schema limits unless explicit over-receiving is allowed
      const sanitizedValue = Math.min(maxAllowed, Math.max(0, Math.floor(Number(value) || 0)));
      copy[index] = {
        ...copy[index],
        quantityAccepted: sanitizedValue
      };
      return copy;
    });
  }

  async function submitReceive() {
    const activeItems = receiveItems.filter((it) => it.quantityAccepted > 0);

    if (activeItems.length === 0) {
      dispatch?.({
        kind: "TOAST",
        type: "ERROR",
        title: "Validation Error",
        message: "You must receive at least one item to generate a GRN."
      });
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
            quantityRejected: 0, // Ready for future expansion if QA rejection is needed
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
      if (!res.ok) throw new Error(body?.error || "Failed to establish Goods Receipt Note");

      dispatch?.({
        kind: "PUSH",
        type: "SUCCESS",
        title: "GRN Secured",
        message: `Inventory successfully committed.`
      });

      window.dispatchEvent(new CustomEvent("po:updated", {
        detail: { id: po.id, action: "RECEIVE", grnId: body?.id }
      }));

      onSuccess(); 
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected backend error occurred";
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "Receiving Exception", message: msg });
    } finally {
      setIsReceiving(false);
    }
  }

  if (receiveItems.length === 0) {
     return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
           <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 text-center border border-slate-200 dark:border-slate-800">
              <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">All Items Received</h3>
              <p className="text-sm text-slate-500 mt-2 mb-6">There are no outstanding items to receive for this Purchase Order.</p>
              <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">Close</button>
           </div>
        </div>
     );
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Generate GRN: {po.poNumber}</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Enter exact quantities verified by physical audit</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 custom-scrollbar">
          {receiveItems.map((it, idx) => {
            const poItem = po.items.find((p) => p.id === it.poItemId);
            const remaining = Math.max(0, (poItem?.quantityOrdered || 0) - (poItem?.quantityReceived || 0));
            
            return (
              <div key={it.poItemId} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="flex justify-between items-start mb-3">
                  <div className="min-w-0 pr-4">
                    <div className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{poItem?.product?.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{poItem?.product?.sku}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Remaining</div>
                    <div className="font-bold text-sm text-slate-700 dark:text-slate-300">{remaining}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Accept Qty</label>
                  <input
                    type="number"
                    min={0}
                    max={remaining}
                    value={it.quantityAccepted}
                    onChange={(e) => updateReceiveQty(idx, Number(e.target.value), remaining)}
                    className="flex-1 rounded-lg px-3 py-2 bg-white dark:bg-slate-950 text-sm font-bold text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-right"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <button onClick={onClose} className="flex-1 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            Cancel
          </button>
          <button
            onClick={submitReceive}
            disabled={isReceiving}
            className="flex-[2] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all active:scale-[0.98]"
          >
            {isReceiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Confirm & Log GRN
          </button>
        </div>
      </div>
    </div>
  );
}