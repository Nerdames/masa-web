"use client";

import React, { useState } from "react";
import { 
  X, Maximize2, Minimize2, Save, 
  Loader2, Dices, PackageSearch
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";

/* -------------------------
  Types & Interfaces
------------------------- */

export interface ICategory {
  id: string;
  name: string;
}

export interface IUOM {
  id: string;
  name: string;
  abbreviation: string;
}

export interface IVendor {
  id: string;
  name: string;
}

export interface RegisterProductPayload {
  // Master Product Data
  name: string;
  sku: string;
  barcode: string;
  description: string;
  categoryId: string;
  uomId: string;
  baseCostPrice: number;
  
  // Branch Specific Data
  vendorId: string;
  sellingPrice: number;
  reorderLevel: number;
  safetyStock: number;
}

interface RegisterProductPanelProps {
  categories: ICategory[];
  uoms: IUOM[];
  vendors: IVendor[];
  onClose: () => void;
  onCreate: (payload: RegisterProductPayload) => Promise<void>;
}

/* -------------------------
  Component
------------------------- */

export default function RegisterProductPanel({ 
  categories,
  uoms,
  vendors, 
  onClose, 
  onCreate 
}: RegisterProductPanelProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    barcode: "",
    categoryId: "",
    uomId: "",
    vendorId: "",
    baseCostPrice: "",
    sellingPrice: "",
    reorderLevel: "0",
    safetyStock: "0",
    description: ""
  });

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* --- Actions --- */

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const generateSKU = () => {
    const prefix = formData.categoryId 
      ? categories.find(c => c.id === formData.categoryId)?.name.substring(0, 3).toUpperCase() 
      : "PRD";
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    setFormData(prev => ({ ...prev, sku: `${prefix}-${randomStr}` }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    // Validation
    if (!formData.name || !formData.sku) {
      setError("Product Name and SKU are strictly required.");
      setIsSubmitting(false);
      return;
    }

    if (Number(formData.baseCostPrice) < 0 || Number(formData.sellingPrice) < 0) {
      setError("Financial values cannot be negative.");
      setIsSubmitting(false);
      return;
    }

    try {
      const payload: RegisterProductPayload = {
        name: formData.name.trim(),
        sku: formData.sku.trim(),
        barcode: formData.barcode.trim(),
        description: formData.description.trim(),
        categoryId: formData.categoryId,
        uomId: formData.uomId,
        vendorId: formData.vendorId,
        baseCostPrice: Number(formData.baseCostPrice) || 0,
        sellingPrice: Number(formData.sellingPrice) || 0,
        reorderLevel: Number(formData.reorderLevel) || 0,
        safetyStock: Number(formData.safetyStock) || 0,
      };

      await onCreate(payload);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to register product.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-2xl relative overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
            <PackageSearch className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Register Product</h2>
            <p className="text-[11px] text-slate-700 dark:text-slate-300 uppercase tracking-wide font-medium">
              Master Catalog & Inventory Params
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={toggleFullScreen} 
            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors" 
            title="Toggle Fullscreen"
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button 
            type="button"
            onClick={onClose} 
            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors" 
            title="Close Panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-xs font-bold border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900/50 flex items-center gap-2">
            <span className="block w-1.5 h-full bg-red-500 rounded-full"></span>
            {error}
          </div>
        )}

        <form id="product-form" onSubmit={handleSubmit} className="space-y-8">
          
          {/* Section 1: Core Identity */}
          <section className="space-y-4">
            <h3 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2">
              Core Identity
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  name="name"
                  value={formData.name} 
                  onChange={handleChange} 
                  required 
                  placeholder="e.g., Premium Widget V2"
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors" 
                />
              </div>

              <div className="space-y-1.5 relative">
                <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Stock Keeping Unit (SKU) <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    name="sku"
                    value={formData.sku} 
                    onChange={handleChange} 
                    required 
                    placeholder="e.g., WID-002"
                    className="flex-1 border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors font-mono uppercase" 
                  />
                  <button 
                    type="button" 
                    onClick={generateSKU}
                    className="px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors border border-slate-300 dark:border-slate-700 flex items-center justify-center"
                    title="Auto-generate SKU"
                  >
                    <Dices className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Barcode (UPC/EAN)
                </label>
                <input 
                  type="text" 
                  name="barcode"
                  value={formData.barcode} 
                  onChange={handleChange} 
                  placeholder="Scan or enter barcode..."
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors font-mono" 
                />
              </div>
            </div>
          </section>

          {/* Section 2: Classification */}
          <section className="space-y-4">
            <h3 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2">
              Classification & Sourcing
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Category
                </label>
                <select 
                  name="categoryId"
                  value={formData.categoryId} 
                  onChange={handleChange} 
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors"
                >
                  <option value="">None</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Unit of Measure
                </label>
                <select 
                  name="uomId"
                  value={formData.uomId} 
                  onChange={handleChange} 
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors"
                >
                  <option value="">Select UoM...</option>
                  {uoms.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Primary Vendor
                </label>
                <select 
                  name="vendorId"
                  value={formData.vendorId} 
                  onChange={handleChange} 
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors"
                >
                  <option value="">No Primary Vendor</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* Section 3: Financials & Stock Parameters */}
          <section className="space-y-4">
            <h3 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2">
              Financials & Stock Parameters
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Base Cost (₦) <span className="text-red-500">*</span>
                </label>
                <input 
                  type="number" 
                  name="baseCostPrice"
                  min="0"
                  step="0.01"
                  value={formData.baseCostPrice} 
                  onChange={handleChange} 
                  required
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors font-mono" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Selling Price (₦)
                </label>
                <input 
                  type="number" 
                  name="sellingPrice"
                  min="0"
                  step="0.01"
                  value={formData.sellingPrice} 
                  onChange={handleChange} 
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors font-mono" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Reorder Level
                </label>
                <input 
                  type="number" 
                  name="reorderLevel"
                  min="0"
                  value={formData.reorderLevel} 
                  onChange={handleChange} 
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors font-mono" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Safety Stock
                </label>
                <input 
                  type="number" 
                  name="safetyStock"
                  min="0"
                  value={formData.safetyStock} 
                  onChange={handleChange} 
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors font-mono" 
                />
              </div>
            </div>
          </section>

          {/* Section 4: Details */}
          <section className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Description / Internal Notes
            </label>
            <textarea 
              name="description"
              value={formData.description} 
              onChange={handleChange} 
              rows={3} 
              placeholder="Describe the product, its utility, or special handling instructions..." 
              className="w-full border border-slate-300 dark:border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white resize-none transition-colors placeholder:text-slate-500"
            />
          </section>
        </form>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end items-center gap-3 shrink-0">
        <button 
          type="button" 
          onClick={onClose} 
          className="px-4 py-2 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          Discard
        </button>
        <button 
          type="submit" 
          form="product-form" 
          disabled={isSubmitting} 
          className="h-9 px-6 bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-emerald-700 transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Register Product
        </button>
      </div>
    </div>
  );
}