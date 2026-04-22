"use client";

import React, { useState, useMemo, useCallback } from "react";
import { 
  X, Maximize2, Minimize2, Plus, 
  Trash2, Loader2, Save, RotateCcw,
  Receipt, Info, PackageCheck
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/* -------------------------
  Types & Interfaces
------------------------- */

interface IRefundItem {
  _uiId: string;
  branchProductId: string;
  productId?: string;
  quantity: number;
  refundAmount: number;
  restocked: boolean;
  sku?: string;
  name?: string;
}

interface CreateRefundPanelProps {
  branchProducts: any[];
  onClose: () => void;
  onSuccess: () => void;
}

/* -------------------------
  Component
------------------------- */

export function CreateRefundPanel({ 
  branchProducts = [], 
  onClose,
  onSuccess
}: CreateRefundPanelProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();

  // Form State
  const [invoiceId, setInvoiceId] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [items, setItems] = useState<IRefundItem[]>([
    { 
      _uiId: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36), 
      branchProductId: "", 
      quantity: 1, 
      refundAmount: 0, 
      restocked: true 
    }
  ]);

  // Calculations
  const totalRefund = useMemo(() => 
    items.reduce((sum, item) => sum + (Number(item.refundAmount) || 0), 0), 
  [items]);

  const addItem = useCallback(() => {
    setItems(prev => [...prev, { 
      _uiId: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36), 
      branchProductId: "", 
      quantity: 1, 
      refundAmount: 0, 
      restocked: true 
    }]);
  }, []);

  const removeItem = (uiId: string) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter(it => it._uiId !== uiId));
  };

  const updateItem = (index: number, field: keyof IRefundItem, value: any) => {
    setItems(prev => {
      const next = [...prev];
      const target = { ...next[index] };

      if (field === "branchProductId") {
        const bp = branchProducts.find(p => p.id === value);
        target.branchProductId = value;
        target.productId = bp?.product?.id || "";
        target.sku = bp?.product?.sku;
        target.name = bp?.product?.name;
      } else {
        (target as any)[field] = value;
      }

      next[index] = target;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!invoiceId.trim()) {
      dispatch?.({ 
        kind: "TOAST", 
        type: "WARNING", 
        title: "Missing Reference", 
        message: "An Origin Invoice ID is required to validate the return." 
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        invoiceId,
        reason,
        items: items.map(it => ({
          branchProductId: it.branchProductId,
          productId: it.productId,
          quantity: Number(it.quantity),
          refundAmount: Number(it.refundAmount),
          restocked: it.restocked
        }))
      };

      const res = await fetch("/api/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "The refund protocol could not be authorized.");
      }

      dispatch?.({ 
        kind: "PUSH", 
        type: "SUCCESS", 
        title: "Return Processed", 
        message: `Refund Protocol ${result.refundNumber || ''} has been successfully issued.` 
      });
      
      onSuccess();
    } catch (err: any) {
      dispatch?.({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Protocol Failure", 
        message: err.message || "Internal system error during authorization." 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-2xl relative overflow-hidden text-slate-900 dark:text-slate-100 font-sans">
      {/* 1. STICKY HEADER */}
      <header className="sticky top-0 z-30 shrink-0 px-5 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-600 rounded-lg text-white shadow-lg shadow-red-500/20">
            <RotateCcw className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">
              Refund Protocol
            </h2>
            <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest flex items-center gap-1">
              Post-Sale Reversal
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleFullScreen} className="p-2 text-slate-400 hover:text-red-500 rounded-lg transition-colors">
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 2. BODY */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <form id="refund-form" onSubmit={handleSubmit} className="space-y-6">
          
          {/* Metadata Section */}
          <div className={`
            grid gap-4 mb-6 p-4 rounded-2xl 
            bg-slate-50/50 dark:bg-slate-800/30 
            border border-slate-200 dark:border-slate-800
            ${isFullScreen ? "grid-cols-2" : "grid-cols-1"}
          `}>
            <div className="space-y-2">
              <div className="flex items-center gap-2 ml-1">
                <div className="w-1 h-3 bg-red-500 rounded-full" />
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Origin Invoice ID
                </label>
              </div>
              <input 
                type="text" 
                placeholder="Enter Invoice Reference..." 
                value={invoiceId} 
                onChange={(e) => setInvoiceId(e.target.value)} 
                required 
                disabled={isSubmitting}
                className="w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm shadow-sm transition-all focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                Return Justification
              </label>
              <input 
                type="text" 
                placeholder="e.g. Factory defect, Expired..." 
                value={reason} 
                onChange={(e) => setReason(e.target.value)} 
                disabled={isSubmitting}
                className="w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm shadow-sm transition-all focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
              />
            </div>
          </div>

          {/* Items Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="text-[11px] font-bold text-slate-800 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <Receipt className="w-3.5 h-3.5" /> Return Breakdown
              </h3>
              <button 
                type="button" 
                onClick={addItem} 
                disabled={isSubmitting} 
                className="text-[10px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1 hover:underline disabled:opacity-50"
              >
                <Plus className="w-3 h-3" /> Append Item
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div 
                  key={item._uiId} 
                  className={`w-full rounded-xl border p-4 transition-all ${
                    isFullScreen ? "flex flex-row items-end gap-4" : "flex flex-col gap-3"
                  } ${
                    item.branchProductId 
                      ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40' 
                      : 'border-red-200 bg-red-50/10 dark:border-red-900/10'
                  }`}
                >
                  {/* Product Select */}
                  <div className={`${isFullScreen ? "flex-1 min-w-0" : "w-full"}`}>
                    <label className="block text-[10px] uppercase mb-1.5 font-bold text-slate-400">Product Selection</label>
                    <select 
                      value={item.branchProductId} 
                      onChange={(e) => updateItem(idx, "branchProductId", e.target.value)} 
                      required 
                      disabled={isSubmitting}
                      className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2 bg-white dark:bg-slate-950 truncate outline-none focus:border-red-500 transition-colors"
                    >
                      <option value="">Select Local Asset...</option>
                      {branchProducts.map((p) => (
                        <option key={p.id} value={p.id}>[{p.product?.sku}] {p.product?.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Inputs Group */}
                  <div className={`grid gap-3 ${isFullScreen ? "shrink-0 grid-cols-3" : "grid-cols-2 w-full"}`}>
                    <div className="min-w-0">
                      <label className="block text-[10px] uppercase mb-1.5 font-bold text-slate-400">Qty</label>
                      <input 
                        type="number" 
                        min="1" 
                        value={item.quantity} 
                        onChange={(e) => updateItem(idx, "quantity", e.target.value)} 
                        required 
                        disabled={isSubmitting}
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2 bg-white dark:bg-slate-950 font-mono font-bold outline-none focus:border-red-500 transition-colors" 
                      />
                    </div>

                    <div className="min-w-0">
                      <label className="block text-[10px] uppercase mb-1.5 font-bold text-slate-400">Refund (₦)</label>
                      <input 
                        type="number" 
                        min="0" 
                        value={item.refundAmount} 
                        onChange={(e) => updateItem(idx, "refundAmount", e.target.value)} 
                        required 
                        disabled={isSubmitting}
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2 bg-white dark:bg-slate-950 font-mono font-bold outline-none focus:border-red-500 transition-colors" 
                      />
                    </div>

                    <div className={`flex flex-col items-center justify-end pb-1.5 ${isFullScreen ? "" : "col-span-2"}`}>
                      <label className="block text-[10px] uppercase mb-1.5 font-bold text-slate-400">Restock</label>
                      <input 
                        type="checkbox" 
                        checked={item.restocked} 
                        onChange={(e) => updateItem(idx, "restocked", e.target.checked)} 
                        disabled={isSubmitting}
                        className="w-5 h-5 accent-red-600 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Remove Button */}
                  <button 
                    type="button" 
                    onClick={() => removeItem(item._uiId)} 
                    disabled={items.length === 1 || isSubmitting} 
                    className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-0 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Aggregated Footer */}
            <div className="bg-red-50 dark:bg-red-900/10 px-5 py-4 border border-red-100 dark:border-red-900/20 rounded-xl flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-red-600" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400">Total Payout Liability</span>
              </div>
              <span className="text-xl font-mono font-black text-red-700 dark:text-red-400">
                {totalRefund.toLocaleString()}
              </span>
            </div>
          </div>
        </form>
      </div>

      {/* 3. CONTROL FOOTER */}
      <footer className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end items-center gap-3 shrink-0">
        <button 
          type="button" 
          onClick={onClose} 
          disabled={isSubmitting} 
          className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
        >
          Abort
        </button>
        <button 
          type="submit" 
          form="refund-form" 
          disabled={isSubmitting} 
          className="h-10 px-4 bg-red-600 text-white text-[11px] font-bold uppercase tracking-widest rounded-lg hover:bg-red-700 transition-all shadow-lg shadow-red-500/20 flex items-center gap-4 active:scale-95 disabled:opacity-50 disabled:grayscale"
        >
          {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Authorize Refund
        </button>
      </footer>
    </div>
  );
}