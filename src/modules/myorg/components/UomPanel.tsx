"use client";

import React, { useState } from "react";
import { 
  X, Save, RefreshCw, Ruler, 
  Maximize2, Minimize2, Info, CheckCircle2,
  Square, CheckSquare
} from "lucide-react";
import { useAlerts } from "@/shared/components/feedback/AlertProvider";
import { useSidePanel } from "@/shared/components/layout/SidePanelContext";

/* -------------------------
Types
------------------------- */
interface UnitOfMeasure {
  id: string;
  name: string;
  abbreviation: string;
  active: boolean;
}

interface UomPanelProps {
  uom: UnitOfMeasure | null;
  onRefresh: () => void;
}

// Interface for the API payload to avoid 'any'
interface UomPayload {
  id?: string;
  name: string;
  abbreviation: string;
  active: boolean;
}

export function UomPanel({ uom, onRefresh }: UomPanelProps) {
  const { dispatch } = useAlerts();
  const { isFullScreen, toggleFullScreen, closePanel } = useSidePanel();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    name: uom?.name || "",
    abbreviation: uom?.abbreviation || "",
    active: uom ? uom.active : true,
  });

  const textSize = isFullScreen ? "text-[10px]" : "text-[9px]";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload: UomPayload = { ...formData };
      if (uom) payload.id = uom.id;

      const res = await fetch("/api/myorg", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UPSERT_UOM", payload }),
      });

      if (!res.ok) throw new Error("Operation failed.");

      dispatch({ 
        kind: "TOAST", 
        type: "SUCCESS", 
        title: "Success", 
        message: `UoM ${uom ? "updated" : "registered"} successfully.` 
      });
      onRefresh();
      closePanel();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
      dispatch({ 
        kind: "TOAST", 
        type: "WARNING", 
        title: "Error", 
        message: errorMessage 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-xl overflow-hidden" role="dialog" aria-modal="true">
      
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200/60 dark:border-slate-800 flex justify-between items-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest truncate">
              {uom ? "Update UoM Data" : "Register UoM"}
            </h2>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 uppercase font-bold tracking-tight">
            Premium Inventory Engine
          </p>
        </div>
        <div className="flex items-center gap-1 ml-4">
          <button onClick={toggleFullScreen} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={closePanel} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className={`p-4 ${isFullScreen ? 'md:p-8' : 'md:p-5'} space-y-6`}>
          
          {/* Guideline Section */}
          <div className="bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-100/50 dark:border-indigo-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-3.5 h-3.5 text-indigo-500" />
              <span className={`font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest ${textSize}`}>Definition Guide</span>
            </div>
            <ul className="space-y-2">
              <li className="flex gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                <CheckCircle2 className="w-3 h-3 mt-0.5 text-indigo-400 shrink-0" />
                <span><strong>Name:</strong> Full descriptive title (e.g., &quot;Kilogram&quot;, &quot;Piece&quot;).</span>
              </li>
              <li className="flex gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                <CheckCircle2 className="w-3 h-3 mt-0.5 text-indigo-400 shrink-0" />
                <span><strong>Abbreviation:</strong> Short identifier used in invoices (e.g., &quot;kg&quot;, &quot;pcs&quot;). This must be unique within your organization.</span>
              </li>
            </ul>
          </div>

          <form id="uom-form" onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="md:col-span-2">
                <label className={`block ${textSize} font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5`}>
                  Full Unit Name <span className="text-indigo-500/80">*</span>
                </label>
                <input 
                  type="text" 
                  required 
                  value={formData.name} 
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                  className="w-full rounded-md px-3 py-2 text-[13px] font-semibold outline-none transition-all bg-slate-50 border border-slate-200 text-slate-900 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100 focus:border-indigo-500/50"
                  placeholder="e.g. Kilogram" 
                />
              </div>

              <div>
                <label className={`block ${textSize} font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5`}>
                  Abbreviation <span className="text-indigo-500/80">*</span>
                </label>
                <input 
                  type="text" 
                  required 
                  value={formData.abbreviation} 
                  onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value })} 
                  className="w-full rounded-md px-3 py-2 text-[13px] font-semibold outline-none transition-all bg-slate-50 border border-slate-200 text-slate-900 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100 focus:border-indigo-500/50"
                  placeholder="e.g. kg" 
                />
              </div>
            </div>

            {/* Icon-based Checkbox Replacement */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, active: !formData.active })}
                className="flex items-start gap-3 group text-left"
              >
                <div className="mt-0.5">
                  {formData.active ? (
                    <CheckSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-500 fill-indigo-50 dark:fill-indigo-500/10 transition-transform group-active:scale-90" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-300 dark:text-slate-600 transition-transform group-active:scale-90" />
                  )}
                </div>
                <div>
                  <span className={`block ${textSize} font-bold uppercase tracking-widest transition-colors ${formData.active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}>
                    {formData.active ? "Active Standard" : "Inactive / Archived"}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Only active units can be assigned to new products.</span>
                </div>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex justify-end items-center gap-3 z-20">
        <button 
          type="button" 
          onClick={closePanel} 
          disabled={isSubmitting} 
          className={`px-4 py-2 ${textSize} font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors uppercase tracking-widest`}
        >
          Cancel
        </button>
        <button 
          type="submit" 
          form="uom-form" 
          disabled={isSubmitting} 
          className={`flex items-center gap-2 px-6 py-2.5 ${textSize} font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all uppercase tracking-widest disabled:opacity-70 shadow-lg shadow-indigo-500/20 active:scale-[0.98]`}
        >
          {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {uom ? "Update Registry" : "Save Definition"}
        </button>
      </div>
    </div>
  );
}