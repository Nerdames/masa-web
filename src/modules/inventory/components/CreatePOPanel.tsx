"use client";

import React, { useState, useEffect } from "react";
import { 
  X, Maximize2, Minimize2, Plus, Minus,
  Trash2, Loader2, Save, Check
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

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
  _uiId?: string; // 👈 Added for stable React keys
  productId: string;
  quantityOrdered: number;
  unitCost: number;
}

interface CreatePOPanelProps {
  vendors: IVendor[];
  products: IProduct[];
  currencySymbol?: string; // 👈 Added dynamic currency
  onClose: () => void;
  onCreate: (payload: {
    vendorId: string;
    expectedDate: string | null;
    notes: string;
    items: Omit<IPOItem, "_uiId">[]; // Stripped of UI-only ID
  }) => Promise<void>;
}

/* -------------------------
  Component
------------------------- */

export default function CreatePOPanel({ 
  vendors: initialVendors, 
  products, 
  currencySymbol = "₦", 
  onClose, 
  onCreate 
}: CreatePOPanelProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  
  // Form State
  const [vendorId, setVendorId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<IPOItem[]>([
    { _uiId: crypto.randomUUID(), productId: "", quantityOrdered: 1, unitCost: 0 }
  ]);
  
  // Local Vendor Management
  const [localVendors, setLocalVendors] = useState<IVendor[]>(initialVendors);
  const [isAddingVendor, setIsAddingVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [isVendorSubmitting, setIsVendorSubmitting] = useState(false);

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync local vendors if props change
  useEffect(() => {
    setLocalVendors(initialVendors);
  }, [initialVendors]);

  /* --- Actions --- */

  const handleQuickAddVendor = async () => {
    if (!newVendorName.trim()) return;
    setIsVendorSubmitting(true);

    try {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newVendorName.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create vendor");

      setLocalVendors(prev => [...prev, data]);
      setVendorId(data.id);
      setNewVendorName("");
      setIsAddingVendor(false);
      
      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Vendor Node Linked",
        message: `Successfully registered ${data.name} to system.`
      });
    } catch (err: any) {
      dispatch({
        kind: "TOAST",
        type: "WARNING",
        title: "Provisioning Error",
        message: err.message
      });
    } finally {
      setIsVendorSubmitting(false);
    }
  };

  const addItem = () => {
    setItems([...items, { _uiId: crypto.randomUUID(), productId: "", quantityOrdered: 1, unitCost: 0 }]);
  };

  const removeItem = (idToRemove?: string) => {
    if (items.length <= 1) return;
    setItems(items.filter((item) => item._uiId !== idToRemove));
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

  // 👈 Added || 0 to prevent NaN if inputs are temporarily blank
  const totalAmount = items.reduce(
    (sum, item) => sum + ((item.quantityOrdered || 0) * (item.unitCost || 0)), 
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAddingVendor) return; 

    setIsSubmitting(true);

    if (!vendorId) {
      dispatch({
        kind: "TOAST",
        type: "WARNING",
        title: "Validation Failed",
        message: "Vendor selection is required for procurement."
      });
      setIsSubmitting(false);
      return;
    }

    if (items.some(it => !it.productId || it.quantityOrdered <= 0)) {
      dispatch({
        kind: "TOAST",
        type: "WARNING",
        title: "Data Integrity Error",
        message: "Ensure all items have a product and valid quantity."
      });
      setIsSubmitting(false);
      return;
    }

    try {
      // 👈 Strip the React UI ID before sending to the backend
      const cleanItems = items.map(({ _uiId, ...rest }) => rest);
      
      const payload = { 
        vendorId, 
        expectedDate: expectedDate || null, 
        notes, 
        items: cleanItems 
      };
      
      await onCreate(payload);
      
      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: "PO Initiated",
        message: "Purchase order has been committed to the ledger."
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate purchase order";
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "System Rejection",
        message: msg
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-2xl relative overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">Initiate Purchase Order</h2>
          <p className="text-[11px] text-slate-800 dark:text-slate-300 uppercase tracking-wide font-semibold truncate">
            Procurement fulfillment
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button 
            type="button"
            onClick={toggleFullScreen} 
            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors" 
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button 
            type="button"
            onClick={onClose} 
            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors" 
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <form id="po-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Vendor Selection with Quick Add [+] / [-] */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-[11px] font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider truncate">
                  Vendor Node
                </label>
                <button 
                  type="button"
                  onClick={() => setIsAddingVendor(!isAddingVendor)}
                  className={`p-1 rounded border transition-all ${
                    isAddingVendor 
                    ? "border-red-200 text-red-600 bg-red-50 dark:border-red-900/30 dark:bg-red-900/20" 
                    : "border-indigo-200 text-indigo-700 bg-indigo-50 dark:border-indigo-900/30 dark:bg-indigo-900/20"
                  }`}
                  title={isAddingVendor ? "Cancel" : "Add New Vendor"}
                >
                  {isAddingVendor ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                </button>
              </div>

              {!isAddingVendor ? (
                <select 
                  value={vendorId} 
                  onChange={(e) => setVendorId(e.target.value)} 
                  required 
                  disabled={isSubmitting}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white transition-colors truncate disabled:opacity-50"
                >
                  <option value="">Select Vendor...</option>
                  {localVendors.map((v) => (
                    <option key={v.id} value={v.id} className="truncate">{v.name}</option>
                  ))}
                </select>
              ) : (
                <div className="flex gap-2">
                  <input 
                    autoFocus
                    placeholder="New vendor name..."
                    value={newVendorName}
                    onChange={(e) => setNewVendorName(e.target.value)}
                    // 👈 Added to allow hitting "Enter" to save vendor without submitting PO
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleQuickAddVendor();
                      }
                    }}
                    disabled={isVendorSubmitting}
                    className="flex-1 border border-indigo-300 dark:border-indigo-900/50 rounded-lg text-sm p-2.5 outline-none bg-indigo-50/30 dark:bg-slate-950 text-slate-900 dark:text-white truncate disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={handleQuickAddVendor}
                    disabled={isVendorSubmitting || !newVendorName.trim()}
                    className="px-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {isVendorSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider truncate">
                Expected Receipt
              </label>
              <input 
                type="date" 
                value={expectedDate} 
                onChange={(e) => setExpectedDate(e.target.value)} 
                disabled={isSubmitting}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white transition-colors disabled:opacity-50" 
              />
            </div>
          </div>

          {/* Line Items Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="text-[11px] font-bold text-slate-800 dark:text-slate-300 uppercase tracking-widest truncate">
                Line Items
              </h3>
              <button 
                type="button" 
                onClick={addItem} 
                disabled={isSubmitting}
                className="text-[10px] font-bold text-emerald-800 dark:text-emerald-500 flex items-center gap-1 hover:underline transition-all whitespace-nowrap disabled:opacity-50"
              >
                <Plus className="w-3 h-3" /> Add Product
              </button>
            </div>

            <div className="space-y-3">
              {/* 👈 Now using _uiId as key instead of index */}
              {items.map((item, idx) => (
                <div
                  key={item._uiId} 
                  className={`w-full rounded-lg border p-3 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 transition-all ${
                    isFullScreen ? "flex flex-row items-end gap-3" : "flex flex-col gap-3"
                  }`}
                >
                  <div className={`${isFullScreen ? "flex-1 min-w-0" : "w-full"}`}>
                    <label className="block text-[10px] text-slate-900 dark:text-slate-200 uppercase mb-1 font-bold truncate">Product</label>
                    <select
                      value={item.productId}
                      onChange={(e) => updateItem(idx, "productId", e.target.value)}
                      required
                      disabled={isSubmitting}
                      className="w-full border border-slate-300 dark:border-slate-700 rounded-md text-sm p-2 outline-none focus:border-emerald-500 dark:bg-slate-950 text-slate-900 dark:text-white transition-colors truncate disabled:opacity-50"
                    >
                      <option value="">Select Product...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id} className="truncate">
                          [{p.sku}] {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={`flex items-end gap-3 ${isFullScreen ? "shrink-0" : "w-full"}`}>
                    <div className={isFullScreen ? "w-24" : "flex-1"}>
                      <label className="block text-[10px] text-slate-900 dark:text-slate-200 uppercase mb-1 font-bold truncate">Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantityOrdered}
                        onChange={(e) => updateItem(idx, "quantityOrdered", Number(e.target.value))}
                        required
                        disabled={isSubmitting}
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-md text-sm p-2 outline-none focus:border-emerald-500 dark:bg-slate-950 text-slate-900 dark:text-white transition-colors disabled:opacity-50"
                      />
                    </div>
                    <div className={isFullScreen ? "w-32" : "flex-1"}>
                      <label className="block text-[10px] text-slate-900 dark:text-slate-200 uppercase mb-1 font-bold truncate">Cost ({currencySymbol})</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01" // 👈 Added standard decimal support for currencies
                        value={item.unitCost}
                        onChange={(e) => updateItem(idx, "unitCost", Number(e.target.value))}
                        required
                        disabled={isSubmitting}
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-md text-sm p-2 outline-none focus:border-emerald-500 dark:bg-slate-950 text-slate-900 dark:text-white transition-colors disabled:opacity-50"
                      />
                    </div>
                    <button 
                      type="button" 
                      onClick={() => removeItem(item._uiId)} 
                      disabled={items.length === 1 || isSubmitting} 
                      className="p-2.5 text-slate-600 hover:text-red-700 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors disabled:opacity-30 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-100 dark:bg-slate-800/80 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg flex justify-between items-center">
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider truncate">Total Commitment</span>
              <span className="text-lg font-bold text-slate-950 dark:text-white whitespace-nowrap">
                {/* 👈 Dynamic currency symbol here */}
                {currencySymbol}{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider truncate">Internal Notes</label>
            <textarea 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)} 
              rows={3} 
              disabled={isSubmitting}
              placeholder="Add special delivery or handling instructions..." 
              className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white resize-none transition-colors placeholder:text-slate-500 disabled:opacity-50"
            />
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end items-center gap-3 shrink-0">
        <button 
          type="button" 
          onClick={onClose}
          disabled={isSubmitting} 
          className="px-4 py-2 text-[11px] font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap disabled:opacity-50"
        >
          Discard
        </button>
        <button 
          type="submit" 
          form="po-form" 
          disabled={isSubmitting || isAddingVendor} 
          className="h-9 px-6 bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-emerald-700 transition-all shadow-md flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
        >
          {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Confirm Order
        </button>
      </div>
    </div>
  );
}