"use client";

import React, { useState, useMemo, useCallback } from "react";
import { 
  X, Maximize2, Minimize2, Plus, 
  Trash2, Loader2, Save, ArrowRightLeft,
  Database, Boxes
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/* -------------------------
  Types & Interfaces
------------------------- */

interface IBranch {
  id: string;
  name: string;
}

interface IBranchProduct {
  id: string;
  stock: number;
  product: {
    id: string;
    name: string;
    sku: string;
  };
}

interface ITransferItem {
  _uiId: string;
  branchProductId: string;
  productId: string;
  quantity: number;
  maxStock: number;
  sku?: string;
  name?: string;
}

interface CreateTransferPanelProps {
  originBranchId: string;
  branches: IBranch[];
  branchProducts: IBranchProduct[];
  onClose: () => void;
}

/* -------------------------
  Component
------------------------- */

export function CreateTransferPanel({ 
  originBranchId,
  branches = [], 
  branchProducts = [], 
  onClose
}: CreateTransferPanelProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();

  // Form State
  const [toBranchId, setToBranchId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ITransferItem[]>([
    { 
      _uiId: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36), 
      branchProductId: "", 
      productId: "", 
      quantity: 1, 
      maxStock: 0 
    }
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter out the current branch from destination options
  const destinationBranches = useMemo(() => 
    branches.filter(b => b.id !== originBranchId), 
  [branches, originBranchId]);

  const totalUnits = useMemo(() => 
    items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0), 
  [items]);

  const addItem = useCallback(() => {
    setItems(prev => [...prev, { 
      _uiId: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36), 
      branchProductId: "", 
      productId: "", 
      quantity: 1, 
      maxStock: 0 
    }]);
  }, []);

  const removeItem = (uiId: string) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter(it => it._uiId !== uiId));
  };

  const updateItem = (index: number, field: keyof ITransferItem, value: any) => {
    setItems(prev => {
      const next = [...prev];
      const target = { ...next[index] };

      if (field === "branchProductId") {
        const bp = branchProducts.find(p => p.id === value);
        target.branchProductId = value;
        target.productId = bp?.product.id || "";
        target.sku = bp?.product.sku;
        target.name = bp?.product.name;
        target.maxStock = bp?.stock || 0;
        // Default to 1 if stock is available, else 0
        target.quantity = bp?.stock && bp.stock > 0 ? 1 : 0;
      } else if (field === "quantity") {
        // Constrain quantity between 1 and available stock
        const val = Math.max(1, Math.min(target.maxStock, Number(value) || 0));
        target.quantity = val;
      } else {
        (target as any)[field] = value;
      }

      next[index] = target;
      return next;
    });
  };

  const setMaxQuantity = (index: number) => {
    updateItem(index, "quantity", items[index].maxStock);
  };

  /**
   * DIRECT API INTEGRATION
   * Communicates with POST /api/transfers
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!toBranchId) {
      dispatch?.({ 
        kind: "TOAST", 
        type: "WARNING", 
        title: "Target Missing", 
        message: "A destination node is required for stock synchronization." 
      });
      return;
    }

    const invalidItems = items.filter(it => !it.branchProductId || it.quantity <= 0);
    if (invalidItems.length > 0) {
      dispatch?.({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Integrity Violation", 
        message: "All items must have a valid selection and a quantity of at least 1." 
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Endpoint updated to match the production route provided
      const response = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toBranchId,
          notes: notes.trim() || undefined,
          items: items.map(({ branchProductId, productId, quantity }) => ({
            branchProductId,
            productId,
            quantity: Math.floor(Number(quantity))
          }))
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        // Handle flattened Zod errors if they exist, otherwise use the message
        const errorMessage = result.error?.fieldErrors 
          ? "Validation failed. Please check item quantities."
          : (result.error || "The transfer protocol could not be initialized.");
        throw new Error(errorMessage);
      }

      dispatch?.({ 
        kind: "TOAST", 
        type: "SUCCESS", 
        title: "Transfer Initialized", 
        message: `Stock movement ${result.transferNumber} committed successfully.` 
      });
      
      onClose();
    } catch (err: any) {
      dispatch?.({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Sync Failure", 
        message: err.message || "An unexpected error occurred during commit." 
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
          <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-lg shadow-indigo-500/20">
            <ArrowRightLeft className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">
              Transfer Protocol
            </h2>
            <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              Origin: {branches.find(b => b.id === originBranchId)?.name || "Current Node"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleFullScreen} className="p-2 text-slate-400 hover:text-indigo-500 rounded-lg transition-colors">
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>
      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <form id="transfer-form" onSubmit={handleSubmit} className="space-y-6">
<div className={`
  grid gap-4 mb-6 p-4 rounded-2xl 
  bg-slate-50/50 dark:bg-slate-800/30 
  border border-slate-200 dark:border-slate-800
  ${isFullScreen ? "grid-cols-2" : "grid-cols-1"}
`}>
  {/* Destination Node */}
  <div className="space-y-2">
    <div className="flex items-center gap-2 ml-1">
      <div className="w-1 h-3 bg-indigo-500 rounded-full" />
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
        Destination Node
      </label>
    </div>
    <div className="relative group">
      <select 
        value={toBranchId} 
        onChange={(e) => setToBranchId(e.target.value)} 
        required 
        disabled={isSubmitting}
        className="w-full pl-4 pr-10 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm shadow-sm transition-all focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none appearance-none cursor-pointer disabled:cursor-not-allowed"
      >
        <option value="">Select target branch...</option>
        {destinationBranches.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
      {/* Custom Chevron for better UI */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  </div>

  {/* Logistics Reference */}
  <div className="space-y-2">
    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
      Logistics Reference
    </label>
    <div className="relative overflow-hidden group">
      <div className="w-full px-4 py-3 bg-slate-100/50 dark:bg-slate-900/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex items-center gap-3">
        <div className="flex-shrink-0 w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 animate-pulse" />
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter italic">
          Pending System Authorization
        </span>
      </div>
      {/* Subtle background glow for the active input next to it */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-200/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
    </div>
  </div>
</div>

          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="text-[11px] font-bold text-slate-800 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <Boxes className="w-3.5 h-3.5" /> Asset Manifest
              </h3>
              <button 
                type="button" 
                onClick={addItem} 
                disabled={isSubmitting} 
                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 hover:underline disabled:opacity-50"
              >
                <Plus className="w-3 h-3" /> Append SKU
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
                      : 'border-amber-200 bg-amber-50/30 dark:border-amber-900/20'
                  }`}
                >
                  <div className={`${isFullScreen ? "flex-1 min-w-0" : "w-full"}`}>
                    <label className="block text-[10px] uppercase mb-1.5 font-bold text-slate-400">Product Identification</label>
                    <select 
                      value={item.branchProductId} 
                      onChange={(e) => updateItem(idx, "branchProductId", e.target.value)} 
                      required 
                      disabled={isSubmitting}
                      className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2 bg-white dark:bg-slate-950 truncate outline-none focus:border-indigo-500 transition-colors"
                    >
                      <option value="">Select Asset from Source...</option>
                      {branchProducts.map((p) => (
                        <option key={p.id} value={p.id} disabled={p.stock <= 0}>
                          [{p.product.sku}] {p.product.name} (Available: {p.stock})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={`flex items-end gap-3 ${isFullScreen ? "shrink-0" : "w-full"}`}>
                    <div className={isFullScreen ? "w-32" : "flex-1"}>
                      <label className="block text-[10px] uppercase mb-1.5 font-bold text-slate-400">Transit Qty</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          min="1" 
                          max={item.maxStock}
                          value={item.quantity} 
                          onChange={(e) => updateItem(idx, "quantity", e.target.value)} 
                          required 
                          disabled={isSubmitting || !item.branchProductId} 
                          className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2 bg-white dark:bg-slate-950 pr-12 font-mono font-bold outline-none focus:border-indigo-500 transition-colors" 
                        />
                        <button 
                          type="button"
                          onClick={() => setMaxQuantity(idx)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-indigo-500 hover:text-indigo-600 uppercase"
                        >
                          Max
                        </button>
                      </div>
                    </div>

                    <div className={isFullScreen ? "w-24" : "flex-1"}>
                      <label className="block text-[10px] uppercase mb-1.5 font-bold text-slate-400">Local Bal</label>
                      <div className="h-[38px] flex items-center px-3 bg-slate-200/50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-500">
                        {item.branchProductId ? item.maxStock : "---"}
                      </div>
                    </div>

                    <button 
                      type="button" 
                      onClick={() => removeItem(item._uiId)} 
                      disabled={items.length === 1 || isSubmitting} 
                      className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-0 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-indigo-50 dark:bg-indigo-900/20 px-5 py-4 border border-indigo-100 dark:border-indigo-900/30 rounded-xl flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-600" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">Aggregated Units in Transit</span>
              </div>
              <span className="text-xl font-mono font-black text-indigo-700 dark:text-indigo-400">
                {totalUnits.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Transfer Notes / Instruction</label>
            <textarea 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)} 
              rows={3} 
              disabled={isSubmitting} 
              placeholder="Enter handling requirements or audit context..." 
              className="w-full border border-slate-300 dark:border-slate-700 rounded-xl text-sm p-3.5 bg-white dark:bg-slate-950 resize-none outline-none focus:border-indigo-500 transition-all placeholder:text-slate-500" 
            />
          </div>
        </form>
      </div>

      {/* Control Footer */}
      <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end items-center gap-3 shrink-0">
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
          form="transfer-form" 
          disabled={isSubmitting} 
          className="h-10 px-8 bg-indigo-600 text-white text-[11px] font-bold uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 active:scale-95 disabled:opacity-50 disabled:grayscale"
        >
          {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Execute Sync
        </button>
      </div>
    </div>
  );
}