"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X, Maximize2, Minimize2, Package,
  Loader2, CheckCircle2, AlertOctagon, Archive, ShieldAlert,
  Phone, Mail, History
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import GRNDetailView from "@/modules/inventory/components/GRNDetailView";

/* -------------------------
Types - Aligned with Prisma
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
    barcode?: string;
    uom?: {
      abbreviation: string;
      name: string;
    }
  };
}

interface PO {
  id: string;
  poNumber: string;
  organizationId: string;
  branchId: string;
  status: "DRAFT" | "ISSUED" | "PARTIALLY_RECEIVED" | "FULFILLED" | "CANCELLED"; 
  totalAmount: number | string;
  currency: string;
  expectedDate?: string | null;
  createdAt: string;
  notes?: string;
  vendor?: {
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
  };
  createdBy?: {
    name: string | null;
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
  const { isFullScreen, toggleFullScreen, openPanel } = useSidePanel();
  const { dispatch } = useAlerts();
  const [isVoiding, setIsVoiding] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);

  const isCancelled = po.status === "CANCELLED";
  const isFulfilled = po.status === "FULFILLED";
  const isPartiallyReceived = po.status === "PARTIALLY_RECEIVED";
  const currencySymbol = po.currency === "NGN" ? "₦" : po.currency + " ";
  
  const canVoid = !isCancelled && !isFulfilled && !isPartiallyReceived;

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
      const res = await fetch(`/api/inventory/procurement/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (!res.ok) throw new Error("Failed to void purchase order");

      dispatch?.({ kind: "PUSH", type: "SUCCESS", title: "PO Voided", message: `Successfully cancelled ${po.poNumber}` });
      window.dispatchEvent(new CustomEvent("po:updated", { detail: { id: po.id, action: "VOID" } }));
      onClose();
    } catch (err: any) {
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "Void failed", message: err.message });
    } finally {
      setIsVoiding(false);
    }
  }

  function updateReceiveQty(index: number, value: number) {
    setReceiveItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], quantityAccepted: Math.max(0, Math.floor(Number(value) || 0)) };
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
          return {
            poItemId: it.poItemId,
            productId: String(original?.productId),
            quantityAccepted: it.quantityAccepted,
            quantityRejected: 0,
            unitCost: original?.unitCost ? Number(original.unitCost) : 0,
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
      window.dispatchEvent(new CustomEvent("po:updated", { detail: { id: po.id, action: "RECEIVE", grnId: body?.id } }));
      setReceiveOpen(false);
      onClose();
    } catch (err: any) {
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "Receive failed", message: err.message });
    } finally {
      setIsReceiving(false);
    }
  }

  async function handleViewHistory() {
    setIsFetchingHistory(true);
    try {
      const res = await fetch(`/api/inventory/grns?purchaseOrderId=${po.id}`);
      if (!res.ok) throw new Error("Failed to fetch receipt history.");
      
      const data = await res.json();
      const grns = data.items || data.grns || [];

      if (grns.length === 0) {
        dispatch?.({ kind: "TOAST", type: "INFO", title: "No History", message: "No receipts found for this Purchase Order yet." });
        return;
      }

      // Default to showing the most recent GRN. 
      const latestGrn = grns[0];
      
      if (grns.length > 1) {
        dispatch?.({ kind: "TOAST", type: "INFO", title: "Multiple Receipts", message: `Opening latest receipt (1 of ${grns.length})` });
      }

      // Swap the panel content to the GRN Detail View
      openPanel(<GRNDetailView grn={latestGrn} onClose={onClose} />, `Receipt: ${latestGrn.grnNumber}`);

    } catch (err: any) {
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "Fetch failed", message: err.message });
    } finally {
      setIsFetchingHistory(false);
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-xl relative">
      {/* Header */}
      <div className="px-4 py-4 border-b border-slate-200/60 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-nowrap overflow-hidden">
            <h2 className="text-base md:text-md font-bold text-slate-800 dark:text-slate-100 truncate whitespace-nowrap">
              {po.poNumber}
            </h2>
            {isPartiallyReceived && (
              <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[8px]  font-bold tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap uppercase">
                Partial
              </span>
            )}
          </div>
          <p className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 whitespace-nowrap">
            Created {new Date(po.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <button onClick={toggleFullScreen} className="p-1.5 md:p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-1.5 md:p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-2 space-y-6 md:space-y-8 custom-scrollbar">
        {/* Vendor & General Info Layers */}
        <section className="flex flex-col gap-6 md:grid md:grid-cols-2">
          {/* Vendor Layer (Top on mobile) */}
          <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
             <h4 className="text-[9px] md:text-[10px] font-semibold text-slate-500 uppercase truncate mb-3 flex items-center gap-2 ">
              <Package className="w-3 h-3" /> Vendor Details
            </h4>
            <p className="text-xs md:text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{po.vendor?.name}</p>
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] md:text-xs text-slate-500 truncate">
                <Mail className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{po.vendor?.email || "N/A"}</span>
              </div>
              {po.vendor?.phone && (
                <div className="flex items-center gap-2 text-[10px] md:text-xs text-slate-500 whitespace-nowrap">
                  <Phone className="w-3 h-3 flex-shrink-0" /> {po.vendor?.phone}
                </div>
              )}
            </div>
          </div>

          {/* Expected Date, Initiated By, Currency Layer */}
          <div className="space-y-3 md:space-y-4">
             <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2 pt-2">
                <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Expected Date</span>
                <span className="text-[11px] md:text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                  {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : "TBD"}
                </span>
             </div>
             <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Initiated By</span>
                <span className="text-[11px] md:text-sm font-medium text-slate-700 dark:text-slate-300 truncate ml-4 text-right">{po.createdBy?.name || "System"}</span>
             </div>
             <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Currency</span>
                <span className="text-[11px] md:text-sm font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">{po.currency}</span>
             </div>
          </div>
        </section>

        {/* Itemized Commitment Table */}
        <section className="order-3">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-[9px] md:text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
              Itemized Commitment
            </h4>
            <button 
              onClick={handleViewHistory}
              disabled={isFetchingHistory}
              className="flex items-center gap-1.5 text-[9px] md:text-[10px] font-bold text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors uppercase disabled:opacity-50"
            >
              {isFetchingHistory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <History className="w-3.5 h-3.5" />}
              {isFetchingHistory ? "Fetching..." : "History"}
            </button>
          </div>
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-left text-sm min-w-[450px] md:min-w-0">
              <thead className="bg-slate-50/50 dark:bg-slate-800/50">
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="px-3 md:px-4 py-3 text-[8px] md:text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">Product Details</th>
                  <th className="px-2 md:px-4 py-3 text-[8px] md:text-[10px] font-bold text-slate-500 uppercase text-center whitespace-nowrap">UOM</th>
                  <th className="px-2 md:px-4 py-3 text-[8px] md:text-[10px] font-bold text-slate-500 uppercase text-center whitespace-nowrap">Qty</th>
                  <th className="px-2 md:px-4 py-3 text-[8px] md:text-[10px] font-bold text-slate-500 uppercase text-center whitespace-nowrap">Recv.</th>
                  <th className="px-3 md:px-4 py-3 text-[8px] md:text-[10px] font-bold text-slate-500 uppercase text-right whitespace-nowrap">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {po.items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-3 md:px-4 py-2.5 min-w-[140px]">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 text-[10px] md:text-sm line-clamp-1" title={item.product?.name}>
                        {item.product?.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        <span className="text-[7.5px] md:text-[9px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-500 font-mono whitespace-nowrap">
                          {item.product?.sku}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 md:px-4 py-2.5 text-center text-[9px] md:text-xs text-slate-500 font-medium whitespace-nowrap uppercase">
                      {item.product?.uom?.abbreviation || "unit"}
                    </td>
                    <td className="px-2 md:px-4 py-2.5 text-center font-medium text-slate-700 dark:text-slate-300 text-[10px] md:text-sm whitespace-nowrap">
                      {item.quantityOrdered}
                    </td>
                    <td className="px-2 md:px-4 py-2.5 text-center font-medium text-[10px] md:text-sm whitespace-nowrap">
                      <span className={item.quantityReceived >= item.quantityOrdered ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-slate-500"}>
                        {item.quantityReceived || 0}
                      </span>
                    </td>
                    <td className="px-3 md:px-4 py-2.5 text-right font-semibold text-slate-900 dark:text-white text-[10px] md:text-sm whitespace-nowrap">
                      {currencySymbol}{(item.quantityOrdered * item.unitCost).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
                <tfoot className="bg-slate-50/80 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700">
                  <tr>
                    <td colSpan={5} className="px-3 md:px-4 py-4">
                      <div className="flex flex-col md:flex-row md:justify-between md:items-baseline w-full">
                        <span className="text-[8px] md:text-[10px] font-bold text-slate-500 uppercase tracking-tighter md:tracking-normal whitespace-nowrap">
                          Total Commitment
                        </span>
                        <span className="text-sm md:text-base font-bold text-slate-900 dark:text-white whitespace-nowrap">
                          {currencySymbol}{totalCommitment.toLocaleString()}
                        </span>
                      </div>
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
          <button disabled className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-400 text-[10px] md:text-[11px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700">
            <AlertOctagon className="w-4 h-4" /> Order Voided
          </button>
        ) : isFulfilled ? (
          <button disabled className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 text-emerald-600/60 dark:text-emerald-500/60 text-[10px] md:text-[11px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700">
            <Archive className="w-4 h-4" /> Order Fulfilled
          </button>
        ) : (
          <>
            <div className="flex-1">
              {canVoid ? (
                <button onClick={handleVoid} disabled={isVoiding} className="w-full h-full py-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-[10px] md:text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all border border-transparent hover:border-red-200">
                  {isVoiding ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Void"}
                </button>
              ) : (
                <button disabled title="Already partially received." className="w-full h-full py-2.5 text-slate-400 bg-slate-50 dark:bg-slate-800/50 text-[9px] md:text-[11px] font-bold uppercase tracking-wider rounded-lg border border-slate-200 dark:border-slate-700 cursor-not-allowed flex justify-center items-center gap-1.5 whitespace-nowrap">
                  <ShieldAlert className="w-3.5 h-3.5" /> Locked
                </button>
              )}
            </div>

            <button onClick={() => setReceiveOpen(true)} className="flex-[2] py-2.5 bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-500 text-[10px] md:text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-md transition-all active:scale-[0.98] whitespace-nowrap">
              {isPartiallyReceived ? "Continue Receiving" : "Receive Items"}
            </button>
          </>
        )}
      </div>

      {/* Receive Modal */}
      {receiveOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap truncate mr-2">Receive: {po.poNumber}</h3>
              <button onClick={() => setReceiveOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md flex-shrink-0">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="p-4 md:p-5 overflow-y-auto space-y-4">
              {receiveItems.map((it, idx) => {
                const poItem = po.items.find((p) => p.id === it.poItemId);
                const remaining = Math.max(0, (poItem?.quantityOrdered || 0) - (poItem?.quantityReceived || 0));
                return (
                  <div key={it.poItemId} className="p-3 md:p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex justify-between items-start mb-3 gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[11px] md:text-sm text-slate-800 dark:text-slate-100 truncate">{poItem?.product?.name}</div>
                        <div className="text-[9px] md:text-[10px] text-slate-400 font-mono mt-0.5 truncate uppercase">
                          {poItem?.product?.sku} • {poItem?.product?.uom?.abbreviation || "unit"}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">Remaining</div>
                        <div className="font-bold text-[11px] md:text-sm text-slate-700 dark:text-slate-300">{remaining}</div>
                      </div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={remaining}
                      value={it.quantityAccepted}
                      onChange={(e) => updateReceiveQty(idx, Number(e.target.value))}
                      className="w-full rounded-lg px-3 py-2 bg-white dark:bg-slate-950 text-sm font-bold text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 focus:border-emerald-500 outline-none transition-all"
                    />
                  </div>
                );
              })}
            </div>

            <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex gap-3">
              <button onClick={() => setReceiveOpen(false)} className="flex-1 py-2 text-xs md:text-sm font-semibold text-slate-500 hover:text-slate-700 whitespace-nowrap">Cancel</button>
              <button onClick={submitReceive} disabled={isReceiving} className="flex-[2] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs md:text-sm font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 whitespace-nowrap">
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