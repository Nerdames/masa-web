"use client";

import React, { useState } from "react";
import { 
  X, Maximize2, Minimize2, Plus, 
  Trash2, Loader2, Save 
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext"; // Adjust import path

/* -------------------------
  Types & Interfaces
------------------------- */

interface IVendor {
  id: string;
  name: string;
}

interface IProduct {
  id: string;
  name: string;
  sku: string;
}

interface IPOItem {
  productId: string;
  quantityOrdered: number;
  unitCost: number;
}

interface CreatePOPanelProps {
  vendors: IVendor[];
  products: IProduct[];
  onClose: () => void;
  onCreate: (payload: {
    vendorId: string;
    expectedDate: string | null;
    notes: string;
    items: IPOItem[];
  }) => Promise<void>;
}

/* -------------------------
  Component
------------------------- */

export default function CreatePOPanel({ 
  vendors, 
  products, 
  onClose, 
  onCreate 
}: CreatePOPanelProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  
  // Form State
  const [vendorId, setVendorId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<IPOItem[]>([
    { productId: "", quantityOrdered: 1, unitCost: 0 }
  ]);
  
  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* --- Actions --- */

  const addItem = () => {
    setItems([...items, { productId: "", quantityOrdered: 1, unitCost: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = <K extends keyof IPOItem>(
    index: number, 
    field: K, 
    value: IPOItem[K]
  ) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const totalAmount = items.reduce(
    (sum, item) => sum + (item.quantityOrdered * item.unitCost), 
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    // Validation
    if (!vendorId) {
      setError("Vendor node selection is required.");
      setIsSubmitting(false);
      return;
    }

    if (items.some(it => !it.productId || it.quantityOrdered <= 0)) {
      setError("Please ensure all items have a product and valid quantity.");
      setIsSubmitting(false);
      return;
    }

    try {
      const payload = { 
        vendorId, 
        expectedDate: expectedDate || null, 
        notes, 
        items 
      };
      await onCreate(payload);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate purchase order";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-2xl relative overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Initiate Purchase Order</h2>
          <p className="text-[11px] text-slate-700 dark:text-slate-300 uppercase tracking-wide font-medium">
            Procurement fulfillment
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={toggleFullScreen} 
            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors" 
            title="Toggle Fullscreen"
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button 
            type="button"
            onClick={onClose} 
            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors" 
            title="Close Panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-xs font-bold border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900/50">
            {error}
          </div>
        )}

        <form id="po-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Top Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Vendor Node
              </label>
              <select 
                value={vendorId} 
                onChange={(e) => setVendorId(e.target.value)} 
                required 
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors"
              >
                <option value="">Select Vendor...</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Expected Receipt
              </label>
              <input 
                type="date" 
                value={expectedDate} 
                onChange={(e) => setExpectedDate(e.target.value)} 
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors" 
              />
            </div>
          </div>

          {/* Line Items Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <h3 className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                Line Items
              </h3>
              <button 
                type="button" 
                onClick={addItem} 
                className="text-[10px] font-bold text-emerald-700 dark:text-emerald-500 flex items-center gap-1 hover:underline transition-all"
              >
                <Plus className="w-3 h-3" /> Add Product
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className={`w-full rounded-lg border p-3 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 transition-all ${
                    isFullScreen ? "flex flex-row items-end gap-3" : "flex flex-col gap-3"
                  }`}
                >
                  {/* Product Selection */}
                  <div className={`${isFullScreen ? "flex-1 min-w-0" : "w-full"}`}>
                    <label className="block text-[10px] text-slate-700 dark:text-slate-300 uppercase mb-1 font-bold">
                      Product
                    </label>
                    <select
                      value={item.productId}
                      onChange={(e) => updateItem(idx, "productId", e.target.value)}
                      required
                      className="w-full border border-slate-300 dark:border-slate-700 rounded-md text-sm p-2 outline-none focus:border-emerald-500 dark:bg-slate-950 dark:text-white transition-colors"
                    >
                      <option value="">Select Product...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Qty & Cost Inputs */}
                  <div className={`flex items-end gap-3 ${isFullScreen ? "shrink-0" : "w-full"}`}>
                    <div className={isFullScreen ? "w-24" : "flex-1"}>
                      <label className="block text-[10px] text-slate-700 dark:text-slate-300 uppercase mb-1 font-bold">
                        Qty
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantityOrdered}
                        onChange={(e) => updateItem(idx, "quantityOrdered", Number(e.target.value))}
                        required
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-md text-sm p-2 outline-none focus:border-emerald-500 dark:bg-slate-950 dark:text-white transition-colors"
                      />
                    </div>

                    <div className={isFullScreen ? "w-32" : "flex-1"}>
                      <label className="block text-[10px] text-slate-700 dark:text-slate-300 uppercase mb-1 font-bold">
                        Unit Cost (₦)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={item.unitCost}
                        onChange={(e) => updateItem(idx, "unitCost", Number(e.target.value))}
                        required
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-md text-sm p-2 outline-none focus:border-emerald-500 dark:bg-slate-950 dark:text-white transition-colors"
                      />
                    </div>

                    <button 
                      type="button" 
                      onClick={() => removeItem(idx)} 
                      disabled={items.length === 1} 
                      className="p-2.5 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors disabled:opacity-30 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Total Summary Bar */}
            <div className="bg-slate-100 dark:bg-slate-800/80 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg flex justify-end items-center gap-4">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Total Commitment
              </span>
              <span className="text-lg font-bold text-slate-900 dark:text-white">
                ₦{totalAmount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Internal Notes
            </label>
            <textarea 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)} 
              rows={3} 
              placeholder="Add special delivery or handling instructions..." 
              className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white resize-none transition-colors placeholder:text-slate-500"
            />
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end items-center gap-3 shrink-0">
        <button 
          type="button" 
          onClick={onClose} 
          className="px-4 py-2 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          Discard
        </button>
        <button 
          type="submit" 
          form="po-form" 
          disabled={isSubmitting} 
          className="h-9 px-6 bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-emerald-700 transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Confirm Order
        </button>
      </div>
    </div>
  );
}