"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  X, Maximize2, Minimize2, Plus, Minus,
  Trash2, Loader2, Save, Check, FileText, Send, Info
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
  baseCostPrice?: number; 
}

interface IPOItem {
  _uiId: string;
  productId: string;
  quantityOrdered: number;
  unitCost: number | ""; 
}

interface CreatePOPanelProps {
  vendors: IVendor[];
  products: IProduct[];
  currencySymbol?: string;
  onClose: () => void;
  onCreate: (payload: {
    vendorId: string;
    expectedDate: string | null;
    notes: string;
    status: "DRAFT" | "ISSUED"; 
    items: Omit<IPOItem, "_uiId">[];
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
    { _uiId: crypto.randomUUID(), productId: "", quantityOrdered: 1, unitCost: "" }
  ]);
  
  // Local Vendor Management
  const [localVendors, setLocalVendors] = useState<IVendor[]>(initialVendors);
  const [isAddingVendor, setIsAddingVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [isVendorSubmitting, setIsVendorSubmitting] = useState(false);

  // UI State
  const [isSubmitting, setIsSubmitting] = useState<"DRAFT" | "ISSUED" | null>(null);

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
    setItems(prev => [...prev, { _uiId: crypto.randomUUID(), productId: "", quantityOrdered: 1, unitCost: "" }]);
  };

  const removeItem = (idToRemove: string) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((item) => item._uiId !== idToRemove));
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

  const totalAmount = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = item.quantityOrdered || 0;
      const cost = item.unitCost !== "" && item.unitCost > 0 
        ? item.unitCost 
        : (products.find(p => p.id === item.productId)?.baseCostPrice || 0);
      return sum + (qty * cost);
    }, 0);
  }, [items, products]);

  const handleSubmit = async (status: "DRAFT" | "ISSUED") => {
    if (isAddingVendor) return; 

    setIsSubmitting(status);

    if (!vendorId) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Validation Failed", message: "Vendor selection is required." });
      setIsSubmitting(null);
      return;
    }

    if (items.some(it => !it.productId || it.quantityOrdered <= 0)) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Data Integrity Error", message: "Ensure all items have a product and valid quantity." });
      setIsSubmitting(null);
      return;
    }

    try {
      const cleanItems = items.map(({ _uiId, ...rest }) => ({
        ...rest,
        unitCost: rest.unitCost === "" ? (products.find(p => p.id === rest.productId)?.baseCostPrice || 0) : rest.unitCost 
      }));
      
      const payload = { 
        vendorId, 
        expectedDate: expectedDate || null, 
        notes, 
        status, 
        items: cleanItems 
      };
      
      await onCreate(payload);
      
      dispatch({ 
        kind: "TOAST", 
        type: "SUCCESS", 
        title: status === "ISSUED" ? "PO Issued Successfully" : "Draft Saved", 
        message: status === "ISSUED" 
          ? "The Purchase Order has been officially issued and committed to the ledger." 
          : "The PO has been saved as a draft for future review and has not been issued." 
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate purchase order";
      dispatch({ kind: "TOAST", type: "ERROR", title: "System Rejection", message: msg });
    } finally {
      setIsSubmitting(null);
    }
  };

  // Button text size utility based on panel/fullscreen mode
  const btnTextClass = isFullScreen ? "text-[11px]" : "text-[10px]";

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-2xl relative overflow-hidden text-slate-900 dark:text-slate-100">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
        <div className="min-w-0">
          <h2 className="text-lg font-bold truncate">Initiate Purchase Order</h2>
          <p className="text-[11px] text-slate-800 dark:text-slate-300 uppercase tracking-wide font-semibold truncate">Procurement fulfillment</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button type="button" onClick={toggleFullScreen} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {/* Process Communication Banner */}
        <div className="mb-6 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 flex gap-3 items-start">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">Workflow Information</p>
            <p className="text-[10px] text-blue-700 dark:text-blue-300 leading-relaxed">
              Saving as <span className="font-bold underline italic">Draft</span> prepares the document for review without affecting inventory. 
              Selecting <span className="font-bold underline italic">Confirm Order</span> officially issues the PO to the vendor.
            </p>
          </div>
        </div>

        <form id="po-form" className="space-y-6" onSubmit={(e) => e.preventDefault()}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-[11px] font-bold uppercase tracking-wider">Vendor Node</label>
                <button 
                  type="button" 
                  onClick={() => setIsAddingVendor(!isAddingVendor)}
                  className={`p-1 rounded border transition-all ${isAddingVendor ? "border-red-200 text-red-600 bg-red-50 dark:border-red-900/30" : "border-indigo-200 text-indigo-700 bg-indigo-50 dark:border-indigo-900/30"}`}
                >
                  {isAddingVendor ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                </button>
              </div>
              {!isAddingVendor ? (
                <select 
                  value={vendorId} onChange={(e) => setVendorId(e.target.value)} required disabled={!!isSubmitting}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 bg-white dark:bg-slate-950 transition-colors disabled:opacity-50"
                >
                  <option value="">Select Vendor...</option>
                  {localVendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              ) : (
                <div className="flex gap-2">
                  <input 
                    autoFocus placeholder="New vendor name..." value={newVendorName} onChange={(e) => setNewVendorName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickAddVendor(); } }}
                    disabled={isVendorSubmitting}
                    className="flex-1 border border-indigo-300 dark:border-indigo-900/50 rounded-lg text-sm p-2.5 bg-indigo-50/30 dark:bg-slate-950 disabled:opacity-50"
                  />
                  <button type="button" onClick={handleQuickAddVendor} disabled={isVendorSubmitting || !newVendorName.trim()} className="px-3 bg-indigo-600 text-white rounded-lg transition-colors">
                    {isVendorSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider">Expected Receipt</label>
              <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} disabled={!!isSubmitting} className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 bg-white dark:bg-slate-950 disabled:opacity-50" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="text-[11px] font-bold text-slate-800 dark:text-slate-300 uppercase tracking-widest">Line Items</h3>
              <button type="button" onClick={addItem} disabled={!!isSubmitting} className="text-[10px] font-bold text-emerald-800 dark:text-emerald-500 flex items-center gap-1 hover:underline disabled:opacity-50">
                <Plus className="w-3 h-3" /> Add Product
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => {
                const product = products.find(p => p.id === item.productId);
                return (
                  <div key={item._uiId} className={`w-full rounded-lg border p-3 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 transition-all ${isFullScreen ? "flex flex-row items-end gap-3" : "flex flex-col gap-3"}`}>
                    <div className={`${isFullScreen ? "flex-1 min-w-0" : "w-full"}`}>
                      <label className="block text-[10px] uppercase mb-1 font-bold">Product</label>
                      <select value={item.productId} onChange={(e) => updateItem(idx, "productId", e.target.value)} required disabled={!!isSubmitting} className="w-full border border-slate-300 dark:border-slate-700 rounded-md text-sm p-2 bg-white dark:bg-slate-950 disabled:opacity-50 truncate">
                        <option value="">Select Product...</option>
                        {products.map((p) => <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>)}
                      </select>
                    </div>
                    <div className={`flex items-end gap-3 ${isFullScreen ? "shrink-0" : "w-full"}`}>
                      <div className={isFullScreen ? "w-24" : "flex-1"}>
                        <label className="block text-[10px] uppercase mb-1 font-bold">Qty</label>
                        <input type="number" min="1" value={item.quantityOrdered} onChange={(e) => updateItem(idx, "quantityOrdered", Number(e.target.value))} required disabled={!!isSubmitting} className="w-full border border-slate-300 dark:border-slate-700 rounded-md text-sm p-2 bg-white dark:bg-slate-950" />
                      </div>
                      <div className={isFullScreen ? "w-32" : "flex-1"}>
                        <label className="block text-[10px] uppercase mb-1 font-bold">Cost ({currencySymbol})</label>
                        <input
                          type="number" min="0" step="0.01"
                          value={item.unitCost}
                          placeholder={product?.baseCostPrice?.toString() || "0.00"}
                          onChange={(e) => updateItem(idx, "unitCost", e.target.value === "" ? "" : Number(e.target.value))}
                          disabled={!!isSubmitting}
                          className="w-full border border-slate-300 dark:border-slate-700 rounded-md text-sm p-2 bg-white dark:bg-slate-950 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                        />
                      </div>
                      <button type="button" onClick={() => removeItem(item._uiId)} disabled={items.length === 1 || !!isSubmitting} className="p-2.5 text-slate-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors disabled:opacity-30 shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-slate-100 dark:bg-slate-800/80 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg flex justify-between items-center">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Commitment</span>
              <span className="text-lg font-bold">
                {currencySymbol}{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider">Internal Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} disabled={!!isSubmitting} placeholder="Add instructions..." className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 bg-white dark:bg-slate-950 resize-none disabled:opacity-50" />
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end items-center gap-3 shrink-0">
        <button 
          type="button" 
          onClick={onClose} 
          disabled={!!isSubmitting} 
          className={`px-4 py-2 font-bold uppercase tracking-wider disabled:opacity-50 ${btnTextClass}`}
        >
          Discard
        </button>
        
        {/* Save as Draft Button */}
        <button 
          type="button" 
          onClick={() => handleSubmit("DRAFT")} 
          disabled={!!isSubmitting || isAddingVendor} 
          className={`h-9 px-4 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-100 font-bold uppercase tracking-wider rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-all flex items-center gap-2 disabled:opacity-50 ${btnTextClass}`}
          title="Save as an internal draft without issuing to vendor"
        >
          {isSubmitting === "DRAFT" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          Save Draft
        </button>

        {/* Confirm Order Button */}
        <button 
          type="button" 
          onClick={() => handleSubmit("ISSUED")} 
          disabled={!!isSubmitting || isAddingVendor} 
          className={`h-9 px-6 bg-emerald-600 text-white font-bold uppercase tracking-wider rounded-lg hover:bg-emerald-700 transition-all shadow-md flex items-center gap-2 disabled:opacity-50 ${btnTextClass}`}
          title="Issue this PO to the vendor and commit to ledger"
        >
          {isSubmitting === "ISSUED" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Issue PO
        </button>
      </div>
    </div>
  );
}