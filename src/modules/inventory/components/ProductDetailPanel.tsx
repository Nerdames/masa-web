"use client";

import React, { useMemo, useState } from "react";
import {
  X, Maximize2, Minimize2, Trash2, Tag, 
  Barcode, Info, DollarSign, Layers, 
  Building2, Hash, User, History, 
  ShieldCheck, Loader2, PackageSearch,
  ShieldAlert, Banknote, Calendar
} from "lucide-react";

// Contexts & Hooks
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { usePermission } from "@/core/hooks/usePermission";
import { PermissionAction, Resource } from "@prisma/client";

/* -------------------------------------------------------------------------- */
/* TYPES & INTERFACES (Synchronized with MASA Schema)                         */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* CONSTANTS & STYLES (Matched to RegisterProductPanel)                       */
/* -------------------------------------------------------------------------- */

const labelClass = "block text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1";

const dataDisplayClass = `
  w-full border border-slate-200 dark:border-slate-800 rounded-md text-xs p-2.5
  bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100
  flex items-center gap-2 min-h-[34px]
`;

/**
 * PRODUCT FORENSIC VIEW
 * Enterprise-grade read-only panel focused on Master Data integrity 
 * and Audit Trail visibility.
 */
export default function ProductDetailPanel({ product, onClose, onRefresh }: ProductDetailPanelProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  const { can } = usePermission();
  const [isArchiving, setIsArchiving] = useState(false);

  const canDelete = can(PermissionAction.DELETE, Resource.PRODUCT);

  // Formatting Logic
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
    const confirmed = window.confirm(`CRITICAL: Are you sure you want to decommission ${product.sku}? This action will be logged in the forensic audit.`);
    if (!confirmed) return;

    setIsArchiving(true);
    try {
      const res = await fetch(`/api/products?id=${product.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deletion failed.");

      dispatch?.({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Record Archived",
        message: `${product.sku} has been decommissioned from the active registry.`
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
      setIsArchiving(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-2xl relative overflow-hidden" role="dialog">
      
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight">
              {product.name}
            </h2>
            <p className="text-[8px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">
              Verified Master Record V3.1
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleFullScreen} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        
        {/* Permission Information  */}
        {!canDelete && (
          <div className="mb-6 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-[9px] font-medium text-amber-800 dark:text-amber-400">
              <span className="font-bold uppercase">Audit Lock:</span> You have read-only access to this master record.
            </p>
          </div>
        )}

        <div className="space-y-8">
          
          {/* Section 1: Core Identity */}
          <section className="space-y-3">
            <h3 className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1">
              Core Identity
            </h3>
            <div className={`grid gap-3 ${isFullScreen ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
              <div className={`${isFullScreen ? "md:col-span-2" : ""} space-y-1`}>
                <label className={labelClass}>Canonical Name</label>
                <div className={dataDisplayClass}>
                  <Tag className="w-3 h-3 text-slate-400" />
                  <span className="font-semibold">{product.name}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className={labelClass}>SKU Identifier</label>
                <div className={`${dataDisplayClass} font-mono uppercase text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30`}>
                  <Hash className="w-3 h-3" />
                  {product.sku}
                </div>
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Global Barcode</label>
                <div className={dataDisplayClass}>
                  <Barcode className="w-3.5 h-3.5 text-slate-400" />
                  {product.barcode || "NO BARCODE REGISTERED"}
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Classification */}
          <section className="space-y-3">
            <h3 className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1">
              Classification
            </h3>
            <div className={`grid gap-3 ${isFullScreen ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
              <div className="space-y-1">
                <label className={labelClass}>Category</label>
                <div className={dataDisplayClass}>
                  <Layers className="w-3 h-3 text-slate-400" />
                  {product.category?.name || "UNCATEGORIZED"}
                </div>
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Standard Unit (UoM)</label>
                <div className={dataDisplayClass}>
                  <PackageSearch className="w-3 h-3 text-slate-400" />
                  {product.uom?.name} ({product.uom?.abbreviation})
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Financials */}
          <section className="space-y-3">
            <h3 className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1">
              Financial Master Data
            </h3>
            <div className={`grid gap-3 ${isFullScreen ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1"}`}>
              <div className="space-y-1">
                <label className={labelClass}>Currency</label>
                <div className={dataDisplayClass}>
                  <Banknote className="w-3 h-3 text-slate-400" />
                  {product.currency}
                </div>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Base Cost</label>
                <div className={`${dataDisplayClass} font-mono`}>
                  {currencySymbol}{formattedBaseCost}
                </div>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Current Landed Cost</label>
                <div className={`${dataDisplayClass} font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30`}>
                  {currencySymbol}{formattedCostPrice}
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: Forensic Audit Trail */}
          <section className="space-y-3">
            <h3 className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1 text-blue-500">
              Forensic Chain of Custody
            </h3>
            <div className={`grid gap-3 ${isFullScreen ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2">
                <div className="flex items-center gap-1.5">
                  <User className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Created By</span>
                </div>
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{product.createdBy?.name || "System Process"}</p>
                <p className="text-[9px] text-slate-500 flex items-center gap-1">
                  <Calendar className="w-2.5 h-2.5" /> {new Date(product.createdAt).toLocaleString()}
                </p>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2">
                <div className="flex items-center gap-1.5">
                  <History className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Last Modification</span>
                </div>
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{product.updatedBy?.name || "No Modifications"}</p>
                <p className="text-[9px] text-slate-500 flex items-center gap-1">
                  <Calendar className="w-2.5 h-2.5" /> {new Date(product.updatedAt).toLocaleString()}
                </p>
              </div>

              <div className={`${isFullScreen ? "md:col-span-2" : ""} p-3 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Building2 className="w-3 h-3 text-slate-400" />
                  <span className="text-[9px] font-bold text-slate-500 uppercase">Organizational Authority</span>
                </div>
                <code className="text-[10px] text-slate-400 font-mono">ORG_ID: {product.organizationId}</code>
              </div>
            </div>
          </section>

          {/* Section 5: Details */}
          <section className="space-y-1">
            <label className={labelClass}>Catalog Notes</label>
            <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md min-h-[80px]">
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic">
                {product.description || "No extended description is associated with this record."}
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3 h-3 text-emerald-500" />
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Audit Locked</span>
        </div>
        
        <div className="flex gap-2">
          {canDelete && (
            <button 
              onClick={handleDelete} 
              disabled={isArchiving}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 text-[9px] font-bold uppercase tracking-widest rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 transition-all border border-red-100 dark:border-red-900/30 disabled:opacity-50"
            >
              {isArchiving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Archive Record
            </button>
          )}
          
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[9px] font-bold uppercase tracking-widest rounded-md hover:opacity-90 transition-all shadow-lg"
          >
            Close Panel
          </button>
        </div>
      </div>
    </div>
  );
}