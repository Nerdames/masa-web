"use client";

import React, { useCallback, useEffect, useState } from "react";
import { X, Plus, CheckCircle2, RefreshCw, Save } from "lucide-react";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/**
 * PRODUCTION-READY PRODUCT MODAL
 * - Uses verified fetch logic for Categories & UoMs
 * - Strict Prisma Schema alignment
 * - High-fidelity MASA UI design
 */

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
}

export function CreateEditProductModal({ 
  product, 
  organizationId, 
  onClose, 
  onRefresh 
}: { 
  product: IProduct | null; 
  organizationId: string; 
  onClose: () => void; 
  onRefresh: () => void; 
}) {
  const { dispatch } = useAlerts();

  const [formData, setFormData] = useState({
    name: product?.name || "",
    sku: product?.sku || "",
    barcode: product?.barcode || "",
    description: product?.description || "",
    baseCostPrice: product ? Number(product.baseCostPrice) : 0,
    costPrice: product ? Number(product.costPrice) : 0,
    currency: product?.currency || "NGN",
    categoryId: product?.categoryId || "",
    uomId: product?.uomId || "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categories, setCategories] = useState<ICategory[]>([]);
  const [uoms, setUoms] = useState<IUom[]>([]);

  // Inline Creation State
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  
  const [isAddingUom, setIsAddingUom] = useState(false);
  const [newUomName, setNewUomName] = useState("");
  const [newUomAbbrev, setNewUomAbbrev] = useState("");

  /**
   * VERIFIED FETCH LOGIC:
   * Handles direct array responses or wrapped data responses.
   */
  const fetchRelations = useCallback(async () => {
    try {
      const [catRes, uomRes] = await Promise.all([
        fetch(`/api/categories`),
        fetch(`/api/uoms`) 
      ]);

      if (catRes.ok) {
        const catData = await catRes.json();
        const cats = Array.isArray(catData) ? catData : (catData.data || []);
        setCategories(cats);
      }

      if (uomRes.ok) {
        const uomData = await uomRes.json();
        const units = Array.isArray(uomData) ? uomData : (uomData.data || []);
        setUoms(units);
      }
    } catch (err) {
      console.warn("Failed to load select options", err);
    }
  }, []);

  useEffect(() => {
    fetchRelations();
  }, [fetchRelations]);

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim(), organizationId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || "Failed to create category");
      
      const newCat = data.data || data;
      setCategories(prev => [...prev, newCat]);
      setFormData(prev => ({ ...prev, categoryId: newCat.id }));
      setIsAddingCategory(false);
      setNewCategoryName("");
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Category Created", message: "New category added." });
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Error", message: err.message });
    }
  };

  const handleCreateUom = async () => {
    if (!newUomName.trim() || !newUomAbbrev.trim()) return;
    try {
      const res = await fetch("/api/uoms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: newUomName.trim(), 
          abbreviation: newUomAbbrev.trim(), 
          organizationId 
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || "Failed to create UoM");

      const newUom = data.data || data;
      setUoms(prev => [...prev, newUom]);
      setFormData(prev => ({ ...prev, uomId: newUom.id }));
      setIsAddingUom(false);
      setNewUomName("");
      setNewUomAbbrev("");
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "UoM Created", message: "New Unit of Measure added." });
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Error", message: err.message });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        organizationId,
        sku: formData.sku.toUpperCase(),
        categoryId: formData.categoryId || null,
        uomId: formData.uomId || null,
        barcode: formData.barcode || null,
        description: formData.description || null,
        baseCostPrice: Number(formData.baseCostPrice),
        costPrice: Number(formData.costPrice),
      };

      const url = product ? `/api/products?id=${product.id}` : "/api/products";

      const res = await fetch(url, {
        method: product ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || "Operation failed.");

      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: product ? "Catalog Updated" : "Product Registered",
        message: `Successfully ${product ? "modified" : "added"} ${data.data?.name || formData.name}.`
      });

      onRefresh();
      onClose();
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Registration Error", message: err.message || "Operation failed" });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-[14px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">{product ? "Update Catalog Entry" : "Register Master Product"}</h2>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-tight">MASA Core Inventory Persistence</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
          <form id="product-form" onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Product Name <span className="text-indigo-500">*</span></label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors" placeholder="e.g. Apex Widget Pro" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">SKU <span className="text-indigo-500">*</span></label>
                <input type="text" required value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors uppercase" placeholder="APX-WGT-001" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Barcode (Optional)</label>
                <input type="text" value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors" placeholder="UPC / EAN" />
              </div>

              {/* Category Field */}
              <div className="flex flex-col justify-end">
                <div className="flex justify-between items-end mb-1.5">
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Category</label>
                  {!isAddingCategory && (
                    <button type="button" onClick={() => setIsAddingCategory(true)} className="text-[9px] text-indigo-500 font-bold uppercase flex items-center gap-1 hover:text-indigo-600 transition-colors">
                      <Plus className="w-3 h-3"/> New
                    </button>
                  )}
                </div>
                {isAddingCategory ? (
                  <div className="flex gap-2 items-center bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 h-[42px]">
                    <input type="text" placeholder="Category Name" autoFocus value={newCategoryName} onChange={e=>setNewCategoryName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCreateCategory())} className="flex-1 text-[13px] px-2 bg-transparent border-none outline-none dark:text-white" />
                    <button type="button" onClick={handleCreateCategory} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded"><CheckCircle2 className="w-4 h-4 text-emerald-500"/></button>
                    <button type="button" onClick={() => setIsAddingCategory(false)} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded"><X className="w-4 h-4 text-red-500"/></button>
                  </div>
                ) : (
                  <select value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} className="w-full h-[42px] border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium px-2.5 focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors">
                    <option value="">-- Select Category --</option>
                    {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                  </select>
                )}
              </div>

              {/* Unit of Measure Field */}
              <div className="flex flex-col justify-end">
                <div className="flex justify-between items-end mb-1.5">
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Unit of Measure</label>
                  {!isAddingUom && (
                    <button type="button" onClick={() => setIsAddingUom(true)} className="text-[9px] text-indigo-500 font-bold uppercase flex items-center gap-1 hover:text-indigo-600 transition-colors">
                      <Plus className="w-3 h-3"/> New
                    </button>
                  )}
                </div>
                {isAddingUom ? (
                  <div className="flex gap-1.5 items-center bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 h-[42px]">
                    <input type="text" placeholder="Name" autoFocus value={newUomName} onChange={e=>setNewUomName(e.target.value)} className="w-1/2 text-[12px] px-1 bg-transparent border-none outline-none dark:text-white" />
                    <div className="w-px h-4 bg-slate-200 dark:bg-slate-700"></div>
                    <input type="text" placeholder="Abbr" value={newUomAbbrev} onChange={e=>setNewUomAbbrev(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCreateUom())} className="w-1/3 text-[12px] px-1 bg-transparent border-none outline-none dark:text-white" />
                    <button type="button" onClick={handleCreateUom} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded"><CheckCircle2 className="w-4 h-4 text-emerald-500"/></button>
                    <button type="button" onClick={() => setIsAddingUom(false)} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded"><X className="w-4 h-4 text-red-500"/></button>
                  </div>
                ) : (
                  <select value={formData.uomId} onChange={(e) => setFormData({ ...formData, uomId: e.target.value })} className="w-full h-[42px] border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium px-2.5 focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors">
                    <option value="">-- Select UoM --</option>
                    {uoms.map(uom => <option key={uom.id} value={uom.id}>{uom.name} ({uom.abbreviation})</option>)}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Base Cost Price <span className="text-indigo-500">*</span></label>
                <input type="number" step="0.01" min="0" required value={formData.baseCostPrice} onChange={(e) => setFormData({ ...formData, baseCostPrice: parseFloat(e.target.value), costPrice: parseFloat(e.target.value) })} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors" placeholder="0.00" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Currency</label>
                <select value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors">
                  <option value="NGN">NGN (Naira)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="GBP">GBP (British Pound)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Description & Notes</label>
              <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 dark:text-white resize-none transition-colors" placeholder="Internal product notes..." />
            </div>
          </form>
        </div>

        {/* Action Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end gap-3 rounded-b-2xl">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors uppercase tracking-widest">Cancel</button>

          <button type="submit" form="product-form" disabled={isSubmitting} className="flex items-center gap-2 px-6 py-2 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all uppercase tracking-widest disabled:opacity-70 shadow-md shadow-indigo-500/10">
            {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {product ? "Update Catalog" : "Save Product"}
          </button>
        </div>
      </div>
    </div>
  );
}