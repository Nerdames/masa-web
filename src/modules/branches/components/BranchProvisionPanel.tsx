"use client";

import React, { useState, useEffect } from "react";
import {
  X, Maximize2, Minimize2, Save, Loader2,
  Building2, MapPin, ShieldCheck, 
  Globe, Info
} from "lucide-react";
import { useSidePanel } from "@/shared/components/layout/SidePanelContext";
import { useAlerts } from "@/shared/components/feedback/AlertProvider";
import { usePermission } from "@/shared/hooks/usePermission";
import { PermissionAction, Resource } from "@prisma/client";

/* -------------------------------------------------------------------------- */
/* TYPES & INTERFACES                                                         */
/* -------------------------------------------------------------------------- */

interface IBranch {
  id: string;
  name: string;
  location?: string | null;
  active: boolean;
}

interface BranchProvisionPanelProps {
  branch?: IBranch | null; // Null for new provisioning, object for updates
  organizationId: string;
  onClose: () => void;
  onSuccess: () => void;
}

/* -------------------------------------------------------------------------- */
/* CONSTANTS & STYLES (Production Standard)                                   */
/* -------------------------------------------------------------------------- */

const inputClass = `
  w-full border border-slate-200 dark:border-slate-700 rounded-md text-xs p-2.5
  bg-white dark:bg-slate-950 text-slate-900 dark:text-white
  focus:ring-1 focus:ring-blue-500 outline-none transition-all
  placeholder:text-slate-400 disabled:opacity-50 disabled:bg-slate-50
`;

const labelClass = "block text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5";

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export function BranchProvisionPanel({
  branch,
  organizationId,
  onClose,
  onSuccess
}: BranchProvisionPanelProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  const { can, canSee } = usePermission();

  // RBAC Integrity: Ensure user has rights to manage infrastructure [cite: 13, 64]
  const canSave = branch
    ? can(PermissionAction.UPDATE, Resource.BRANCH)
    : can(PermissionAction.CREATE, Resource.BRANCH);

  const canAudit = canSee(Resource.AUDIT);

  // Form State (Aligned with MASA Schema [cite: 441])
  const [formData, setFormData] = useState({
    name: branch?.name || "",
    location: branch?.location || "",
    active: branch ? branch.active : true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-focus logic for better UX
  useEffect(() => {
    const firstInput = document.getElementById("branch-name");
    firstInput?.focus();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    if (!formData.name.trim()) {
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Validation Error",
        message: "A unique branch identity name is required.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint = branch ? `/api/branches/${branch.id}` : "/api/branches";
      const method = branch ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          organizationId,
        }),
      });

      const result = await res.json();

      if (!res.ok) throw new Error(result?.error || "Deployment failed");

      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: branch ? "Node Updated" : "Node Initialized",
        message: `Successfully ${branch ? "updated" : "deployed"} ${formData.name} to the MASA network.`,
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Infrastructure Error",
        message: error.message || "An unexpected error occurred during provisioning.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden">
      {/* Header: Forensic Branding & Window Controls [cite: 58] */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-blue-500/10 rounded-lg">
            <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-800 dark:text-slate-200">
              {branch ? "Modify Operational Node" : "Provision New Node"}
            </h2>
            <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-medium">
              <Globe className="w-2.5 h-2.5" />
              <span>Network Infrastructure v2.6</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={toggleFullScreen}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 transition-colors"
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Body: Responsive Layout [cite: 101, 107] */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <form id="branch-form" onSubmit={handleSave} className="p-5 space-y-6">
          
          {/* Section 1: Core Identity */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-50 dark:border-slate-800/50">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Identity & Governance</span>
            </div>
            
            <div className={`grid gap-4 ${isFullScreen ? "grid-cols-2" : "grid-cols-1"}`}>
              <div className="space-y-1">
                <label htmlFor="branch-name" className={labelClass}>
                  Branch Identity Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="branch-name"
                    required
                    disabled={!canSave || isSubmitting}
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g. Victoria Island HQ"
                    className={`${inputClass} pl-8`}
                  />
                  <Building2 className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Operational Status</label>
                <div className="flex items-center h-9 px-3 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-200 dark:border-slate-700">
                  <label className="flex items-center gap-3 cursor-pointer w-full">
                    <input
                      type="checkbox"
                      disabled={!canSave}
                      checked={formData.active}
                      onChange={e => setFormData({...formData, active: e.target.checked})}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Enable Live Transactions
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Localization */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-50 dark:border-slate-800/50">
              <MapPin className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Geographic Marker</span>
            </div>
            
            <div className="space-y-1">
              <label className={labelClass}>Physical Address / Regional Logistics</label>
              <textarea
                disabled={!canSave}
                value={formData.location}
                onChange={e => setFormData({...formData, location: e.target.value})}
                rows={3}
                className={`${inputClass} resize-none`}
                placeholder="Specify street address or logistics hub details..."
              />
            </div>
          </section>

          {/* Section 3: Audit & Info (Conditional Content) */}
          {canAudit && (
            <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-lg flex gap-3">
              <Info className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-tighter">Forensic Note</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Provisioning a new node will automatically initialize associated stock ledgers and financial audit trails. This action is recorded in the immutable activity log.
                </p>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Footer: Standardized Action Bar [cite: 104, 115] */}
      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end items-center gap-2 shrink-0">
        <button 
          type="button" 
          onClick={onClose} 
          disabled={isSubmitting}
          className="px-3 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-800 dark:hover:text-slate-300 transition-colors"
        >
          Close
        </button>
        {canSave && (
          <button 
            type="submit" 
            form="branch-form" 
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-[9px] font-bold uppercase tracking-widest rounded-md hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            <span>{branch ? "Commit Changes" : "Initialize Node"}</span>
          </button>
        )}
      </div>
    </div>
  );
}