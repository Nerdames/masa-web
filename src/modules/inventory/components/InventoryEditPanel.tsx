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
  Clock,
  Lock,
  AlertCircle,
  ArrowRightLeft,
  Info,
  ShieldQuestion,
  Database
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
  label: string;
  icon: React.ElementType;
  oldValue: string | number;
  newValue: string | number;
  isModified: boolean;
  children: React.ReactNode;
  unit?: string;
}

function ComparisonField({ label, icon: Icon, oldValue, newValue, isModified, children, unit }: ComparisonFieldProps) {
  return (
    <div className={`group relative p-4 rounded-2xl border-2 transition-all duration-300 ${
      isModified 
        ? "border-indigo-500/30 bg-indigo-50/30 dark:bg-indigo-500/5 shadow-lg shadow-indigo-500/5" 
        : "border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50"
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg transition-colors ${isModified ? 'bg-indigo-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            {label}
          </span>
        </div>
        {isModified && (
          <span className="text-[9px] font-bold text-indigo-500 animate-pulse uppercase tracking-tighter">
            Pending Update
          </span>
        )}
      </div>

      <div className="grid grid-cols-7 items-center gap-2">
        {/* Old Value */}
        <div className="col-span-3">
          <label className="text-[8px] font-bold text-slate-400 uppercase block mb-1">Current</label>
          <div className="text-xs font-mono font-bold text-slate-400 line-through decoration-slate-300/50">
            {oldValue} {unit}
          </div>
        </div>

        {/* Separator */}
        <div className="col-span-1 flex justify-center">
          <ArrowRightLeft className={`w-3 h-3 ${isModified ? 'text-indigo-500' : 'text-slate-200 dark:text-slate-700'}`} />
        </div>

        {/* Input Wrapper */}
        <div className="col-span-3">
          <label className={`text-[8px] font-bold uppercase block mb-1 ${isModified ? 'text-indigo-500' : 'text-slate-400'}`}>Target</label>
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
    safetyStock: item.safetyStock || 0
  });

  const isLocked = !!item.hasPendingApproval;
  const hasEditPermission = canEdit(Resource.STOCK);

  const mods = useMemo(() => ({
    price: Number(formData.sellingPrice) !== Number(item.sellingPrice || 0),
    reorder: Number(formData.reorderLevel) !== Number(item.reorderLevel || 0),
    safety: Number(formData.safetyStock) !== Number(item.safetyStock || 0)
  }), [formData, item]);

  const priceApprovalState = useMemo(() => {
    if (!mods.price) return { requiresApproval: false };
    return checkCritical(CriticalAction.PRICE_UPDATE);
  }, [mods.price, checkCritical]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasEditPermission || isLocked) return;
    
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/fortress?id=${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "SOP Update Rejected");

      dispatch?.({
        kind: "TOAST",
        type: result.approvalPending ? "WARNING" : "SUCCESS",
        title: result.approvalPending ? "Approval Dispatched" : "Audit Synchronized",
        message: result.message,
      });

      onSuccess();
    } catch (err: any) {
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "Policy Violation", message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasEditPermission) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 text-center space-y-4">
        <div className="w-16 h-16 bg-red-50 dark:bg-red-900/10 rounded-full flex items-center justify-center text-red-600">
          <ShieldQuestion className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white">Security Block</h3>
          <p className="text-[10px] text-slate-500 max-w-[200px] leading-relaxed uppercase">
            You lack <span className="text-red-500 font-mono">STOCK_UPDATE</span> privileges for this resource.
          </p>
        </div>
        <button onClick={onClose} className="px-8 py-2.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-[9px] font-black uppercase tracking-widest">Return</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-950 shadow-2xl relative overflow-hidden">
      {/* Header Section */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-900 flex justify-between items-center bg-white/80 dark:bg-slate-950/80 backdrop-blur-md z-40">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-[0.25em]">
              Fortress Intelligence
            </h2>
          </div>
          <p className="text-[9px] text-slate-400 dark:text-slate-500 font-mono tracking-tighter uppercase">
            SEC_LOG: {item.id.toUpperCase()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleFullScreen} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* SOP Critical Status Banner */}
        {isLocked ? (
          <div className="bg-amber-500/10 border-2 border-amber-500/20 rounded-3xl p-5 flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-lg shadow-amber-500/20">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">Resource Immutable</h4>
              <p className="text-[10px] text-amber-700 dark:text-amber-500/80 mt-1 leading-relaxed">
                A pending approval process exists for this entity. All adjustments are locked to prevent synchronization conflicts until management authorization is complete.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/20">
              <Box className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">Active Target</span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate uppercase tracking-tight">
                {item.product.name}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                  {item.stock} {item.product.uom?.abbreviation || "UNITS"} Physical
                </span>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <span className="text-[9px] font-mono text-slate-400 uppercase">{item.product.sku || 'No SKU'}</span>
              </div>
            </div>
          </div>
        )}

        <form id="fortress-adjustment-form" onSubmit={handleSubmit} className={`space-y-4 ${isLocked ? 'pointer-events-none opacity-40' : ''}`}>
          <div className="flex items-center justify-between px-1">
            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Database className="w-3 h-3" /> Policy Parameters
            </h4>
            {mods.price && (
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[8px] font-black uppercase ${priceApprovalState.requiresApproval ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                <Clock className="w-3 h-3" />
                {priceApprovalState.requiresApproval ? "Elevated Approval Required" : "Auto-Authorized"}
              </div>
            )}
          </div>

          <div className="grid gap-4">
            {/* Field: Selling Price */}
            <ComparisonField 
              label="Market Rate (Selling)" 
              icon={Banknote} 
              oldValue={`₦${Number(item.sellingPrice || 0).toLocaleString()}`}
              newValue={`₦${Number(formData.sellingPrice).toLocaleString()}`}
              isModified={mods.price}
            >
              <input
                type="number" step="0.01"
                value={formData.sellingPrice}
                onChange={(e) => setFormData({ ...formData, sellingPrice: Number(e.target.value) })}
                className="w-full bg-transparent border-b-2 border-slate-200 dark:border-slate-700 focus:border-indigo-500 py-1 text-xs font-black text-slate-900 dark:text-white outline-none transition-colors"
              />
            </ComparisonField>

            <div className={`grid gap-4 ${isFullScreen ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
              {/* Field: Reorder Level */}
              <ComparisonField 
                label="Reorder Threshold" 
                icon={TrendingDown} 
                oldValue={item.reorderLevel}
                newValue={formData.reorderLevel}
                isModified={mods.reorder}
                unit={item.product.uom?.abbreviation}
              >
                <input
                  type="number"
                  value={formData.reorderLevel}
                  onChange={(e) => setFormData({ ...formData, reorderLevel: Number(e.target.value) })}
                  className="w-full bg-transparent border-b-2 border-slate-200 dark:border-slate-700 focus:border-indigo-500 py-1 text-xs font-black text-slate-900 dark:text-white outline-none transition-colors"
                />
              </ComparisonField>

              {/* Field: Safety Stock */}
              <ComparisonField 
                label="Safety Buffer" 
                icon={ShieldAlert} 
                oldValue={item.safetyStock}
                newValue={formData.safetyStock}
                isModified={mods.safety}
                unit={item.product.uom?.abbreviation}
              >
                <input
                  type="number"
                  value={formData.safetyStock}
                  onChange={(e) => setFormData({ ...formData, safetyStock: Number(e.target.value) })}
                  className="w-full bg-transparent border-b-2 border-slate-200 dark:border-slate-700 focus:border-red-500 py-1 text-xs font-black text-slate-900 dark:text-white outline-none transition-colors"
                />
              </ComparisonField>
            </div>
          </div>
          
          <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl flex gap-3 items-start">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-relaxed uppercase font-bold">
              Verification Mode: Please ensure target values are correct. Adjustments are logged with your user signature and Trace ID for the audit trail.
            </p>
          </div>
        </form>
      </div>

      {/* Action Footer */}
      <div className="p-6 border-t border-slate-100 dark:border-slate-900 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md flex justify-between gap-4">
        <button
          onClick={onClose}
          className="px-6 py-3.5 text-slate-500 hover:text-slate-900 dark:hover:text-white text-[10px] font-black uppercase tracking-widest transition-all"
        >
          Discard
        </button>

        <button
          form="fortress-adjustment-form"
          type="submit"
          disabled={submitting || isLocked}
          className={`flex-1 py-3.5 rounded-xl text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 ${
            isLocked 
              ? "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed shadow-none" 
              : mods.price && priceApprovalState.requiresApproval
                ? "bg-amber-600 hover:bg-amber-500 shadow-amber-500/20" 
                : "bg-slate-900 dark:bg-white dark:text-black hover:opacity-90 shadow-slate-900/20"
          }`}
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isLocked ? (
            <>
              <Lock className="w-3.5 h-3.5" />
              Locked by SOP
            </>
          ) : (
            <>
              {mods.price && priceApprovalState.requiresApproval ? <ShieldCheck className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {mods.price && priceApprovalState.requiresApproval ? "Submit for Approval" : "Commit Changes"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}