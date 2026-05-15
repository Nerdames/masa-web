"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
  X, Maximize2, Minimize2, Plus, Minus, 
  Trash2, Loader2, Save, Send, Info, Lock,
  Truck, ShoppingCart, CheckCircle2, AlertTriangle
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { usePermission } from "@/core/hooks/usePermission";
import { PermissionAction, Resource } from "@prisma/client";

/* -------------------------------------------------------------------------- */
/* TYPES & INTERFACES                                                         */
/* -------------------------------------------------------------------------- */

interface IVendor {
  id: string;
  name: string;
}

interface IProduct {
  id: string;
  name: string;
  sku: string;
  // Prisma Decimal comes over the wire as a string, so we accept both to be safe.
  baseCostPrice?: number | string; 
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

/* -------------------------------------------------------------------------- */
/* UTILS                                                                      */
/* -------------------------------------------------------------------------- */

// Helper to safely extract a JS Number from Prisma's serialized Decimal string
const getNumericPrice = (price: number | string | undefined): number => {
  if (price === undefined || price === null) return 0;
  const parsed = typeof price === 'string' ? parseFloat(price) : price;
  return isNaN(parsed) ? 0 : parsed;
};

/* -------------------------------------------------------------------------- */
/* CONSTANTS & STYLES (Synchronized with MASA Design System)                  */
/* -------------------------------------------------------------------------- */

const inputClass = `
  w-full border border-slate-200 dark:border-slate-800 rounded-md text-xs p-2.5
  bg-white dark:bg-slate-950 text-slate-900 dark:text-white
  focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all
  placeholder:text-slate-400 dark:placeholder:text-slate-600 disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-900/50
`;

const labelClass = "block text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5";

const sectionHeaderClass = "text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] border-b border-slate-100 dark:border-slate-800 pb-1.5 mb-4";

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function CreatePOPanel({ 
  vendors: initialVendors, 
  products, 
  currencySymbol = "₦", 
  onClose, 
  onCreate 
}: CreatePOPanelProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  
  // Permission Engine Integration
  const { can, canCreate, isLoading: isAuthLoading } = usePermission();
  const canAddVendor = canCreate(Resource.VENDOR);
  const canCreatePO = can(PermissionAction.CREATE, Resource.PROCUREMENT);
  
  // Form State
  const [vendorId, setVendorId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<IPOItem[]>([
    { _uiId: crypto.randomUUID(), productId: "", quantityOrdered: 1, unitCost: "" }
  ]);
  
  // Local Vendor Management (Inline Creation)
  const [localVendors, setLocalVendors] = useState<IVendor[]>(initialVendors);
  const [isAddingVendor, setIsAddingVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [isVendorSubmitting, setIsVendorSubmitting] = useState(false);

  // UI Submission State
  const [isSubmitting, setIsSubmitting] = useState<"DRAFT" | "ISSUED" | null>(null);

  useEffect(() => {
    setLocalVendors(initialVendors);
  }, [initialVendors]);

  /* --- Actions --- */

  const handleQuickAddVendor = async () => {
    if (!newVendorName.trim() || !canAddVendor) return;
    setIsVendorSubmitting(true);

    try {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newVendorName.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create vendor");

      setLocalVendors(prev => [...prev, data.data || data]);
      setVendorId(data.data?.id || data.id);
      setNewVendorName("");
      setIsAddingVendor(false);
      
      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Vendor Node Linked",
        message: `Successfully registered ${data.data?.name || data.name} to system.`
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

  const updateItem = useCallback(<K extends keyof IPOItem>(
    index: number, 
    field: K, 
    value: IPOItem[K]
  ) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const totalAmount = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = item.quantityOrdered || 0;
      const product = products.find(p => p.id === item.productId);
      const cost = item.unitCost !== "" && item.unitCost > 0 
        ? item.unitCost 
        : getNumericPrice(product?.baseCostPrice);
      return sum + (qty * Number(cost));
    }, 0);
  }, [items, products]);

  const handleSubmit = async (status: "DRAFT" | "ISSUED") => {
    if (isAddingVendor || !canCreatePO) return; 

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
      const cleanItems = items.map(({ _uiId, ...rest }) => {
        const product = products.find(p => p.id === rest.productId);
        return {
          ...rest,
          unitCost: rest.unitCost === "" ? getNumericPrice(product?.baseCostPrice) : Number(rest.unitCost) 
        };
      });
      
      const payload = { 
        vendorId, 
        expectedDate: expectedDate || null, 
        notes: notes.trim(), 
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
          : "The PO has been saved as a draft for future review." 
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate purchase order";
      dispatch({ kind: "TOAST", type: "ERROR", title: "System Rejection", message: msg });
      setIsSubmitting(null);
    }
  };

  const formattedTotalAmount = totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-2xl relative overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <ShoppingCart className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-bold truncate text-slate-900 dark:text-white uppercase tracking-wider">New Purchase Order</h2>
            <p className="text-[10px] text-slate-500 font-medium">Procurement Workflow</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={toggleFullScreen} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors text-slate-500">
            {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {/* Permission Banner */}
        {!canCreatePO && !isAuthLoading && (
          <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 flex gap-3 items-center">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-[10px] text-amber-800 dark:text-amber-300 font-bold uppercase tracking-tight">
              Access Restricted: Procurement creation requires authorized clearance.
            </p>
          </div>
        )}

        <form id="po-form" className="space-y-6" onSubmit={(e) => e.preventDefault()}>
          
          {/* Section 1: Logistics */}
          <section className="space-y-4">
            <h3 className={sectionHeaderClass}>Procurement Logistics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Target Vendor *</label>
                  {canAddVendor && (
                    <button 
                      type="button" 
                      onClick={() => setIsAddingVendor(!isAddingVendor)}
                      className="text-[9px] font-bold text-emerald-600 hover:underline uppercase tracking-tighter"
                    >
                      {isAddingVendor ? "Cancel" : "+  Add"}
                    </button>
                  )}
                </div>
                {!isAddingVendor ? (
                  <select 
                    value={vendorId} 
                    onChange={(e) => setVendorId(e.target.value)} 
                    disabled={!!isSubmitting || !canCreatePO}
                    className={inputClass}
                  >
                    <option value="">Select a vendor...</option>
                    {localVendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                ) : (
                  <div className="flex gap-1.5">
                    <input 
                      autoFocus 
                      placeholder="Enter vendor name..." 
                      value={newVendorName} 
                      onChange={(e) => setNewVendorName(e.target.value)}
                      disabled={isVendorSubmitting}
                      className={inputClass}
                    />
                    <button 
                      type="button" 
                      onClick={handleQuickAddVendor} 
                      disabled={isVendorSubmitting || !newVendorName.trim()} 
                      className="px-3 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md flex-shrink-0"
                    >
                      {isVendorSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Exp. Delivery Date</label>
                <input 
                  type="date" 
                  value={expectedDate} 
                  onChange={(e) => setExpectedDate(e.target.value)} 
                  disabled={!!isSubmitting || !canCreatePO} 
                  className={inputClass} 
                />
              </div>
            </div>
          </section>

          {/* Section 2: Items */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
              <h3 className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">Line Item Manifest</h3>
              <button 
                type="button" 
                onClick={addItem} 
                disabled={!!isSubmitting || !canCreatePO} 
                className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-500 uppercase hover:underline disabled:opacity-50"
              >
                <Plus className="w-2.5 h-2.5" /> Add Row
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => {
                const product = products.find(p => p.id === item.productId);
                return (
                  <div 
                    key={item._uiId} 
                    className={`group relative p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 transition-all ${isFullScreen ? "flex items-end gap-3" : "space-y-3"}`}
                  >
                    <div className="flex-1 min-w-0">
                      <label className={labelClass}>Product / SKU *</label>
                      <select 
                        value={item.productId} 
                        onChange={(e) => updateItem(idx, "productId", e.target.value)} 
                        disabled={!!isSubmitting || !canCreatePO} 
                        className={inputClass}
                      >
                        <option value="">Search catalog...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            [{p.sku}] {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={`flex items-end gap-2 ${isFullScreen ? "w-auto" : "w-full"}`}>
                      <div className={isFullScreen ? "w-20" : "flex-1"}>
                        <label className={labelClass}>Qty</label>
                        <input 
                          type="number" 
                          min="1" 
                          value={item.quantityOrdered} 
                          onChange={(e) => updateItem(idx, "quantityOrdered", Number(e.target.value))} 
                          disabled={!!isSubmitting || !canCreatePO} 
                          className={`${inputClass} text-center`} 
                        />
                      </div>
                      <div className={isFullScreen ? "w-32" : "flex-1"}>
                        <label className={labelClass}>Unit Cost ({currencySymbol})</label>
                        <input
                          type="number" 
                          min="0" 
                          step="0.01"
                          value={item.unitCost}
                          // Safe parsing applied here
                          placeholder={getNumericPrice(product?.baseCostPrice).toFixed(2)}
                          onChange={(e) => updateItem(idx, "unitCost", e.target.value === "" ? "" : Number(e.target.value))}
                          disabled={!!isSubmitting || !canCreatePO}
                          className={`${inputClass} text-right font-mono`}
                        />
                      </div>
                      <button 
                        type="button" 
                        onClick={() => removeItem(item._uiId)} 
                        disabled={items.length === 1 || !!isSubmitting || !canCreatePO} 
                        className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all disabled:opacity-0 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 3: Financial Summary (Responsive Fix Applied) */}
          <section className={`p-4 rounded-lg bg-slate-900 dark:bg-black border border-slate-800 shadow-inner flex ${isFullScreen ? 'flex-row items-center justify-between' : 'flex-col items-start gap-4'} transition-all`}>
            <div className="min-w-0">
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-[0.2em]">Total Financial Commitment</p>
              <div className="flex items-center gap-2 mt-1">
                <Truck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="text-[10px] text-slate-400 font-medium truncate">Verified against base cost prices</span>
              </div>
            </div>
            <div className={`text-left ${isFullScreen ? 'text-right' : 'w-full overflow-hidden'}`}>
              <span 
                title={`${currencySymbol}${formattedTotalAmount}`} 
                className="text-2xl font-black text-white font-mono tracking-tighter truncate block w-full"
              >
                {currencySymbol}{formattedTotalAmount}
              </span>
            </div>
          </section>

          {/* Section 4: Remarks */}
          <section className="space-y-1">
            <label className={labelClass}>Internal Notes & Instructions</label>
            <textarea 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)} 
              rows={3} 
              disabled={!!isSubmitting || !canCreatePO} 
              placeholder="Enter special handling instructions, shipping details, or internal memos..." 
              className={`${inputClass} resize-none`} 
            />
          </section>
        </form>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end items-center gap-2 shrink-0">
        <button 
          type="button" 
          onClick={onClose} 
          disabled={!!isSubmitting} 
          className="px-3 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-800 dark:hover:text-slate-300 transition-colors"
        >
          Discard
        </button>

        <button 
          type="button" 
          onClick={() => handleSubmit("DRAFT")} 
          disabled={!!isSubmitting || isAddingVendor || !canCreatePO} 
          className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-bold uppercase tracking-widest rounded-md hover:bg-slate-50 dark:hover:bg-slate-900 transition-all disabled:opacity-50"
        >
          {isSubmitting === "DRAFT" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save Draft
        </button>

        <button 
          type="button" 
          onClick={() => handleSubmit("ISSUED")} 
          disabled={!!isSubmitting || isAddingVendor || !canCreatePO} 
          className="flex items-center gap-1.5 px-6 py-2 bg-emerald-600 text-white text-[9px] font-bold uppercase tracking-widest rounded-md hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
        >
          {isSubmitting === "ISSUED" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          Issue PO
        </button>
      </div>
    </div>
  );
}