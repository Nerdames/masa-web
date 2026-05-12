"use client";

import React, { useState } from "react";
import { 
  CheckSquare, X, Save, RefreshCw, 
  Maximize2, Minimize2, Shield, ChevronDown 
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/* -------------------------
   Independent Types & Constants
------------------------- */
export const ROLES = ["ADMIN", "MANAGER", "SALES", "INVENTORY", "CASHIER", "DEV", "AUDITOR"] as const;
export const RESOURCES = ["INVOICE", "STOCK", "PRODUCT", "CUSTOMER", "EXPENSE", "PROCUREMENT", "VENDOR", "REPORT", "AUDIT", "SETTINGS", "BRANCH", "PERSONNEL", "FINANCE"] as const;
export const ACTIONS = ["CREATE", "READ", "UPDATE", "DELETE", "VOID", "APPROVE", "EXPORT"] as const;

export type Role = typeof ROLES[number];
export type Resource = typeof RESOURCES[number];
export type PermissionAction = typeof ACTIONS[number];

export interface ResourcePermission {
  id?: string;
  role: Role;
  resource: Resource;
  actions: PermissionAction[];
}

interface PermissionPanelProps {
  permission: ResourcePermission | null;
  onRefresh: () => void;
}

export function PermissionPanel({ permission, onRefresh }: PermissionPanelProps) {
  const { dispatch } = useAlerts();
  const { isFullScreen, toggleFullScreen, closePanel } = useSidePanel();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    role: permission?.role || ROLES[0],
    resources: permission ? [permission.resource] : ([] as Resource[]),
    actions: permission?.actions || ([] as PermissionAction[]),
  });

  // Adaptive styles based on panel mode
  const textSize = isFullScreen ? "text-[10px]" : "text-[9px]";
  const gridGap = isFullScreen ? "gap-2" : "gap-1.5";

  const toggleAction = (action: PermissionAction) => {
    setFormData(prev => ({
      ...prev,
      actions: prev.actions.includes(action) 
        ? prev.actions.filter((a) => a !== action) 
        : [...prev.actions, action]
    }));
  };

  const toggleResource = (res: Resource) => {
    if (!!permission) return; 
    setFormData(prev => ({
      ...prev,
      resources: prev.resources.includes(res) 
        ? prev.resources.filter((r) => r !== res) 
        : [...prev.resources, res]
    }));
  };

  const selectAllActions = () => {
    const allSelected = formData.actions.length === ACTIONS.length;
    setFormData(prev => ({ ...prev, actions: allSelected ? [] : [...ACTIONS] }));
  };

  const selectAllResources = () => {
    if (!!permission) return;
    const allSelected = formData.resources.length === RESOURCES.length;
    setFormData(prev => ({ ...prev, resources: allSelected ? [] : [...RESOURCES] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.resources.length === 0 || formData.actions.length === 0) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Missing Data", message: "Select at least one resource and one action." });
      return;
    }

    setIsSubmitting(true);
    try {
      const requests = formData.resources.map(resource => 
        fetch("/api/myorg", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: formData.role,
            resource,
            actions: formData.actions
          }),
        })
      );

      const results = await Promise.all(requests);
      if (results.some(res => !res.ok)) throw new Error("Some operations failed.");
      
      dispatch({ 
        kind: "TOAST", 
        type: "SUCCESS", 
        title: "Success", 
        message: `Permissions configured for ${formData.role}.` 
      });
      onRefresh();
      closePanel();
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Error", message: err.message });
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
            <Shield className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest truncate">
              {permission ? "Modify Permission" : "Define Permission"}
            </h2>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 uppercase font-bold tracking-tight">
            Role-Based Access Control
          </p>
        </div>
        <div className="flex items-center gap-1 ml-4">
          <button 
            onClick={toggleFullScreen} 
            className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            title={isFullScreen ? "Minimize" : "Maximize"}
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button 
            onClick={closePanel} 
            className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className={`p-4 ${isFullScreen ? 'md:p-8' : 'md:p-5'} space-y-6`}>
          <form id="perm-form" onSubmit={handleSubmit} className="space-y-6">
            
            {/* Role Select - Enhanced for Enterprise visibility */}
            <div className="w-full md:w-2/3">
            <label 
                htmlFor="role-select" 
                className={`block ${textSize} font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5`}
            >
                Target Role <span className="text-indigo-500/80">*</span>
            </label>
            <div className="relative group">
                <select 
                id="role-select"
                disabled={!!permission} 
                value={formData.role} 
                onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })} 
                className={`
                    w-full appearance-none cursor-pointer rounded-md px-3 py-2
                    text-[13px] font-semibold outline-none transition-all
                    /* Light Mode: Subtle grey border, slight lift on hover */
                    bg-slate-50 border border-slate-200 text-slate-900 
                    hover:border-slate-300 focus:bg-white focus:border-indigo-500/50
                    /* Dark Mode: Deep slate background, low-profile border */
                    dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100
                    dark:hover:border-slate-700 dark:focus:bg-slate-900 dark:focus:border-indigo-500/40
                    /* Disabled: Flat and muted */
                    disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900 
                    disabled:cursor-not-allowed disabled:border-transparent
                `}
                >
                {ROLES.map((r) => (
                    <option key={r} value={r} className="bg-white dark:bg-slate-950 text-slate-900 dark:text-white">
                    {r}
                    </option>
                ))}
                </select>
                
                {/* Minimalist Arrow - No divider, just a clean icon */}
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <ChevronDown 
                    className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-400 transition-colors" 
                />
                </div>
            </div>
            </div>

            {/* Resources Section */}
            <div className="pt-2">
              <div className="flex justify-between items-center mb-3">
                <label className={`block ${textSize} font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest`}>
                  Target Resources
                </label>
                {!permission && (
                  <button type="button" onClick={selectAllResources} className={`${textSize} font-bold text-indigo-600 dark:text-indigo-400 uppercase hover:underline`}>
                    {formData.resources.length === RESOURCES.length ? "Deselect All" : "Select All"}
                  </button>
                )}
              </div>
              <div className={`grid grid-cols-2 ${isFullScreen ? 'md:grid-cols-4' : 'md:grid-cols-3'} ${gridGap}`}>
                {RESOURCES.map((res) => {
                  const isSelected = formData.resources.includes(res);
                  return (
                    <button
                      key={res}
                      type="button"
                      disabled={!!permission && !isSelected}
                      onClick={() => toggleResource(res)}
                      className={`flex items-center gap-2 p-2.5 rounded-md border text-left transition-all ${
                        isSelected 
                          ? "bg-indigo-50 border-indigo-300 dark:bg-indigo-500/10 dark:border-indigo-500/50 shadow-sm" 
                          : "bg-white border-slate-200 dark:bg-slate-950 dark:border-slate-800 opacity-70 hover:opacity-100 hover:border-slate-300"
                      }`}
                    >
                      {isFullScreen && (
                        <div className={`shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded border ${isSelected ? "bg-indigo-600 border-indigo-600" : "bg-transparent border-slate-300 dark:border-slate-600"}`}>
                          {isSelected && <CheckSquare className="w-2.5 h-2.5 text-white" />}
                        </div>
                      )}
                      <span className={`${textSize} font-bold uppercase tracking-tight truncate ${isSelected ? "text-indigo-700 dark:text-indigo-400" : "text-slate-500"}`}>
                        {res}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions Section */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex justify-between items-center mb-3">
                <label className={`block ${textSize} font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest`}>
                  Allowed Actions
                </label>
                <button type="button" onClick={selectAllActions} className={`${textSize} font-bold text-indigo-600 dark:text-indigo-400 uppercase hover:underline`}>
                   {formData.actions.length === ACTIONS.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className={`grid grid-cols-2 ${isFullScreen ? 'md:grid-cols-4' : 'md:grid-cols-3'} ${gridGap}`}>
                {ACTIONS.map((action) => {
                  const isSelected = formData.actions.includes(action);
                  return (
                    <button
                      key={action}
                      type="button"
                      onClick={() => toggleAction(action)}
                      className={`flex items-center gap-2 p-2.5 rounded-md border text-left transition-all ${
                        isSelected 
                          ? "bg-emerald-50 border-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/50 shadow-sm" 
                          : "bg-white border-slate-200 dark:bg-slate-950 dark:border-slate-800 hover:border-slate-300"
                      }`}
                    >
                      {isFullScreen && (
                        <div className={`shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded border ${isSelected ? "bg-emerald-600 border-emerald-600" : "bg-transparent border-slate-300 dark:border-slate-600"}`}>
                          {isSelected && <CheckSquare className="w-2.5 h-2.5 text-white" />}
                        </div>
                      )}
                      <span className={`${textSize} font-bold uppercase tracking-tight ${isSelected ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500"}`}>
                        {action}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Footer Actions */}
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
          form="perm-form" 
          disabled={isSubmitting} 
          aria-busy={isSubmitting}
          className={`flex items-center gap-2 px-6 py-2.5 ${textSize} font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all uppercase tracking-widest disabled:opacity-70 shadow-lg shadow-indigo-500/20 active:scale-[0.98]`}
        >
          {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Policy
        </button>
      </div>
    </div>
  );
}