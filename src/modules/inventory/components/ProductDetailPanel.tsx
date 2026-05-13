"use client";

import React, { useMemo } from "react";
import {
  X, Maximize2, Minimize2, Trash2, Tag, 
  Barcode, Info, DollarSign, Layers, 
  Weight, Calendar, Building2, Hash,
  User, History, ShieldCheck
} from "lucide-react";

// Contexts & Hooks
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { usePermission } from "@/core/hooks/usePermission";
import { PermissionAction, Resource } from "@prisma/client";

/* -------------------------
Types (Aligned with API V3.1)
------------------------- */
interface IAuditActor {
  name: string | null;
}

interface ICategory {
  name: string;
}

interface IUom {
  name: string;
  abbreviation: string;
}

interface IProduct {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  description?: string | null;
  baseCostPrice: number | string;
  costPrice: number | string;
  currency: string;
  category?: ICategory | null;
  uom?: IUom | null;
  organizationId: string;
  // New Forensic Audit Fields
  createdBy?: IAuditActor | null;
  updatedBy?: IAuditActor | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface ProductDetailPanelProps {
  product: IProduct;
  onClose: () => void;
  onRefresh: () => void;
}

/**
 * PRODUCT FORENSIC VIEW
 * Enterprise-grade read-only panel focused on Master Data integrity 
 * and Audit Trail visibility.
 */
export default function ProductDetailPanel({ product, onClose, onRefresh }: ProductDetailPanelProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  const { can } = usePermission();

  const canDelete = can(PermissionAction.DELETE, Resource.PRODUCT);

  const currencySymbol = useMemo(() => 
    product.currency === "NGN" ? "₦" : `${product.currency} `, 
  [product.currency]);

  const formattedBaseCost = useMemo(() => 
    Number(product.baseCostPrice).toLocaleString(undefined, { minimumFractionDigits: 2 }), 
  [product.baseCostPrice]);

  const formattedCostPrice = useMemo(() => 
    Number(product.costPrice).toLocaleString(undefined, { minimumFractionDigits: 2 }), 
  [product.costPrice]);

  const handleDelete = async () => {
    if (!canDelete) return;
    const confirmed = window.confirm(`DANGER: Are you sure you want to decommission ${product.sku}? This will be logged in the forensic audit.`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/products?id=${product.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deletion failed.");

      dispatch?.({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Record Archived",
        message: `${product.sku} has been decommissioned successfully.`
      });

      onRefresh();
      onClose();
    } catch (err: any) {
      dispatch?.({
        kind: "TOAST",
        type: "ERROR",
        title: "Archive Failed",
        message: err.message
      });
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-xl overflow-hidden" role="dialog">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200/60 dark:border-slate-800 flex justify-between items-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate uppercase tracking-tight">
              {product.name}
            </h2>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 uppercase font-bold tracking-widest">
            Verified Master Record
          </p>
        </div>
        <div className="flex items-center gap-1 ml-4">
          <button onClick={toggleFullScreen} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-4 space-y-6">
          
          {/* Identity Section */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                <Tag className="w-3 h-3" /> Canonical Name
              </label>
              <p className="text-base font-bold text-slate-900 dark:text-slate-100">{product.name}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Hash className="w-3 h-3" /> SKU Identifier
              </label>
              <p className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 uppercase">
                {product.sku}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Barcode className="w-3 h-3" /> Global Barcode
              </label>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 p-2">
                {product.barcode || "NO BARCODE REGISTERED"}
              </p>
            </div>
          </section>

          {/* Financials & Categorization */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50/30 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20">
              <label className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-3 block flex items-center gap-1.5">
                <DollarSign className="w-3 h-3" /> Financial Valuation
              </label>
              <div className="space-y-4">
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-bold block">Procurement Cost (Base)</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {currencySymbol}{formattedBaseCost}
                  </p>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-bold block">Current Landed Cost</span>
                  <p className="text-sm font-bold text-slate-600 dark:text-emerald-500">
                    {currencySymbol}{formattedCostPrice}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 block flex items-center gap-1.5">
                <Layers className="w-3 h-3" /> Classification
              </label>
              <div className="space-y-4">
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-bold block">Category</span>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {product.category?.name || "UNCATEGORIZED"}
                  </p>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-bold block">Standard Unit (UoM)</span>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {product.uom?.name} ({product.uom?.abbreviation})
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Forensic Audit Section */}
          <section className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 space-y-4">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Chain of Custody
            </label>
            
            <div className="grid grid-cols-2 gap-y-4">
              <div className="space-y-1">
                <span className="text-[9px] text-slate-400 uppercase font-bold flex items-center gap-1">
                  <User className="w-2.5 h-2.5" /> Created By
                </span>
                <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  {product.createdBy?.name || "System Process"}
                </p>
                <p className="text-[9px] text-slate-500">
                  {new Date(product.createdAt).toLocaleString()}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] text-slate-400 uppercase font-bold flex items-center gap-1">
                  <User className="w-2.5 h-2.5" /> Last Modified By
                </span>
                <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  {product.updatedBy?.name || "No Modifications"}
                </p>
                <p className="text-[9px] text-slate-500">
                  {new Date(product.updatedAt).toLocaleString()}
                </p>
              </div>

              <div className="col-span-2 pt-2 border-t border-slate-200/50 dark:border-slate-800/50">
                <span className="text-[9px] text-slate-400 uppercase font-bold flex items-center gap-1">
                  <Building2 className="w-2.5 h-2.5" /> Organizational Authority
                </span>
                <p className="text-[11px] font-mono text-slate-500 mt-1 uppercase tracking-tighter">
                  ORG_ID: {product.organizationId}
                </p>
              </div>
            </div>
          </section>

          {/* Description */}
          <section className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Info className="w-3 h-3" /> Catalog Notes
            </label>
            <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg min-h-[60px]">
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic">
                {product.description || "No extended description is associated with this record."}
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center">
        <div className="flex items-center gap-2 text-slate-400">
          <ShieldCheck className="w-3 h-3" />
          <span className="text-[9px] font-bold uppercase tracking-widest">Audit Locked</span>
        </div>

        <div className="flex gap-3">
          {canDelete && (
            <button 
              onClick={handleDelete}
              className="px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider border border-transparent hover:border-red-200"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Archive Record
            </button>
          )}
          
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-slate-200 transition-all"
          >
            Close View
          </button>
        </div>
      </div>
    </div>
  );
}