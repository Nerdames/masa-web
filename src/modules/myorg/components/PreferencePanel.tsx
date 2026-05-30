"use client";

import React, { useState } from "react";
import { 
  X, Save, RefreshCw, Settings2, Maximize2, 
  Minimize2, Info, CheckCircle2 
} from "lucide-react";
import { useAlerts } from "@/shared/components/feedback/AlertProvider";
import { useSidePanel } from "@/shared/components/layout/SidePanelContext";

/* -------------------------
Types
------------------------- */
type PreferenceCategory = "GENERAL" | "INVENTORY" | "FINANCE" | "SALES" | "SECURITY";

const PREF_CATEGORIES: PreferenceCategory[] = ["GENERAL", "INVENTORY", "FINANCE", "SALES", "SECURITY"];

interface Preference {
  category: PreferenceCategory;
  key: string;
  value: any;
}

interface PreferencePanelProps {
  preference: Preference | null;
  onRefresh: () => void;
}

export function PreferencePanel({ preference, onRefresh }: PreferencePanelProps) {
  const { dispatch } = useAlerts();
  const { isFullScreen, toggleFullScreen, closePanel } = useSidePanel();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const parseInitValue = () => {
    if (!preference) return "";
    return typeof preference.value === 'string' ? preference.value : JSON.stringify(preference.value, null, 2);
  };

  const [formData, setFormData] = useState({
    category: preference?.category || PREF_CATEGORIES[0],
    key: preference?.key || "",
    value: parseInitValue(),
  });

  const textSize = isFullScreen ? "text-[10px]" : "text-[9px]";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    let parsedValue: any = formData.value;
    try { 
      parsedValue = JSON.parse(formData.value); 
    } catch { 
      // Treat as plain string if JSON parse fails
    }

    try {
      const payload = {
        category: formData.category,
        key: formData.key,
        value: parsedValue
      };

      const res = await fetch("/api/myorg", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UPSERT_PREFERENCE", payload }),
      });

      if (!res.ok) throw new Error("Operation failed.");
      
      dispatch({ 
        kind: "TOAST", 
        type: "SUCCESS", 
        title: "Success", 
        message: `Preference ${preference ? "updated" : "saved"} successfully.` 
      });
      onRefresh();
      closePanel();
    } catch (err: any) {
      dispatch({ 
        kind: "TOAST", 
        type: "WARNING", 
        title: "Error", 
        message: err.message 
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
            <Settings2 className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest truncate">
              {preference ? "Update Preference" : "Define Preference"}
            </h2>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 uppercase font-bold tracking-tight">
            Organization Configuration
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
              <span className={`font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest ${textSize}`}>Usage Guide</span>
            </div>
            <ul className="space-y-2">
              <li className="flex gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                <CheckCircle2 className="w-3 h-3 mt-0.5 text-indigo-400 shrink-0" />
                <span><strong>Persistence:</strong> Changes apply globally to the organization scope immediately upon save.</span>
              </li>
              <li className="flex gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                <CheckCircle2 className="w-3 h-3 mt-0.5 text-indigo-400 shrink-0" />
                <span><strong>Data Types:</strong> Values are automatically parsed. Use valid JSON for complex configurations (arrays/objects).</span>
              </li>
            </ul>
          </div>

          <form id="pref-form" onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={`block ${textSize} font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5`}>
                  Category <span className="text-indigo-500/80">*</span>
                </label>
                <select 
                  disabled={!!preference} 
                  value={formData.category} 
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as PreferenceCategory })} 
                  className="w-full rounded-md px-3 py-2 text-[13px] font-semibold outline-none transition-all bg-slate-50 border border-slate-200 text-slate-900 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100 focus:border-indigo-500/50 disabled:opacity-50"
                >
                  {PREF_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className={`block ${textSize} font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5`}>
                  Preference Key <span className="text-indigo-500/80">*</span>
                </label>
                <input 
                  type="text" 
                  required 
                  disabled={!!preference} 
                  value={formData.key} 
                  onChange={(e) => setFormData({ ...formData, key: e.target.value.replace(/\s+/g, '_').toUpperCase() })} 
                  className="w-full rounded-md px-3 py-2 text-[13px] font-mono font-bold outline-none transition-all bg-slate-50 border border-slate-200 text-slate-900 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100 focus:border-indigo-500/50 disabled:opacity-50" 
                  placeholder="E.G. TAX_INCLUSIVE_PRICING" 
                />
              </div>
            </div>

            <div>
              <label className={`block ${textSize} font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 flex justify-between`}>
                <span>Value Parameter <span className="text-indigo-500/80">*</span></span>
                <span className="text-[10px] text-slate-400 italic font-normal normal-case">Plain Text or JSON</span>
              </label>
              <textarea 
                required 
                rows={isFullScreen ? 10 : 5}
                value={formData.value} 
                onChange={(e) => setFormData({ ...formData, value: e.target.value })} 
                className="w-full rounded-md px-3 py-3 text-[13px] font-mono outline-none transition-all bg-slate-50 border border-slate-200 text-slate-900 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100 focus:border-indigo-500/50 resize-none custom-scrollbar" 
                placeholder='e.g. true or {"max_retry": 3}' 
              />
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
          form="pref-form" 
          disabled={isSubmitting} 
          className={`flex items-center gap-2 px-6 py-2.5 ${textSize} font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all uppercase tracking-widest disabled:opacity-70 shadow-lg shadow-indigo-500/20 active:scale-[0.98]`}
        >
          {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {preference ? "Update Configuration" : "Save Preference"}
        </button>
      </div>
    </div>
  );
}