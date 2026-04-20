"use client";

import React, { useState } from "react";
import {
  X,
  Maximize2,
  Minimize2,
  Loader2,
  Box,
  Banknote,
  TrendingDown,
  ShieldAlert,
  Save
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/* -------------------------
Types
------------------------- */

interface InventoryEditPanelProps {
  item: {
    id: string;
    sellingPrice: number;
    reorderLevel: number;
    safetyStock: number;
    stock: number;
    product: {
      name: string;
      uom?: {
        abbreviation: string;
      };
    };
  };
  onSuccess: () => void;
  onClose: () => void;
}

/* -------------------------
Component
------------------------- */

export function InventoryEditPanel({
  item,
  onSuccess,
  onClose
}: InventoryEditPanelProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    sellingPrice: item.sellingPrice || 0,
    reorderLevel: item.reorderLevel || 0,
    safetyStock: item.safetyStock || 0
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/fortress?id=${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Update rejected");
      
      dispatch?.({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Audit Synchronized",
        message: `${item.product.name} settings updated.`,
      });
      onSuccess();
    } catch (err: any) {
      dispatch?.({
        kind: "TOAST",
        type: "WARNING",
        title: "Adjustment Failed",
        message: err.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-2xl relative">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-30">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black text-slate-900 dark:text-white truncate uppercase tracking-widest">
            Adjust Stock Policy
          </h2>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
            ID: {item.id}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={toggleFullScreen}
            className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            {isFullScreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-8 custom-scrollbar">
        {/* Entity Banner */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 shrink-0">
            <Box className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Selected Item</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate uppercase">
              {item.product.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                {item.stock} {item.product.uom?.abbreviation || "UNITS"} ON HAND
              </span>
            </div>
          </div>
        </div>

        <form id="edit-inventory-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-800 pb-2">
              Management Overrides
            </h4>

            {/* Selling Price */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase ml-1">
                Selling Price (₦)
              </label>
              <div className="relative group">
                <Banknote className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <input
                  type="number"
                  value={formData.sellingPrice}
                  onChange={(e) => setFormData({ ...formData, sellingPrice: Number(e.target.value) })}
                  className="w-full bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-700 rounded-xl py-3.5 pl-12 pr-4 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-all shadow-sm"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div className={`grid gap-5 ${isFullScreen ? "md:grid-cols-2" : "grid-cols-1"}`}>
              {/* Reorder Level */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase ml-1">
                  Reorder Level
                </label>
                <div className="relative group">
                  <TrendingDown className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input
                    type="number"
                    value={formData.reorderLevel}
                    onChange={(e) => setFormData({ ...formData, reorderLevel: Number(e.target.value) })}
                    className="w-full bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-700 rounded-xl py-3.5 pl-12 pr-4 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-all shadow-sm"
                    required
                  />
                </div>
              </div>

              {/* Safety Stock */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase ml-1">
                  Safety Stock
                </label>
                <div className="relative group">
                  <ShieldAlert className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-red-500 transition-colors" />
                  <input
                    type="number"
                    value={formData.safetyStock}
                    onChange={(e) => setFormData({ ...formData, safetyStock: Number(e.target.value) })}
                    className="w-full bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-700 rounded-xl py-3.5 pl-12 pr-4 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-all shadow-sm"
                    required
                  />
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-3 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all border border-transparent flex items-center justify-center"
        >
          Cancel
        </button>

        <button
          form="edit-inventory-form"
          type="submit"
          disabled={submitting}
          className="flex-[2] py-3 bg-slate-900 dark:bg-indigo-600 text-white hover:bg-slate-800 dark:hover:bg-indigo-500 text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Save className="w-4 h-4" />
              Commit Changes
            </>
          )}
        </button>
      </div>
    </div>
  );
}