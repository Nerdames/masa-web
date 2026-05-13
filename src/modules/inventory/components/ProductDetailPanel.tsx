"use client";

import React, { useMemo } from "react";
import {
  X, Maximize2, Minimize2, Package,
  Trash2, Tag, Barcode, Info, 
  DollarSign, Layers, Weight, Edit3,
  Calendar, Building2, Hash
} from "lucide-react";

// Contexts & Hooks
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { usePermission } from "@/core/hooks/usePermission";
import { PermissionAction, Resource } from "@prisma/client";

// Components
import RegisterProductPanel from "./RegisterProductPanel";

/* -------------------------
Types
------------------------- */
interface ICategory {
  id: string;
  name: string;
}

interface IUom {
  id: string;
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
  categoryId?: string | null;
  uomId?: string | null;
  category?: ICategory | null;
  uom?: IUom | null;
  organizationId: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

interface ProductDetailPanelProps {
  product: IProduct;
  onClose: () => void;
  onRefresh: () => void;
}

/**
 * PRODUCT DETAIL PANEL
 * High-fidelity read-only view for Product Master Data.
 * Transitions to RegisterProductPanel for update operations.
 */
export default function ProductDetailPanel({ product, onClose, onRefresh }: ProductDetailPanelProps) {
  const { isFullScreen, toggleFullScreen, openPanel } = useSidePanel();
  const { dispatch } = useAlerts();
  const { can } = usePermission();

  // RBAC Gating
  const canModify = can(PermissionAction.UPDATE, Resource.PRODUCT);
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

  /**
   * Transitions from Detail View to Edit View
   */
  const handleEditTransition = () => {
    if (!canModify) return;
    
    // Open Register panel in the side panel context
    openPanel({
      title: `Edit Product: ${product.sku}`,
      component: (
        <RegisterProductPanel 
          initialData={product} 
          onSuccess={() => {
            onRefresh();
            onClose(); // Close the stack or stay depending on SidePanel logic
          }} 
        />
      ),
    });
  };

  /**
   * Handles hard deletion of product catalog entry
   */
  const handleDelete = async () => {
    if (!canDelete) return;

    const confirmed = window.confirm(`Are you sure you want to delete ${product.name}? This action is irreversible.`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/products?id=${product.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Deletion failed. Product may be linked to existing transactions.");

      dispatch?.({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Catalog Purged",
        message: `${product.sku} removed from master data.`
      });

      onRefresh();
      onClose();
    } catch (err: any) {
      dispatch?.({
        kind: "TOAST",
        type: "ERROR",
        title: "Deletion Error",
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
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate uppercase tracking-tight">
              {product.name}
            </h2>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              {product.sku}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 uppercase font-bold tracking-widest">
            Inventory Master Data
          </p>
        </div>
        <div className="flex items-center gap-1 ml-4">
          <button 
            onClick={toggleFullScreen} 
            className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-4 space-y-6">
          
          {/* Section: Basic Identity */}
          <section className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Tag className="w-3 h-3" /> Product Name
                </label>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100 px-1">{product.name}</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Hash className="w-3 h-3" /> SKU Identifier
                </label>
                <p className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200/50 dark:border-slate-700/50 uppercase tracking-tighter">
                  {product.sku}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Barcode className="w-3 h-3" /> Barcode / UPC
                </label>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 p-2">
                  {product.barcode || "N/A"}
                </p>
              </div>
            </div>
          </section>

          {/* Section: Financials & Categorization */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-emerald-50/30 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20">
              <label className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2 block flex items-center gap-1.5">
                <DollarSign className="w-3 h-3" /> Cost Accounting
              </label>
              <div className="space-y-3">
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-bold">Base Cost</span>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {currencySymbol}{formattedBaseCost}
                  </p>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-bold">Landed Cost</span>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {currencySymbol}{formattedCostPrice}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block flex items-center gap-1.5">
                <Layers className="w-3 h-3" /> Categorization
              </label>
              <div className="space-y-3">
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-bold">Category</span>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {product.category?.name || "Uncategorized"}
                  </p>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-bold flex items-center gap-1">
                    <Weight className="w-2.5 h-2.5" /> Unit of Measure
                  </span>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {product.uom?.name} ({product.uom?.abbreviation || "Unit"})
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section: Description */}
          <section className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Info className="w-3 h-3" /> Catalog Description
            </label>
            <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg min-h-[80px]">
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic">
                {product.description || "No description provided for this catalog entry."}
              </p>
            </div>
          </section>

          {/* Section: System Meta */}
          <section className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5" /> Created At
              </label>
              <p className="text-[10px] font-medium text-slate-500">
                {product.createdAt ? new Date(product.createdAt).toLocaleString() : "---"}
              </p>
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1">
                <Building2 className="w-2.5 h-2.5" /> Org Context
              </label>
              <p className="text-[10px] font-medium text-slate-500 truncate">
                ID: {product.organizationId}
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end gap-3">
        {canDelete && (
          <button 
            onClick={handleDelete}
            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors group" 
            title="Purge from Catalog"
          >
            <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
          </button>
        )}
        
        {canModify && (
          <button
            onClick={handleEditTransition}
            className="px-6 py-2 bg-slate-900 dark:bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-sm hover:opacity-90 transition-all flex items-center gap-2"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Modify Master Data
          </button>
        )}
      </div>
    </div>
  );
}