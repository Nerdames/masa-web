"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  X, Maximize2, Minimize2, Save, Loader2, 
  Dices, PackageSearch, Plus, CheckCircle2, 
  ShieldAlert, Banknote
} from "lucide-react";
import { useSidePanel } from "@/shared/components/layout/SidePanelContext";
import { useAlerts } from "@/shared/components/feedback/AlertProvider";
import { usePermission } from "@/shared/hooks/usePermission";
import { PermissionAction, Resource } from "@prisma/client";

/* -------------------------------------------------------------------------- */
/* TYPES & INTERFACES (Synchronized with MASA Schema)                         */
/* -------------------------------------------------------------------------- */

interface ICategory {
  id: string;
  name: string;
}

interface IUOM {
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
  baseCostPrice: number; 
  costPrice: number;
  currency: string;
  categoryId?: string | null;
  uomId?: string | null;
}

interface ProductPanelProps {
  product?: IProduct | null; 
  organizationId: string;
  initialCategories?: ICategory[];
  initialUoms?: IUOM[];
  onClose: () => void;
  onSuccess: () => void;
}

/* -------------------------------------------------------------------------- */
/* CONSTANTS & STYLES (Enterprise Visibility Fix)                             */
/* -------------------------------------------------------------------------- */

const inputClass = `
  w-full border border-slate-200 dark:border-slate-700 rounded-md text-xs p-2 
  bg-white dark:bg-slate-950 text-slate-900 dark:text-white 
  focus:ring-1 focus:ring-emerald-500 outline-none transition-all 
  placeholder:text-slate-400 disabled:opacity-50 disabled:bg-slate-50
`;

const labelClass = "block text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1";

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function RegisterProductPanel({ 
  product,
  organizationId,
  initialCategories = [],
  initialUoms = [],
  onClose, 
  onSuccess 
}: ProductPanelProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  const { can, canCreate } = usePermission();

  // Permission Logic [cite: 1]
  const canSave = product 
    ? can(PermissionAction.UPDATE, Resource.PRODUCT) 
    : can(PermissionAction.CREATE, Resource.PRODUCT);

  const canManageSettings = canCreate(Resource.SETTINGS);

  // Form State (Aligned with MASA Schema [cite: 33])
  const [formData, setFormData] = useState({
    name: product?.name || "",
    sku: product?.sku || "",
    barcode: product?.barcode || "",
    description: product?.description || "",
    categoryId: product?.categoryId || "",
    uomId: product?.uomId || "",
    baseCostPrice: product ? Number(product.baseCostPrice) : 0,
    costPrice: product ? Number(product.costPrice) : 0,
    currency: product?.currency || "NGN",
  });

  const [categories, setCategories] = useState<ICategory[]>(initialCategories);
  const [uoms, setUoms] = useState<IUOM[]>(initialUoms);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isAddingUom, setIsAddingUom] = useState(false);
  const [newUomName, setNewUomName] = useState("");
  const [newUomAbbrev, setNewUomAbbrev] = useState("");

  const fetchMetadata = useCallback(async () => {
    if (categories.length > 0 && uoms.length > 0) return;
    setIsLoadingMetadata(true);
    try {
      const [catRes, uomRes] = await Promise.all([
        fetch(`/api/categories?mode=dropdown&organizationId=${organizationId}`),
        fetch(`/api/uoms?mode=dropdown&organizationId=${organizationId}`)
      ]);
      
      const [catData, uomData] = await Promise.all([catRes.json(), uomRes.json()]);
      
      if (catRes.ok) setCategories(catData.data || catData);
      if (uomRes.ok) setUoms(uomData.data || uomData);
    } catch (error) {
      console.error("Failed to hydrate product metadata", error);
    } finally {
      setIsLoadingMetadata(false);
    }
  }, [organizationId, categories.length, uoms.length]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  /* --- Inline Creation Handlers --- */

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim() || !canManageSettings) return;
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
    if (!newUomName.trim() || !newUomAbbrev.trim() || !canManageSettings) return;
    try {
      const res = await fetch("/api/uoms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: newUomName.trim(), 
          abbreviation: newUomAbbrev.trim().toUpperCase(), 
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
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "UoM Created", message: "New unit of measure added." });
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Error", message: err.message });
    }
  };

  const generateSKU = () => {
    const productName = formData.name.trim();
    if (!productName) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Input Required", message: "Enter a product name to generate a SKU." });
      return;
    }
    const prefix = productName.substring(0, 3).toUpperCase();
    const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
    setFormData(prev => ({ ...prev, sku: `${prefix}-${randomStr}` }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Access Denied", message: "Insufficient permissions." });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        organizationId, 
        sku: formData.sku.toUpperCase().trim(),
        categoryId: formData.categoryId || null,
        uomId: formData.uomId || null,
        barcode: formData.barcode?.trim() || null,
        description: formData.description?.trim() || null,
        baseCostPrice: Number(formData.baseCostPrice),
        costPrice: Number(formData.costPrice || formData.baseCostPrice),
      };

      const url = product ? `/api/products?id=${product.id}` : "/api/products";
      const res = await fetch(url, {
        method: product ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      
      if (!res.ok) {
        const errorMsg = typeof result.error === 'object' 
          ? Object.values(result.error).flat().join(", ") 
          : result.error;
        throw new Error(errorMsg || "Operation failed.");
      }

      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: product ? "Catalog Updated" : "Product Registered",
        message: `Processed ${result.data?.name || formData.name} successfully.`
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Registration Error", message: err.message });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-2xl relative overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
            <PackageSearch className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {product ? "Update Product" : "Register Master Product"}
            </h2>
            <p className="text-[8px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">
              Product Registry V3.1
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
              <span className="font-bold uppercase">View Only:</span> Insufficient permissions to modify the catalog.
            </p>
          </div>
        )}

        <form id="product-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Core Identity */}
          <section className="space-y-3">
            <h3 className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1">
                Core Identity
            </h3>

            {/* Responsive Grid Logic: Stacks in column when full screen is false */}
            <div className={`grid gap-3 ${isFullScreen ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
              <div className={`${isFullScreen ? "md:col-span-2" : ""} space-y-1`}>
                <label className={labelClass}>Product Name *</label>
                <input disabled={!canSave} type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={inputClass} placeholder="Enter product name" />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>SKU *</label>
                <div className="flex gap-1.5">
                  <input disabled={!canSave} type="text" required value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} className={`${inputClass} font-mono uppercase`} />
                  {canSave && (
                    <button type="button" onClick={generateSKU} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700">
                      <Dices className="w-3.5 h-3.5 text-slate-500" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Barcode</label>
                <input disabled={!canSave} type="text" value={formData.barcode || ""} onChange={e => setFormData({...formData, barcode: e.target.value})} className={inputClass} placeholder="UPC / EAN / Internal" />
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
                <div className="flex justify-between items-center">
                  <label className={labelClass}>Category</label>
                  {!isAddingCategory && canManageSettings && (
                    <button type="button" onClick={() => setIsAddingCategory(true)} className="text-[8px] text-emerald-600 font-bold uppercase flex items-center gap-0.5 hover:underline">
                      <Plus className="w-2.5 h-2.5"/> New
                    </button>
                  )}
                </div>
                {isAddingCategory ? (
                  <div className="flex gap-1.5 items-center bg-slate-50 dark:bg-slate-800/50 p-1 rounded-md border border-emerald-200 dark:border-emerald-900/30">
                    <input autoFocus value={newCategoryName} onChange={e=>setNewCategoryName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCreateCategory())} className="flex-1 text-[11px] px-1.5 bg-transparent outline-none text-slate-900 dark:text-white" placeholder="Category name..." />
                    <button type="button" onClick={handleCreateCategory} className="p-1 text-emerald-500 hover:bg-emerald-50 rounded"><CheckCircle2 className="w-3.5 h-3.5"/></button>
                    <button type="button" onClick={() => setIsAddingCategory(false)} className="p-1 text-red-400 hover:bg-red-50 rounded"><X className="w-3.5 h-3.5"/></button>
                  </div>
                ) : (
                  <select disabled={!canSave || isLoadingMetadata} value={formData.categoryId || ""} onChange={e => setFormData({...formData, categoryId: e.target.value})} className={inputClass}>
                    <option value="">{isLoadingMetadata ? "Loading..." : "Select Category"}</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className={labelClass}>Unit of Measure</label>
                  {!isAddingUom && canManageSettings && (
                    <button type="button" onClick={() => setIsAddingUom(true)} className="text-[8px] text-emerald-600 font-bold uppercase flex items-center gap-0.5 hover:underline">
                      <Plus className="w-2.5 h-2.5"/> New
                    </button>
                  )}
                </div>
                {isAddingUom ? (
                  <div className="flex gap-1.5 items-center bg-slate-50 dark:bg-slate-800/50 p-1 rounded-md border border-emerald-200 dark:border-emerald-900/30">
                    <input autoFocus value={newUomName} onChange={e=>setNewUomName(e.target.value)} className="w-1/2 text-[11px] px-1.5 bg-transparent outline-none text-slate-900 dark:text-white" placeholder="Name" />
                    <input value={newUomAbbrev} onChange={e=>setNewUomAbbrev(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCreateUom())} className="w-1/4 text-[11px] px-1.5 bg-transparent outline-none text-slate-900 dark:text-white border-l border-slate-200" placeholder="Abbr" />
                    <button type="button" onClick={handleCreateUom} className="p-1 text-emerald-500 rounded"><CheckCircle2 className="w-3.5 h-3.5"/></button>
                    <button type="button" onClick={() => setIsAddingUom(false)} className="p-1 text-red-400 rounded"><X className="w-3.5 h-3.5"/></button>
                  </div>
                ) : (
                  <select disabled={!canSave || isLoadingMetadata} value={formData.uomId || ""} onChange={e => setFormData({...formData, uomId: e.target.value})} className={inputClass}>
                    <option value="">{isLoadingMetadata ? "Loading..." : "Select UoM"}</option>
                    {uoms.map(u => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}
                  </select>
                )}
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
                <div className="relative">
                  <Banknote className="absolute left-2 top-2.5 w-3 h-3 text-slate-400" />
                  <select disabled={!canSave} value={formData.currency} onChange={e => setFormData({...formData, currency: e.target.value})} className={`${inputClass} pl-7`}>
                    <option value="NGN">NGN (Nigerian Naira)</option>
                    <option value="USD">USD (US Dollar)</option>
                    <option value="GBP">GBP (British Pound)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Base Cost ({formData.currency})</label>
                <input disabled={!canSave} type="number" step="0.01" value={formData.baseCostPrice} onChange={e => setFormData({...formData, baseCostPrice: parseFloat(e.target.value) || 0})} className={`${inputClass} font-mono`} />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Current Landed Cost ({formData.currency})</label>
                <input disabled={!canSave} type="number" step="0.01" value={formData.costPrice} onChange={e => setFormData({...formData, costPrice: parseFloat(e.target.value) || 0})} className={`${inputClass} font-mono`} />
              </div>
            </div>
          </section>

          {/* Section 4: Details */}
          <section className="space-y-1">
            <label className={labelClass}>Internal Notes</label>
            <textarea disabled={!canSave} value={formData.description || ""} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} className={`${inputClass} resize-none`} placeholder="Additional specifications..." />
          </section>
        </form>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end items-center gap-2 shrink-0">
        <button type="button" onClick={onClose} disabled={isSubmitting} className="px-3 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-800 dark:hover:text-slate-300 transition-colors">
          Discard
        </button>
        {canSave && (
          <button type="submit" form="product-form" disabled={isSubmitting} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-[9px] font-bold uppercase tracking-widest rounded-md hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50">
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {product ? "Update Product" : "Commit Record"}
          </button>
        )}
      </div>
    </div>
  );
}