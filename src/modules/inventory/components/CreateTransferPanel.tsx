"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  X, Maximize2, Minimize2, Save, Loader2,
  Plus, ArrowRightLeft, ShieldAlert, Trash2, Database
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { usePermission } from "@/core/hooks/usePermission";
import { PermissionAction, Resource } from "@prisma/client";

/* -------------------------------------------------------------------------- */
/* TYPES & INTERFACES                                                         */
/* -------------------------------------------------------------------------- */

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
  onSuccess?: () => void;
}

/* -------------------------------------------------------------------------- */
/* CONSTANTS & STYLES (Aligned with RegisterProductPanel)                     */
/* -------------------------------------------------------------------------- */

const inputClass = `
  w-full border border-slate-200 dark:border-slate-700 rounded-md text-xs p-2 
  bg-white dark:bg-slate-950 text-slate-900 dark:text-white 
  focus:ring-1 focus:ring-indigo-500 outline-none transition-all 
  placeholder:text-slate-400 disabled:opacity-50 disabled:bg-slate-50
`;

const labelClass = "block text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1";

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export function CreateTransferPanel({
  originBranchId,
  branches = [],
  branchProducts = [],
  onClose,
  onSuccess
}: CreateTransferPanelProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  const { can } = usePermission();

  // Permission Logic
  const canSave = can(PermissionAction.CREATE, Resource.STOCK);

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
    [branches, originBranchId]
  );

  const totalUnits = useMemo(() =>
    items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
    [items]
  );

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
        target.quantity = bp?.stock && bp.stock > 0 ? 1 : 0;
      } else if (field === "quantity") {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Access Denied", message: "Insufficient permissions." });
      return;
    }
    if (isSubmitting) return;

    if (!toBranchId) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Target Missing", message: "A destination node is required." });
      return;
    }

    const invalidItems = items.filter(it => !it.branchProductId || it.quantity <= 0);
    if (invalidItems.length > 0) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Integrity Violation", message: "All items must have a valid selection and a quantity of at least 1." });
      return;
    }

    setIsSubmitting(true);

    try {
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
        const errorMessage = typeof result.error === 'object'
          ? "Validation failed. Please check item quantities."
          : (result.error || "The transfer protocol could not be initialized.");
        throw new Error(errorMessage);
      }

      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Transfer Initialized",
        message: `Stock movement ${result.transferNumber || "dispatched"} committed successfully.`
      });

      onSuccess?.();
      onClose();
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Sync Failure", message: err.message || "An unexpected error occurred." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-2xl relative overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
            <ArrowRightLeft className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Transfer Protocol
            </h2>
            <p className="text-[8px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              Origin: {branches.find(b => b.id === originBranchId)?.name || "Current Node"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={toggleFullScreen} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {!canSave && (
          <div className="mb-4 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-[9px] font-medium text-amber-800 dark:text-amber-400">
              <span className="font-bold uppercase">View Only:</span> Insufficient permissions to initiate transfers.
            </p>
          </div>
        )}

        <form id="transfer-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Logistics Routing */}
          <section className="space-y-3">
            <h3 className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1">
              Logistics Routing
            </h3>

            <div className={`grid gap-3 ${isFullScreen ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
              <div className="space-y-1">
                <label className={labelClass}>Destination Node *</label>
                <select 
                  disabled={!canSave || isSubmitting} 
                  value={toBranchId} 
                  onChange={e => setToBranchId(e.target.value)} 
                  required 
                  className={inputClass}
                >
                  <option value="">Select target branch...</option>
                  {destinationBranches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Internal Notes</label>
                <input 
                  disabled={!canSave || isSubmitting} 
                  type="text" 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)} 
                  className={inputClass} 
                  placeholder="Optional routing instructions..." 
                />
              </div>
            </div>
          </section>

          {/* Section 2: Asset Manifest */}
          <section className="space-y-3">
            <div className="flex justify-between items-end border-b border-slate-100 dark:border-slate-800 pb-1">
              <h3 className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Asset Manifest
              </h3>
              {canSave && (
                <button 
                  type="button" 
                  onClick={addItem} 
                  disabled={isSubmitting}
                  className="text-[8px] text-indigo-600 dark:text-indigo-400 font-bold uppercase flex items-center gap-0.5 hover:underline disabled:opacity-50"
                >
                  <Plus className="w-2.5 h-2.5"/> Append SKU
                </button>
              )}
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div 
                  key={item._uiId} 
                  className={`p-3 rounded-md border transition-all ${
                    isFullScreen ? "flex flex-row items-end gap-3" : "flex flex-col gap-3"
                  } ${
                    item.branchProductId 
                      ? 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20' 
                      : 'border-amber-200 bg-amber-50/30 dark:border-amber-900/20'
                  }`}
                >
                  {/* Product Selection */}
                  <div className={isFullScreen ? "flex-1 min-w-0" : "w-full space-y-1"}>
                    <label className={labelClass}>Product / SKU *</label>
                    <select 
                      value={item.branchProductId} 
                      onChange={(e) => updateItem(idx, "branchProductId", e.target.value)} 
                      required 
                      disabled={!canSave || isSubmitting}
                      className={inputClass}
                    >
                      <option value="">Select Asset from Source...</option>
                      {branchProducts.map((p) => (
                        <option key={p.id} value={p.id} disabled={p.stock <= 0}>
                          [{p.product.sku}] {p.product.name} (Bal: {p.stock})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity & Actions */}
                  <div className={`flex items-end gap-2 ${isFullScreen ? "shrink-0 w-[240px]" : "w-full"}`}>
                    <div className="flex-1 space-y-1">
                      <label className={labelClass}>Transit Qty *</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          min="1" 
                          max={item.maxStock}
                          value={item.quantity} 
                          onChange={(e) => updateItem(idx, "quantity", e.target.value)} 
                          required 
                          disabled={!canSave || isSubmitting || !item.branchProductId} 
                          className={`${inputClass} font-mono font-bold pr-10`} 
                        />
                        {canSave && item.branchProductId && (
                          <button 
                            type="button"
                            onClick={() => setMaxQuantity(idx)}
                            className="absolute right-1.5 top-1.5 text-[8px] font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400 px-1 py-0.5 rounded uppercase hover:bg-indigo-100 transition-colors"
                          >
                            Max
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="w-16 space-y-1 shrink-0">
                      <label className={labelClass}>Local</label>
                      <div className={`${inputClass} bg-slate-100 dark:bg-slate-800 border-dashed text-slate-500 font-mono font-bold flex items-center justify-center h-[34px] p-0`}>
                        {item.branchProductId ? item.maxStock : "-"}
                      </div>
                    </div>

                    {canSave && (
                      <button 
                        type="button" 
                        onClick={() => removeItem(item._uiId)} 
                        disabled={items.length === 1 || isSubmitting} 
                        className="p-2 mb-[1px] text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md border border-transparent hover:border-red-100 dark:hover:border-red-900/30 transition-colors shrink-0 disabled:opacity-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Aggregation Summary */}
            <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-md flex justify-between items-center">
               <div className="flex items-center gap-1.5">
                 <Database className="w-3.5 h-3.5 text-indigo-500" />
                 <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Total Units in Transit</span>
               </div>
               <span className="text-sm font-mono font-black text-indigo-600 dark:text-indigo-400">
                 {totalUnits.toLocaleString()}
               </span>
            </div>
          </section>
        </form>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end items-center gap-2 shrink-0">
        <button 
          type="button" 
          onClick={onClose} 
          disabled={isSubmitting} 
          className="px-3 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-800 dark:hover:text-slate-300 transition-colors"
        >
          Discard
        </button>
        {canSave && (
          <button 
            type="submit" 
            form="transfer-form" 
            disabled={isSubmitting} 
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[9px] font-bold uppercase tracking-widest rounded-md hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Execute Sync
          </button>
        )}
      </div>
    </div>
  );
}