"use client";

import React, { useState, useMemo } from "react";
import {
  X,
  Maximize2,
  Minimize2,
  Loader2,
  Box,
  Banknote,
  TrendingDown,
  ShieldAlert,
  Save,
  ShieldCheck,
  Lock,
  ArrowRight,
  Info,
  ShieldQuestion,
  Database,
  MessageSquare
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { usePermission } from "@/core/hooks/usePermission";
import { Resource, CriticalAction } from "@prisma/client";

/* -------------------------
Types
------------------------- */

interface InventoryEditPanelProps {
  item: {
    id: string;
    stockVersion: number; // Added: Critical for Optimistic Locking
    sellingPrice: number | null;
    reorderLevel: number;
    safetyStock: number;
    stock: number;
    hasPendingApproval?: boolean;
    product: {
      name: string;
      sku?: string;
      uom?: {
        abbreviation: string;
      };
    };
  };
  onSuccess: () => void;
  onClose: () => void;
}

/* -------------------------
Sub-Component: Comparison Field
------------------------- */

interface ComparisonFieldProps {
  id: string;
  label: string;
  icon: React.ElementType;
  oldValue: string | number;
  isModified: boolean;
  children: React.ReactNode;
  unit?: string;
}

function ComparisonField({ 
  id, 
  label, 
  icon: Icon, 
  oldValue, 
  isModified, 
  children, 
  unit 
}: ComparisonFieldProps) {
  return (
    <div className={`p-3 rounded-lg border transition-colors ${
      isModified 
        ? "border-indigo-200 bg-indigo-50/30 dark:border-indigo-800/50 dark:bg-indigo-900/10" 
        : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    }`}>
      <div className="flex items-center justify-between mb-2">
        <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <Icon className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          {label}
        </label>
        {isModified && (
          <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400">
            Modified
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-50 dark:bg-slate-800/50 px-2 py-1.5 rounded border border-slate-100 dark:border-slate-800 flex flex-col justify-center">
          <span className="text-[10px] text-slate-400 uppercase font-medium">Current</span>
          <span className="text-xs font-bold text-black dark:text-white truncate">
            {oldValue} <span className="text-[10px] opacity-70">{unit}</span>
          </span>
        </div>

        <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" aria-hidden="true" />

        <div className="flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}

/* -------------------------
Main Component
------------------------- */

export function InventoryEditPanel({
  item,
  onSuccess,
  onClose
}: InventoryEditPanelProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  const { canEdit, checkCritical } = usePermission();
  const [submitting, setSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    sellingPrice: item.sellingPrice || 0,
    reorderLevel: item.reorderLevel || 0,
    safetyStock: item.safetyStock || 0,
    reason: "" // Added: Required for commercial changes
  });

  const isLocked = !!item.hasPendingApproval;
  const hasEditPermission = canEdit(Resource.STOCK);

  const mods = useMemo(() => ({
    price: Number(formData.sellingPrice) !== Number(item.sellingPrice || 0),
    reorder: Number(formData.reorderLevel) !== Number(item.reorderLevel || 0),
    safety: Number(formData.safetyStock) !== Number(item.safetyStock || 0)
  }), [formData, item]);

  // Determine if a reason is required based on the API's fortress rules
  const isReasonRequired = mods.price;

  const priceApprovalState = useMemo(() => {
    if (!mods.price) return { requiresApproval: false };
    return checkCritical(CriticalAction.PRICE_UPDATE);
  }, [mods.price, checkCritical]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasEditPermission || isLocked) return;

    if (isReasonRequired && !formData.reason.trim()) {
      dispatch?.({ 
        kind: "TOAST", 
        type: "WARNING", 
        title: "Reason Required", 
        message: "A forensic reason is mandatory for commercial price adjustments." 
      });
      return;
    }
    
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/fortress?id=${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellingPrice: formData.sellingPrice,
          reorderLevel: formData.reorderLevel,
          safetyStock: formData.safetyStock,
          reason: formData.reason,
          expectedVersion: item.stockVersion // Optimistic Lock Enforcement
        }),
      });

      const result = await res.json();
      
      // Handle Concurrency Conflicts (409) specifically
      if (res.status === 409) {
        throw new Error("This record was updated by another user. Please refresh.");
      }

      if (!res.ok) throw new Error(result.error || "Update Failed");

      dispatch?.({
        kind: "TOAST",
        type: result.approvalPending ? "WARNING" : "SUCCESS",
        title: result.approvalPending ? "Approval Required" : "Update Successful",
        message: result.message,
      });

      onSuccess();
    } catch (err: any) {
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "Error", message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasEditPermission) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-white dark:bg-slate-950">
        <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center text-red-600 mb-4">
          <ShieldQuestion className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Access Denied</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">Required permissions for Resource: STOCK are missing.</p>
        <button onClick={onClose} className="mt-4 text-xs font-medium text-indigo-600 hover:underline">Dismiss</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-950">
      <header className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-950">
        <div>
          <h2 className="text-[13px] font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Edit Inventory Details
          </h2>
          <p className="text-[11px] font-mono text-slate-500 mt-0.5">Ref: {item.id}</p>
        </div>
        <div className="flex items-center gap-0.5">
          <button 
            onClick={toggleFullScreen} 
            className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-md text-slate-400 hover:text-red-500 dark:hover:bg-red-900/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLocked && (
          <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/50 rounded-lg p-3 flex gap-3">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-amber-800 dark:text-amber-400">Adjustment Locked</h4>
              <p className="text-[11px] text-amber-700 dark:text-amber-500 leading-relaxed">
                A pending approval process exists. This record is read-only until resolved.
              </p>
            </div>
          </div>
        )}

        {/* Product Card */}
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-indigo-500 shrink-0">
            <Box className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
              {item.product.name}
            </h3>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 font-medium">
              <span className="text-indigo-600 dark:text-indigo-400">{item.stock} {item.product.uom?.abbreviation || "UNITS"}</span>
              <span className="opacity-30">•</span>
              <span>SKU: {item.product.sku || 'N/A'}</span>
            </div>
          </div>
        </div>

        <form 
          id="inventory-edit-form" 
          onSubmit={handleSubmit} 
          className={`space-y-4 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <div className="flex items-center justify-between px-1">
            <h4 className="text-[11px] uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1.5">
              <Database className="w-3 h-3" /> 
              Parameters
            </h4>
            {mods.price && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                priceApprovalState.requiresApproval 
                  ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' 
                  : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'
              }`}>
                {priceApprovalState.requiresApproval ? "Needs Approval" : "Authorized"}
              </span>
            )}
          </div>

          <div className="space-y-3">
            <ComparisonField 
              id="field-selling-price"
              label="Selling Price" 
              icon={Banknote} 
              oldValue={`₦${Number(item.sellingPrice || 0).toLocaleString()}`}
              isModified={mods.price}
            >
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-black dark:text-white font-bold">₦</span>
                <input
                  type="number" 
                  step="0.01"
                  value={formData.sellingPrice}
                  onChange={(e) => setFormData({ ...formData, sellingPrice: Number(e.target.value) })}
                  className="block w-full pl-5 pr-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-black dark:text-white font-bold"
                  disabled={isLocked}
                />
              </div>
            </ComparisonField>

            <div className={`grid gap-3 ${isFullScreen ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <ComparisonField 
                id="field-reorder-level"
                label="Reorder Level" 
                icon={TrendingDown} 
                oldValue={item.reorderLevel}
                isModified={mods.reorder}
                unit={item.product.uom?.abbreviation}
              >
                <input
                  type="number"
                  value={formData.reorderLevel}
                  onChange={(e) => setFormData({ ...formData, reorderLevel: Number(e.target.value) })}
                  className="block w-full px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-black dark:text-white font-bold"
                  disabled={isLocked}
                />
              </ComparisonField>

              <ComparisonField 
                id="field-safety-stock"
                label="Safety Stock" 
                icon={ShieldAlert} 
                oldValue={item.safetyStock}
                isModified={mods.safety}
                unit={item.product.uom?.abbreviation}
              >
                <input
                  type="number"
                  value={formData.safetyStock}
                  onChange={(e) => setFormData({ ...formData, safetyStock: Number(e.target.value) })}
                  className="block w-full px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-black dark:text-white font-bold"
                  disabled={isLocked}
                />
              </ComparisonField>
            </div>

            {/* Audit Reason Field - Only visible when commercial logic is triggered */}
            {isReasonRequired && (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase px-1">
                  <MessageSquare className="w-3 h-3" />
                  Audit Reason (Mandatory)
                </label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Explain why the selling price is being adjusted..."
                  className="block w-full px-3 py-2 bg-white dark:bg-slate-950 border border-indigo-200 dark:border-indigo-900/50 rounded text-xs focus:ring-1 focus:ring-indigo-500 outline-none min-h-[60px] resize-none text-black dark:text-white font-bold"
                  required
                />
              </div>
            )}
          </div>
          
          <div className="p-3 bg-blue-50/30 dark:bg-blue-900/10 rounded flex gap-2 border border-blue-100/50 dark:border-blue-900/30">
            <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <p className="text-[11px] text-blue-700 dark:text-blue-400 italic leading-snug">
              Changes are logged to the audit trail. Sensitive adjustments may trigger workflow authorization.
            </p>
          </div>
        </form>
      </div>

      <footer className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors"
        >
          Cancel
        </button>

        <button
          form="inventory-edit-form"
          type="submit"
          disabled={submitting || isLocked}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold transition-all shadow-sm ${
            isLocked 
              ? "bg-slate-200 text-slate-400 dark:bg-slate-800 cursor-not-allowed" 
              : mods.price && priceApprovalState.requiresApproval
                ? "bg-amber-600 text-white hover:bg-amber-700" 
                : "bg-indigo-600 text-white hover:bg-indigo-700"
          }`}
        >
          {submitting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : isLocked ? (
            <><Lock className="w-3 h-3" /> Locked</>
          ) : (
            <>
              {mods.price && priceApprovalState.requiresApproval ? <ShieldCheck className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {mods.price && priceApprovalState.requiresApproval ? "Request Approval" : "Save Changes"}
            </>
          )}
        </button>
      </footer>
    </div>
  );
}